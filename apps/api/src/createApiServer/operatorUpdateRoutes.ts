import { findAgentRosterRole } from "../agentRoster";
import { normalizeChannelContent } from "../terminalRuntime/channelMessaging";
import { MAX_OPERATOR_UPDATE_LENGTH } from "../terminalRuntime/operatorUpdates";
import type { ApiRouteHandler } from "./routeHelpers";
import { readJsonBodyOrWriteError, writeJson, writeMethodNotAllowed } from "./routeHelpers";

const OPERATOR_UPDATE_PATTERN = /^\/api\/agents\/([^/]+)\/operator-updates$/;
const ALL_OPERATOR_UPDATES_PATH = "/api/operator-updates";

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const handleOperatorUpdatesRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { runtime },
) => {
  if (requestUrl.pathname === ALL_OPERATOR_UPDATES_PATH) {
    if (request.method !== "GET") {
      writeMethodNotAllowed(response, corsOrigin);
      return true;
    }
    writeJson(response, 200, { updates: runtime.listOperatorUpdates({ limit: 20 }) }, corsOrigin);
    return true;
  }

  const match = requestUrl.pathname.match(OPERATOR_UPDATE_PATTERN);
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
      { agentId, updates: runtime.listOperatorUpdates({ agentId }) },
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
  const body = asRecord(bodyResult.payload);
  const terminalId = typeof body.terminalId === "string" ? body.terminalId.trim() : "";
  const sourceContent = typeof body.content === "string" ? body.content : "";
  const content = normalizeChannelContent(sourceContent).slice(0, MAX_OPERATOR_UPDATE_LENGTH);

  if (!terminalId || !content) {
    writeJson(
      response,
      400,
      { error: "terminalId and a concise update are required." },
      corsOrigin,
    );
    return true;
  }
  if (sourceContent.trim().length > MAX_OPERATOR_UPDATE_LENGTH) {
    writeJson(
      response,
      400,
      { error: `Updates must be ${MAX_OPERATOR_UPDATE_LENGTH} characters or fewer.` },
      corsOrigin,
    );
    return true;
  }

  const terminal = runtime
    .listTerminalSnapshots()
    .find((snapshot) => snapshot.terminalId === terminalId);
  const terminalMatchesRole =
    terminal &&
    terminal.agentId === role.id &&
    terminal.tentacleId === role.tentacleId &&
    terminal.agentProvider === role.preferredProvider &&
    terminal.lifecycleState === "running" &&
    terminal.state === "live";
  if (!terminalMatchesRole) {
    writeJson(
      response,
      409,
      { error: "Operator updates require a live terminal scoped to this agent role." },
      corsOrigin,
    );
    return true;
  }

  const capabilityHeader = request.headers["x-octogent-terminal-capability"];
  const capability = typeof capabilityHeader === "string" ? capabilityHeader.trim() : "";
  if (!runtime.verifyTerminalChannelSender(terminalId, capability)) {
    runtime.appendAuditEvent("agent_operator_update.rejected", {
      terminalId,
      payload: { agentId, reason: "missing_or_invalid_terminal_capability" },
    });
    writeJson(
      response,
      403,
      { error: "Operator updates require the matching terminal's private local capability." },
      corsOrigin,
    );
    return true;
  }

  const update = runtime.createOperatorUpdate({ agentId, terminalId, content });
  writeJson(response, 201, { update }, corsOrigin);
  return true;
};
