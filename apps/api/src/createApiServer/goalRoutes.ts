import type { Goal, GoalStatus } from "@octogent/core";
import { findAgentRosterRole } from "../agentRoster";
import { createGoalStore } from "../goalStore";
import type { ApiRouteHandler } from "./routeHelpers";
import { readJsonBodyOrWriteError, writeJson, writeMethodNotAllowed } from "./routeHelpers";

const GOAL_STATUSES = new Set<GoalStatus>([
  "planned",
  "active",
  "blocked",
  "needs_review",
  "completed",
  "cancelled",
]);

const GOAL_ITEM_PATTERN = /^\/api\/goals\/([^/]+)$/;

export const handleGoalsRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { projectStateDir, runtime },
) => {
  if (requestUrl.pathname !== "/api/goals") {
    return false;
  }

  const goalStore = createGoalStore(projectStateDir);

  if (request.method === "GET") {
    const tentacleId = requestUrl.searchParams.get("tentacleId")?.trim() || undefined;
    const rawStatus = requestUrl.searchParams.get("status")?.trim();
    const status =
      rawStatus && GOAL_STATUSES.has(rawStatus as GoalStatus)
        ? (rawStatus as GoalStatus)
        : undefined;
    const goalFilters: { tentacleId?: string; status?: GoalStatus } = {};
    if (tentacleId) {
      goalFilters.tentacleId = tentacleId;
    }
    if (status) {
      goalFilters.status = status;
    }
    const goals = goalStore.list(goalFilters);
    runtime.appendAuditEvent("goals.listed", {
      payload: { tentacleId: tentacleId ?? null, status: status ?? null, count: goals.length },
    });
    writeJson(response, 200, { goals }, corsOrigin);
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
    const payload =
      typeof bodyReadResult.payload === "object" && bodyReadResult.payload !== null
        ? (bodyReadResult.payload as Record<string, unknown>)
        : {};
    const ownerAgentId =
      typeof payload.ownerAgentId === "string" ? payload.ownerAgentId.trim() : "";
    const owner = ownerAgentId ? findAgentRosterRole(ownerAgentId) : null;
    if (ownerAgentId && !owner) {
      writeJson(response, 400, { error: "Goal owner must be a permanent agent role." }, corsOrigin);
      return true;
    }
    if (
      owner &&
      typeof payload.tentacleId === "string" &&
      payload.tentacleId.trim() &&
      payload.tentacleId.trim() !== owner.tentacleId
    ) {
      writeJson(
        response,
        400,
        { error: "A goal owner must use that role's assigned tentacle." },
        corsOrigin,
      );
      return true;
    }
    const goal = goalStore.create(
      owner ? { ...payload, ownerAgentId: owner.id, tentacleId: owner.tentacleId } : payload,
    );
    runtime.appendAuditEvent("goal.created", {
      payload: {
        goalId: goal.id,
        title: goal.title,
        priority: goal.priority,
        tentacleId: goal.tentacleId ?? null,
        ownerAgentId: goal.ownerAgentId ?? null,
      },
    });
    writeJson(response, 201, goal, corsOrigin);
    return true;
  } catch (error) {
    writeJson(
      response,
      400,
      { error: error instanceof Error ? error.message : "Invalid goal." },
      corsOrigin,
    );
    return true;
  }
};

export const handleGoalItemRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { projectStateDir, runtime },
) => {
  const match = requestUrl.pathname.match(GOAL_ITEM_PATTERN);
  if (!match) {
    return false;
  }

  if (request.method !== "PATCH") {
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
  const rawStatus = payload.status;
  const hasStatus = typeof rawStatus === "string";
  const ownerAgentId = typeof payload.ownerAgentId === "string" ? payload.ownerAgentId.trim() : "";
  const hasOwnerAssignment = ownerAgentId.length > 0;
  if (!hasStatus && !hasOwnerAssignment) {
    writeJson(
      response,
      400,
      { error: "Provide a valid status or a permanent goal owner." },
      corsOrigin,
    );
    return true;
  }
  if (hasStatus && !GOAL_STATUSES.has(rawStatus as GoalStatus)) {
    writeJson(response, 400, { error: "status must be a valid goal status." }, corsOrigin);
    return true;
  }
  if (hasStatus && hasOwnerAssignment) {
    writeJson(
      response,
      400,
      { error: "Update a goal status or owner in separate requests." },
      corsOrigin,
    );
    return true;
  }

  const owner = hasOwnerAssignment ? findAgentRosterRole(ownerAgentId) : null;
  if (hasOwnerAssignment && !owner) {
    writeJson(response, 400, { error: "Goal owner must be a permanent agent role." }, corsOrigin);
    return true;
  }

  const goalId = decodeURIComponent(match[1] ?? "");
  let goal: Goal | null;
  try {
    const goalStore = createGoalStore(projectStateDir);
    goal = owner
      ? goalStore.assignOwner(goalId, { agentId: owner.id, tentacleId: owner.tentacleId })
      : goalStore.updateStatus(goalId, rawStatus as GoalStatus, payload.evidence);
    if (!goal) {
      writeJson(response, 404, { error: "Goal not found." }, corsOrigin);
      return true;
    }
  } catch (error) {
    writeJson(
      response,
      400,
      { error: error instanceof Error ? error.message : "Invalid goal status update." },
      corsOrigin,
    );
    return true;
  }

  runtime.appendAuditEvent(owner ? "goal.owner_assigned" : "goal.status_changed", {
    payload: owner
      ? { goalId: goal.id, ownerAgentId: owner.id, tentacleId: owner.tentacleId }
      : { goalId: goal.id, status: goal.status, evidenceCount: goal.evidence.length },
  });
  writeJson(response, 200, goal, corsOrigin);
  return true;
};
