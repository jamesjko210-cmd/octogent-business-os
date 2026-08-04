import { createAgentActivityStore } from "../agentActivityStore";
import { listAgentRoster } from "../agentRoster";
import { createSwarmRegistryStore, listSwarmRegistry } from "../swarmRegistry";
import type { ApiRouteHandler } from "./routeHelpers";
import { readJsonBodyOrWriteError, writeJson, writeMethodNotAllowed } from "./routeHelpers";

const SWARM_ITEM_PATTERN = /^\/api\/swarms\/([^/]+)$/;

export const handleSwarmRegistryRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { projectStateDir, runtime },
) => {
  if (requestUrl.pathname !== "/api/swarms") return false;
  const agents = listAgentRoster(
    runtime.listTerminalSnapshots(),
    createAgentActivityStore(projectStateDir).read(),
  );
  const store = createSwarmRegistryStore(projectStateDir);
  if (request.method === "GET") {
    const swarms = listSwarmRegistry(agents, store.list());
    runtime.appendAuditEvent("swarm_registry.loaded", {
      payload: {
        count: swarms.length,
        working: swarms.filter((swarm) => swarm.state === "working").length,
      },
    });
    writeJson(response, 200, { swarms }, corsOrigin);
    return true;
  }
  if (request.method !== "POST") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }
  const body = await readJsonBodyOrWriteError(request, response, corsOrigin);
  if (!body.ok) return true;
  try {
    const swarm = store.create(body.payload, agents);
    runtime.appendAuditEvent("swarm_registry.created", {
      payload: { swarmId: swarm.id, roleCount: swarm.agentIds.length },
    });
    writeJson(response, 201, { swarm }, corsOrigin);
  } catch (error) {
    writeJson(
      response,
      400,
      { error: error instanceof Error ? error.message : "Invalid swarm." },
      corsOrigin,
    );
  }
  return true;
};

export const handleSwarmRegistryItemRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { projectStateDir, runtime },
) => {
  const match = requestUrl.pathname.match(SWARM_ITEM_PATTERN);
  if (!match) return false;
  const encodedSwarmId = match[1];
  if (!encodedSwarmId) return false;
  if (request.method !== "DELETE") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  let swarmId = "";
  try {
    swarmId = decodeURIComponent(encodedSwarmId);
  } catch {
    writeJson(response, 400, { error: "Invalid swarm ID." }, corsOrigin);
    return true;
  }

  try {
    const swarm = createSwarmRegistryStore(projectStateDir).remove(swarmId);
    runtime.appendAuditEvent("swarm_registry.removed", {
      payload: { swarmId: swarm.id, roleCount: swarm.agentIds.length },
    });
    writeJson(response, 200, { swarmId: swarm.id }, corsOrigin);
  } catch (error) {
    writeJson(
      response,
      400,
      { error: error instanceof Error ? error.message : "Unable to remove project swarm." },
      corsOrigin,
    );
  }
  return true;
};
