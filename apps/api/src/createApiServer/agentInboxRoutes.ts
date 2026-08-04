import { findAgentRosterRole } from "../agentRoster";
import { MAX_CHANNEL_MESSAGE_LENGTH } from "../terminalRuntime/channelMessaging";
import type { ApiRouteHandler } from "./routeHelpers";
import { readJsonBodyOrWriteError, writeJson, writeMethodNotAllowed } from "./routeHelpers";

const AGENT_INBOX_PATTERN = /^\/api\/agents\/([^/]+)\/inbox$/;

export const handleAgentInboxRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { runtime },
) => {
  const match = requestUrl.pathname.match(AGENT_INBOX_PATTERN);
  if (!match) return false;

  const agentId = decodeURIComponent(match[1] ?? "");
  const role = findAgentRosterRole(agentId);
  if (!role) {
    writeJson(response, 404, { error: "Agent role not found." }, corsOrigin);
    return true;
  }

  if (request.method === "GET") {
    writeJson(
      response,
      200,
      { agentId, messages: runtime.listAgentInboxMessages(agentId) },
      corsOrigin,
    );
    return true;
  }

  if (request.method !== "POST") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const bodyResult = await readJsonBodyOrWriteError(request, response, corsOrigin);
  if (!bodyResult.ok) return true;
  const body = bodyResult.payload as Record<string, unknown> | null;
  const fromTerminalId =
    body && typeof body.fromTerminalId === "string" ? body.fromTerminalId.trim() : "";
  const content = body && typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    writeJson(response, 400, { error: "Message content cannot be empty." }, corsOrigin);
    return true;
  }
  if (content.length > MAX_CHANNEL_MESSAGE_LENGTH) {
    writeJson(
      response,
      400,
      { error: `Message content must be ${MAX_CHANNEL_MESSAGE_LENGTH} characters or fewer.` },
      corsOrigin,
    );
    return true;
  }

  let source: Parameters<typeof runtime.enqueueAgentInboxMessage>[2] = { from: "operator" };
  if (fromTerminalId && fromTerminalId !== "operator") {
    const capabilityHeader = request.headers["x-octogent-terminal-capability"];
    const capability = typeof capabilityHeader === "string" ? capabilityHeader.trim() : "";
    if (!runtime.verifyTerminalChannelSender(fromTerminalId, capability)) {
      runtime.appendAuditEvent("channel.message_rejected", {
        payload: { fromTerminalId, agentId, reason: "missing_or_invalid_sender_capability" },
      });
      writeJson(
        response,
        403,
        { error: "Agent role messages require the sending terminal's active local capability." },
        corsOrigin,
      );
      return true;
    }

    const sender = runtime
      .listTerminalSnapshots()
      .find((snapshot) => snapshot.terminalId === fromTerminalId);
    if (!sender?.agentId) {
      runtime.appendAuditEvent("channel.message_rejected", {
        terminalId: fromTerminalId,
        payload: { agentId, reason: "sender_not_bound_to_permanent_role" },
      });
      writeJson(
        response,
        403,
        { error: "Agent role messages require a terminal bound to a permanent role." },
        corsOrigin,
      );
      return true;
    }

    source = { from: "agent", fromTerminalId, fromAgentId: sender.agentId };
  }

  const message = runtime.enqueueAgentInboxMessage(agentId, content, source);
  const terminal = runtime
    .listTerminalSnapshots()
    .filter(
      (snapshot) =>
        snapshot.agentId === agentId &&
        snapshot.state === "live" &&
        snapshot.agentRuntimeState === "idle",
    )
    .sort((left, right) => left.terminalId.localeCompare(right.terminalId))[0];
  if (terminal) {
    runtime.deliverAgentInboxMessages(terminal.terminalId);
  }
  const updated = runtime
    .listAgentInboxMessages(agentId)
    .find((candidate) => candidate.messageId === message.messageId);
  writeJson(response, 201, updated ?? message, corsOrigin);
  return true;
};
