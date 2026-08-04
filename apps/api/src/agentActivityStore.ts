import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { AgentActivity, AgentActivityStatus } from "./agentRoster";
import { normalizeChannelContent } from "./terminalRuntime/channelMessaging";

const ACTIVITY_STATUSES = new Set<AgentActivityStatus>([
  "planning",
  "researching",
  "implementing",
  "testing",
  "reviewing",
  "waiting",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseActivity = (value: unknown): AgentActivity | null => {
  if (!isRecord(value)) return null;
  const agentId = typeof value.agentId === "string" ? value.agentId.trim() : "";
  const terminalId = typeof value.terminalId === "string" ? value.terminalId.trim() : "";
  const summary = typeof value.summary === "string" ? normalizeChannelContent(value.summary) : "";
  const status = value.status;
  const updatedAt = typeof value.updatedAt === "string" ? value.updatedAt : "";
  if (
    !agentId ||
    !terminalId ||
    !summary ||
    !updatedAt ||
    typeof status !== "string" ||
    !ACTIVITY_STATUSES.has(status as AgentActivityStatus)
  ) {
    return null;
  }
  return { agentId, terminalId, status: status as AgentActivityStatus, summary, updatedAt };
};

export const createAgentActivityStore = (projectStateDir: string) => {
  const activityPath = join(projectStateDir, "state", "agent-activity.json");

  const read = () => {
    if (!existsSync(activityPath)) return new Map<string, AgentActivity>();
    try {
      const parsed = JSON.parse(readFileSync(activityPath, "utf8")) as unknown;
      if (!Array.isArray(parsed)) return new Map<string, AgentActivity>();
      return new Map(
        parsed
          .map(parseActivity)
          .filter((activity): activity is AgentActivity => activity !== null)
          .map((activity) => [activity.agentId, activity]),
      );
    } catch {
      return new Map<string, AgentActivity>();
    }
  };

  const write = (activities: ReadonlyMap<string, AgentActivity>) => {
    mkdirSync(dirname(activityPath), { recursive: true });
    writeFileSync(activityPath, `${JSON.stringify([...activities.values()], null, 2)}\n`, "utf8");
  };

  return {
    read,
    update(input: Omit<AgentActivity, "updatedAt">) {
      const activities = read();
      const activity: AgentActivity = { ...input, updatedAt: new Date().toISOString() };
      activities.set(activity.agentId, activity);
      write(activities);
      return activity;
    },
  };
};
