import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { Goal, GoalPriority, GoalSnapshot, GoalStatus } from "@octogent/core";

const GOAL_STATUSES = new Set<GoalStatus>([
  "planned",
  "active",
  "blocked",
  "needs_review",
  "completed",
  "cancelled",
]);
const GOAL_PRIORITIES = new Set<GoalPriority>(["low", "normal", "high", "urgent"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeStringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

const parseGoal = (value: unknown): Goal | null => {
  if (!isRecord(value)) {
    return null;
  }

  const id = typeof value.id === "string" ? value.id : "";
  const title = typeof value.title === "string" ? value.title : "";
  const description = typeof value.description === "string" ? value.description : "";
  const status =
    typeof value.status === "string" && GOAL_STATUSES.has(value.status as GoalStatus)
      ? (value.status as GoalStatus)
      : null;
  const priority =
    typeof value.priority === "string" && GOAL_PRIORITIES.has(value.priority as GoalPriority)
      ? (value.priority as GoalPriority)
      : null;
  const createdAt = typeof value.createdAt === "string" ? value.createdAt : "";
  const updatedAt = typeof value.updatedAt === "string" ? value.updatedAt : "";

  if (!id || !title || !status || !priority || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id,
    title,
    description,
    status,
    priority,
    ...(typeof value.tentacleId === "string" && value.tentacleId.trim()
      ? { tentacleId: value.tentacleId.trim() }
      : {}),
    ...(typeof value.ownerAgentId === "string" && value.ownerAgentId.trim()
      ? { ownerAgentId: value.ownerAgentId.trim() }
      : {}),
    successCriteria: normalizeStringList(value.successCriteria),
    constraints: normalizeStringList(value.constraints),
    evidence: normalizeStringList(value.evidence),
    createdAt,
    updatedAt,
  };
};

export const createGoalStore = (projectStateDir: string) => {
  const goalsPath = join(projectStateDir, "state", "goals.json");

  const readSnapshot = (): GoalSnapshot => {
    if (!existsSync(goalsPath)) {
      return { goals: [] };
    }

    try {
      const parsed = JSON.parse(readFileSync(goalsPath, "utf8")) as unknown;
      const goals =
        isRecord(parsed) && Array.isArray(parsed.goals)
          ? parsed.goals.map(parseGoal).filter((goal): goal is Goal => goal !== null)
          : [];
      return { goals };
    } catch {
      return { goals: [] };
    }
  };

  const writeSnapshot = (snapshot: GoalSnapshot) => {
    mkdirSync(dirname(goalsPath), { recursive: true });
    writeFileSync(goalsPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  };

  const list = ({
    tentacleId,
    status,
    ownerAgentId,
  }: { tentacleId?: string; status?: GoalStatus; ownerAgentId?: string } = {}) => {
    const snapshot = readSnapshot();
    return snapshot.goals.filter(
      (goal) =>
        (!tentacleId || goal.tentacleId === tentacleId) &&
        (!status || goal.status === status) &&
        (!ownerAgentId || goal.ownerAgentId === ownerAgentId),
    );
  };

  const find = (goalId: string) => readSnapshot().goals.find((goal) => goal.id === goalId) ?? null;

  const create = (input: {
    title?: unknown;
    description?: unknown;
    priority?: unknown;
    tentacleId?: unknown;
    ownerAgentId?: unknown;
    successCriteria?: unknown;
    constraints?: unknown;
  }): Goal => {
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (!title) {
      throw new Error("Goal title is required.");
    }

    const priority =
      typeof input.priority === "string" && GOAL_PRIORITIES.has(input.priority as GoalPriority)
        ? (input.priority as GoalPriority)
        : "normal";
    const now = new Date().toISOString();
    const goal: Goal = {
      id: `goal-${randomUUID()}`,
      title,
      description: typeof input.description === "string" ? input.description.trim() : "",
      status: "planned",
      priority,
      ...(typeof input.tentacleId === "string" && input.tentacleId.trim()
        ? { tentacleId: input.tentacleId.trim() }
        : {}),
      ...(typeof input.ownerAgentId === "string" && input.ownerAgentId.trim()
        ? { ownerAgentId: input.ownerAgentId.trim() }
        : {}),
      successCriteria: normalizeStringList(input.successCriteria),
      constraints: normalizeStringList(input.constraints),
      evidence: [],
      createdAt: now,
      updatedAt: now,
    };

    const snapshot = readSnapshot();
    writeSnapshot({ goals: [goal, ...snapshot.goals] });
    return goal;
  };

  const updateStatus = (goalId: string, status: GoalStatus, evidence?: unknown): Goal | null => {
    const snapshot = readSnapshot();
    const index = snapshot.goals.findIndex((goal) => goal.id === goalId);
    if (index < 0) {
      return null;
    }

    const existing = snapshot.goals[index];
    if (!existing) {
      return null;
    }
    const nextEvidence = Array.isArray(evidence)
      ? normalizeStringList(evidence)
      : existing.evidence;
    if (status === "completed" && nextEvidence.length === 0) {
      throw new Error("Completion requires at least one evidence item.");
    }
    const updated: Goal = {
      ...existing,
      status,
      evidence: nextEvidence,
      updatedAt: new Date().toISOString(),
    };
    const goals = [...snapshot.goals];
    goals[index] = updated;
    writeSnapshot({ goals });
    return updated;
  };

  const assignOwner = (
    goalId: string,
    owner: { agentId: string; tentacleId: string },
  ): Goal | null => {
    const snapshot = readSnapshot();
    const index = snapshot.goals.findIndex((goal) => goal.id === goalId);
    if (index < 0) {
      return null;
    }

    const existing = snapshot.goals[index];
    if (!existing) {
      return null;
    }
    const updated: Goal = {
      ...existing,
      ownerAgentId: owner.agentId,
      tentacleId: owner.tentacleId,
      updatedAt: new Date().toISOString(),
    };
    const goals = [...snapshot.goals];
    goals[index] = updated;
    writeSnapshot({ goals });
    return updated;
  };

  return {
    assignOwner,
    create,
    find,
    goalsPath,
    list,
    updateStatus,
  };
};
