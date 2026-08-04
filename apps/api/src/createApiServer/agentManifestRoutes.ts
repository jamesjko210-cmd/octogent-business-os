import { evaluateAgentManifest, listAgentManifests } from "../agentManifests";
import type { ApiRouteHandler } from "./routeHelpers";
import { readJsonBodyOrWriteError, writeJson, writeMethodNotAllowed } from "./routeHelpers";

export const handleAgentManifestsRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { runtime },
) => {
  if (requestUrl.pathname !== "/api/agent-manifests") {
    return false;
  }

  if (request.method !== "GET") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const manifests = listAgentManifests();
  runtime.appendAuditEvent("agent_manifests.loaded", {
    payload: { count: manifests.length, ids: manifests.map((manifest) => manifest.agentId) },
  });
  writeJson(response, 200, { manifests }, corsOrigin);
  return true;
};

export const handleAgentManifestEvaluateRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { runtime },
) => {
  if (requestUrl.pathname !== "/api/agent-manifests/evaluate") {
    return false;
  }

  if (request.method !== "POST") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const bodyReadResult = await readJsonBodyOrWriteError(request, response, corsOrigin);
  if (!bodyReadResult.ok) {
    return true;
  }

  const payload =
    typeof bodyReadResult.payload === "object" && bodyReadResult.payload !== null
      ? (bodyReadResult.payload as Record<string, unknown>)
      : {};
  const agentId = typeof payload.agentId === "string" ? payload.agentId.trim() : "";
  const actionType = typeof payload.actionType === "string" ? payload.actionType.trim() : "";
  const content = typeof payload.content === "string" ? payload.content.trim() : "";

  if (!agentId || !actionType) {
    writeJson(response, 400, { error: "agentId and actionType are required." }, corsOrigin);
    return true;
  }

  const evaluation = evaluateAgentManifest({ agentId, actionType, content });
  if (!evaluation) {
    writeJson(response, 404, { error: "Agent manifest not found." }, corsOrigin);
    return true;
  }

  runtime.appendAuditEvent("agent_manifest.evaluated", {
    payload: {
      agentId,
      actionType,
      decision: evaluation.decision,
      matchedPolicyIds: evaluation.matchedPolicies.map((policy) => policy.id),
    },
  });
  writeJson(response, 200, evaluation, corsOrigin);
  return true;
};
