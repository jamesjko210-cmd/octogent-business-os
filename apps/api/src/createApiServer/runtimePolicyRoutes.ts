import { evaluateRuntimePolicy, listRuntimePolicies } from "../runtimePolicies";
import type { ApiRouteHandler } from "./routeHelpers";
import { readJsonBodyOrWriteError, writeJson, writeMethodNotAllowed } from "./routeHelpers";

export const handleRuntimePoliciesRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { runtime },
) => {
  if (requestUrl.pathname !== "/api/runtime-policies") {
    return false;
  }

  if (request.method !== "GET") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const policies = listRuntimePolicies();
  runtime.appendAuditEvent("runtime_policies.loaded", {
    payload: { count: policies.length, ids: policies.map((policy) => policy.id) },
  });
  writeJson(response, 200, { policies }, corsOrigin);
  return true;
};

export const handleRuntimePolicyEvaluateRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { runtime },
) => {
  if (requestUrl.pathname !== "/api/runtime-policies/evaluate") {
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
  const actionType = typeof payload.actionType === "string" ? payload.actionType.trim() : "";
  const content = typeof payload.content === "string" ? payload.content.trim() : "";
  if (!actionType) {
    writeJson(response, 400, { error: "actionType is required." }, corsOrigin);
    return true;
  }

  const evaluation = evaluateRuntimePolicy({ actionType, content });
  runtime.appendAuditEvent("runtime_policy.evaluated", {
    payload: {
      actionType,
      decision: evaluation.decision,
      matchedPolicyIds: evaluation.matchedPolicies.map((policy) => policy.id),
    },
  });
  writeJson(response, 200, evaluation, corsOrigin);
  return true;
};
