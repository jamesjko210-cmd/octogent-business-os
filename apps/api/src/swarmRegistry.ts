import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AgentRosterEntry, AgentRosterState } from "./agentRoster";

export type SwarmDefinition = {
  id: string;
  title: string;
  purpose: string;
  agentIds: readonly string[];
};

export type SwarmRegistryEntry = SwarmDefinition & {
  state: AgentRosterState;
  roleCount: number;
  workingCount: number;
  waitingCount: number;
  readyCount: number;
  preparedCount: number;
  notLaunchedCount: number;
  activeRoles: Array<{
    id: string;
    title: string;
    state: AgentRosterState;
    currentActivity: string;
  }>;
};

const DEFAULT_SWARMS: readonly SwarmDefinition[] = [
  {
    id: "game-business",
    title: "Game Business",
    purpose:
      "Runs Block Bounce product work, quality checks, player service, operations, growth, and durable records.",
    agentIds: [
      "ceo-command",
      "chief-of-staff",
      "execution-ops",
      "codex-executor",
      "debugging-council",
      "marketing-council",
      "service-council",
      "automation-council",
      "finance-accounting",
      "market-analysis",
      "record-center",
      "stitch-ui-production",
    ],
  },
  {
    id: "research",
    title: "Research",
    purpose:
      "Investigates open questions with current sources, grounded review, and reusable project briefs.",
    agentIds: ["research-triad"],
  },
];

const deriveSwarmState = (agents: readonly AgentRosterEntry[]): AgentRosterState => {
  if (agents.some((agent) => agent.state === "working")) return "working";
  if (agents.some((agent) => agent.state === "waiting")) return "waiting";
  if (agents.some((agent) => agent.state === "ready")) return "ready";
  if (agents.some((agent) => agent.state === "prepared")) return "prepared";
  return "not_launched";
};

const STATE_PRIORITY: Record<AgentRosterState, number> = {
  working: 0,
  waiting: 1,
  ready: 2,
  prepared: 3,
  not_launched: 4,
};

const activeRolesFor = (agents: readonly AgentRosterEntry[]) =>
  [...agents]
    .filter((agent) => agent.state !== "not_launched")
    .sort((left, right) => STATE_PRIORITY[left.state] - STATE_PRIORITY[right.state])
    .slice(0, 3)
    .map(({ id, title, state, currentActivity }) => ({ id, title, state, currentActivity }));

export const listSwarmRegistry = (
  agents: readonly AgentRosterEntry[],
  customSwarms: readonly SwarmDefinition[] = [],
): SwarmRegistryEntry[] =>
  [...DEFAULT_SWARMS, ...customSwarms].map((swarm) => {
    const members = agents.filter((agent) => swarm.agentIds.includes(agent.id));
    return {
      ...swarm,
      state: deriveSwarmState(members),
      roleCount: members.length,
      workingCount: members.filter((agent) => agent.state === "working").length,
      waitingCount: members.filter((agent) => agent.state === "waiting").length,
      readyCount: members.filter((agent) => agent.state === "ready").length,
      preparedCount: members.filter((agent) => agent.state === "prepared").length,
      notLaunchedCount: members.filter((agent) => agent.state === "not_launched").length,
      activeRoles: activeRolesFor(members),
    };
  });

const SWARM_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,47}$/;

const parseDefinition = (value: unknown): SwarmDefinition | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const purpose = typeof record.purpose === "string" ? record.purpose.trim() : "";
  const agentIds = Array.isArray(record.agentIds)
    ? [
        ...new Set(
          record.agentIds
            .filter((id): id is string => typeof id === "string")
            .map((id) => id.trim())
            .filter(Boolean),
        ),
      ]
    : [];
  return SWARM_ID_PATTERN.test(id) &&
    title.length > 0 &&
    title.length <= 80 &&
    purpose.length > 0 &&
    purpose.length <= 320 &&
    agentIds.length > 0
    ? { id, title, purpose, agentIds }
    : null;
};

export const createSwarmRegistryStore = (projectStateDir: string) => {
  const swarmsPath = join(projectStateDir, "state", "swarms.json");
  const list = (): SwarmDefinition[] => {
    if (!existsSync(swarmsPath)) return [];
    try {
      const parsed = JSON.parse(readFileSync(swarmsPath, "utf8")) as unknown;
      const entries =
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as { swarms?: unknown }).swarms
          : [];
      return Array.isArray(entries)
        ? entries.map(parseDefinition).filter((entry): entry is SwarmDefinition => entry !== null)
        : [];
    } catch {
      return [];
    }
  };
  const create = (input: unknown, agents: readonly AgentRosterEntry[]): SwarmDefinition => {
    const definition = parseDefinition(input);
    if (!definition)
      throw new Error("A swarm needs a lowercase ID, title, purpose, and at least one role.");
    const knownIds = new Set(agents.map((agent) => agent.id));
    if (definition.agentIds.some((agentId) => !knownIds.has(agentId)))
      throw new Error("A swarm can include only permanent agent roles.");
    const existing = [...DEFAULT_SWARMS, ...list()];
    if (existing.some((swarm) => swarm.id === definition.id))
      throw new Error("That swarm ID is already in use.");
    const swarms = [...list(), definition];
    mkdirSync(dirname(swarmsPath), { recursive: true });
    writeFileSync(swarmsPath, `${JSON.stringify({ swarms }, null, 2)}\n`, "utf8");
    return definition;
  };
  return { create, list, swarmsPath };
};
