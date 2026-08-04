import { createMemoryStore } from "../memoryStore";
import type { ApiRouteHandler } from "./routeHelpers";
import { readJsonBodyOrWriteError, writeJson, writeMethodNotAllowed } from "./routeHelpers";

export const handleMemoryRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { projectStateDir, runtime },
) => {
  if (requestUrl.pathname !== "/api/memory") {
    return false;
  }

  const memoryStore = createMemoryStore(projectStateDir);

  if (request.method === "GET") {
    const query = requestUrl.searchParams.get("query")?.trim() ?? "";
    const tentacleId = requestUrl.searchParams.get("tentacleId")?.trim() || undefined;
    const memoryScope: { tentacleId?: string } = {};
    if (tentacleId) {
      memoryScope.tentacleId = tentacleId;
    }
    const entries = query
      ? memoryStore.search({ query, ...memoryScope })
      : memoryStore.list(memoryScope);
    runtime.appendAuditEvent("memory.searched", {
      payload: {
        query,
        tentacleId: tentacleId ?? null,
        resultCount: entries.length,
      },
    });
    writeJson(response, 200, { entries }, corsOrigin);
    return true;
  }

  if (request.method !== "POST") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const bodyReadResult = await readJsonBodyOrWriteError(request, response, corsOrigin);
  if (!bodyReadResult.ok) {
    return true;
  }

  try {
    const entry = memoryStore.create(
      typeof bodyReadResult.payload === "object" && bodyReadResult.payload !== null
        ? bodyReadResult.payload
        : {},
    );
    runtime.appendAuditEvent("memory.created", {
      payload: {
        memoryId: entry.id,
        type: entry.type,
        source: entry.source,
        tags: entry.tags,
        tentacleId: entry.tentacleId ?? null,
      },
    });
    writeJson(response, 201, entry, corsOrigin);
    return true;
  } catch (error) {
    writeJson(
      response,
      400,
      { error: error instanceof Error ? error.message : "Invalid memory." },
      corsOrigin,
    );
    return true;
  }
};
