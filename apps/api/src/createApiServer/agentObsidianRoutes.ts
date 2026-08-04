import { findAgentRosterRole } from "../agentRoster";
import {
  appendObsidianRoleUpdate,
  appendObsidianSharedTimelineUpdate,
  searchObsidianSharedNotes,
} from "../obsidianVault";
import type { ApiRouteHandler } from "./routeHelpers";
import { readJsonBodyOrWriteError, writeJson, writeMethodNotAllowed } from "./routeHelpers";

const AGENT_OBSIDIAN_PATTERN = /^\/api\/agents\/([^/]+)\/obsidian$/;

export const handleAgentObsidianRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { runtime, obsidianVaultPath },
) => {
  const match = requestUrl.pathname.match(AGENT_OBSIDIAN_PATTERN);
  if (!match) return false;
  if (request.method !== "POST" && request.method !== "GET") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const agentId = decodeURIComponent(match[1] ?? "");
  const role = findAgentRosterRole(agentId);
  if (!role) {
    writeJson(response, 404, { error: "Agent role not found." }, corsOrigin);
    return true;
  }

  const bodyReadResult =
    request.method === "POST"
      ? await readJsonBodyOrWriteError(request, response, corsOrigin)
      : { ok: true as const, payload: {} };
  if (!bodyReadResult.ok) return true;
  const payload =
    typeof bodyReadResult.payload === "object" && bodyReadResult.payload !== null
      ? (bodyReadResult.payload as Record<string, unknown>)
      : {};
  const terminalId =
    request.method === "GET"
      ? requestUrl.searchParams.get("terminalId")?.trim() || ""
      : typeof payload.terminalId === "string"
        ? payload.terminalId.trim()
        : "";
  const content = typeof payload.content === "string" ? payload.content : "";
  const target = payload.target === "shared" ? "shared" : "role";
  const capabilityHeader = request.headers["x-octogent-terminal-capability"];
  const capability = typeof capabilityHeader === "string" ? capabilityHeader.trim() : "";
  const terminal = runtime
    .listTerminalSnapshots()
    .find((snapshot) => snapshot.terminalId === terminalId);

  if (
    !terminalId ||
    !runtime.verifyTerminalChannelSender(terminalId, capability) ||
    terminal?.agentId !== agentId ||
    terminal?.tentacleId !== role.tentacleId ||
    terminal?.agentProvider !== role.preferredProvider ||
    terminal.lifecycleState !== "running" ||
    terminal.state !== "live"
  ) {
    runtime.appendAuditEvent(
      request.method === "GET" ? "obsidian.search_rejected" : "obsidian.update_rejected",
      {
        ...(terminalId ? { terminalId } : {}),
        payload: { agentId, reason: "missing_or_invalid_role_terminal_capability" },
      },
    );
    writeJson(
      response,
      403,
      {
        error: "Obsidian access requires the matching live role terminal and its local capability.",
      },
      corsOrigin,
    );
    return true;
  }

  if (request.method === "GET") {
    const query = requestUrl.searchParams.get("query")?.trim() ?? "";
    try {
      const results = searchObsidianSharedNotes({ vaultPath: obsidianVaultPath, query });
      runtime.appendAuditEvent("obsidian.searched", {
        terminalId,
        payload: { agentId, queryLength: query.length, resultCount: results.length },
      });
      writeJson(response, 200, { results }, corsOrigin);
      return true;
    } catch (error) {
      runtime.appendAuditEvent("obsidian.search_rejected", {
        terminalId,
        payload: { agentId, reason: "invalid_or_unavailable_search" },
      });
      writeJson(
        response,
        400,
        { error: error instanceof Error ? error.message : "Unable to search Obsidian memory." },
        corsOrigin,
      );
      return true;
    }
  }

  try {
    const update =
      target === "shared"
        ? appendObsidianSharedTimelineUpdate({ vaultPath: obsidianVaultPath, agentId, content })
        : appendObsidianRoleUpdate({ vaultPath: obsidianVaultPath, agentId, content });
    runtime.appendAuditEvent("obsidian.update_appended", {
      terminalId,
      payload: {
        agentId,
        target,
        relativePath: update.relativePath,
        contentLength: update.contentLength,
      },
    });
    writeJson(response, 201, update, corsOrigin);
    return true;
  } catch (error) {
    writeJson(
      response,
      400,
      { error: error instanceof Error ? error.message : "Unable to append an Obsidian update." },
      corsOrigin,
    );
    return true;
  }
};
