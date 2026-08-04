import { createAgentActivityStore } from "../agentActivityStore";
import type { AgentActivityStatus } from "../agentRoster";
import { findAgentRosterRole } from "../agentRoster";
import { normalizeChannelContent } from "../terminalRuntime/channelMessaging";
import type { ApiRouteHandler } from "./routeHelpers";
import { readJsonBodyOrWriteError, writeJson, writeMethodNotAllowed } from "./routeHelpers";

const AGENT_ACTIVITY_PATTERN = /^\/api\/agents\/([^/]+)\/activity$/;
const ACTIVITY_STATUSES = new Set<AgentActivityStatus>([
  "planning",
  "researching",
  "implementing",
  "testing",
  "reviewing",
  "waiting",
]);

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const handleAgentActivityRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { projectStateDir, runtime },
) => {
  const match = requestUrl.pathname.match(AGENT_ACTIVITY_PATTERN);
  if (!match) return false;

  const agentId = decodeURIComponent(match[1] ?? "");
  const role = findAgentRosterRole(agentId);
  if (!role) {
    writeJson(response, 404, { error: "Agent role not found." }, corsOrigin);
    return true;
  }

  const store = createAgentActivityStore(projectStateDir);
  if (request.method === "GET") {
    const activity = store.read().get(agentId) ?? null;
    runtime.appendAuditEvent("agent_activity.loaded", {
      payload: { agentId, found: activity !== null },
    });
    writeJson(response, 200, { activity }, corsOrigin);
    return true;
  }

  if (request.method !== "PUT") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const bodyReadResult = await readJsonBodyOrWriteError(request, response, corsOrigin);
  if (!bodyReadResult.ok) return true;
  const payload = asRecord(bodyReadResult.payload);
  const terminalId = typeof payload.terminalId === "string" ? payload.terminalId.trim() : "";
  const status = typeof payload.status === "string" ? payload.status : "";
  const summary =
    typeof payload.summary === "string"
      ? normalizeChannelContent(payload.summary).slice(0, 280)
      : "";

  if (!terminalId || !ACTIVITY_STATUSES.has(status as AgentActivityStatus) || !summary) {
    writeJson(
      response,
      400,
      { error: "terminalId, a valid status, and a concise summary are required." },
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
      { error: "Activity updates require a live terminal scoped to this agent role." },
      corsOrigin,
    );
    return true;
  }

  const capabilityHeader = request.headers["x-octogent-terminal-capability"];
  const capability = typeof capabilityHeader === "string" ? capabilityHeader.trim() : "";
  if (!runtime.verifyTerminalChannelSender(terminalId, capability)) {
    runtime.appendAuditEvent("agent_activity.rejected", {
      terminalId,
      payload: { agentId, reason: "missing_or_invalid_terminal_capability" },
    });
    writeJson(
      response,
      403,
      { error: "Activity updates require the matching terminal's private local capability." },
      corsOrigin,
    );
    return true;
  }

  const activity = store.update({
    agentId,
    terminalId,
    status: status as AgentActivityStatus,
    summary,
  });
  runtime.appendAuditEvent("agent_activity.updated", {
    terminalId,
    payload: { agentId, status: activity.status },
  });
  writeJson(response, 200, { activity }, corsOrigin);
  return true;
};
