import { createAgentActivityStore } from "../agentActivityStore";
import { findAgentManifest } from "../agentManifests";
import { listAgentRoster } from "../agentRoster";
import type { ApiRouteHandler } from "./routeHelpers";
import { writeJson, writeMethodNotAllowed } from "./routeHelpers";

export const handleAgentRosterRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { projectStateDir, runtime },
) => {
  if (requestUrl.pathname !== "/api/agents") {
    return false;
  }

  if (request.method !== "GET") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const agents = listAgentRoster(
    runtime.listTerminalSnapshots(),
    createAgentActivityStore(projectStateDir).read(),
  ).map((agent) => {
    const manifest = findAgentManifest(agent.id);
    return {
      ...agent,
      executionScope: manifest
        ? {
            workspaceMode: manifest.scope.workspaceMode,
            allowedTools: manifest.scope.allowedTools,
          }
        : null,
    };
  });
  runtime.appendAuditEvent("agent_roster.loaded", {
    payload: {
      count: agents.length,
      working: agents.filter((agent) => agent.state === "working").length,
    },
  });
  writeJson(response, 200, { agents }, corsOrigin);
  return true;
};
