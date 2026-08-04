import type { TerminalAgentProvider, TerminalSnapshot } from "@octogent/core";

export type AgentRosterState = "working" | "waiting" | "ready" | "prepared" | "not_launched";
export type AgentActivityStatus =
  | "planning"
  | "researching"
  | "implementing"
  | "testing"
  | "reviewing"
  | "waiting";

export type ProviderConnectionState = "not_started" | "shell_started_unverified";

export type AgentActivity = {
  agentId: string;
  terminalId: string;
  status: AgentActivityStatus;
  summary: string;
  updatedAt: string;
};

export type AgentRosterRole = {
  id: string;
  title: string;
  role: string;
  tentacleId: string;
  preferredProvider: TerminalAgentProvider;
  operatingModel?: string;
  purpose: string;
  spawnReason: string;
  memoryAccess: "shared-project-memory";
};

export type AgentRosterEntry = AgentRosterRole & {
  state: AgentRosterState;
  providerConnection: ProviderConnectionState;
  currentActivity: string;
  activityStatus?: AgentActivityStatus;
  terminalIds: string[];
};

const AGENT_ROSTER: readonly AgentRosterRole[] = [
  {
    id: "ceo-command",
    title: "CEO Command",
    role: "Strategy and final priority setting",
    tentacleId: "ceo-command",
    preferredProvider: "claude-code",
    operatingModel: "GPT-5.6 Sol (Chief)",
    purpose:
      "Turns the operator's goals into a focused weekly direction and escalates decisions that need a human choice.",
    spawnReason:
      "Launch this when priorities conflict, a major decision is needed, or work needs to be re-planned.",
    memoryAccess: "shared-project-memory",
  },
  {
    id: "chief-of-staff",
    title: "Chief of Staff",
    role: "Briefs, decisions, and follow-through",
    tentacleId: "chief-of-staff",
    preferredProvider: "claude-code",
    operatingModel: "GPT-5.6 Sol (Chief)",
    purpose:
      "Keeps the plan readable, records decisions, and turns meetings or research into clear next actions.",
    spawnReason:
      "Launch this to prepare a brief, reconcile updates, or make sure decisions have owners and deadlines.",
    memoryAccess: "shared-project-memory",
  },
  {
    id: "execution-ops",
    title: "Execution Ops",
    role: "Progress, blockers, and quality checks",
    tentacleId: "execution-ops",
    preferredProvider: "claude-code",
    operatingModel: "GPT Terra (Executor)",
    purpose:
      "Checks whether planned work is moving, identifies blockers early, and asks for review before a handoff.",
    spawnReason:
      "Launch this when several workstreams need coordination or a delivery needs a readiness check.",
    memoryAccess: "shared-project-memory",
  },
  {
    id: "codex-executor",
    title: "Codex Executor",
    role: "Scoped implementation and testing",
    tentacleId: "game-business",
    preferredProvider: "codex",
    operatingModel: "GPT Terra (Executor)",
    purpose:
      "Builds and tests the game or internal tooling in a scoped worktree, then reports evidence instead of assumptions.",
    spawnReason:
      "Launch this for a defined coding task, bug fix, test run, or repository maintenance work.",
    memoryAccess: "shared-project-memory",
  },
  {
    id: "debugging-council",
    title: "Debugging Council",
    role: "Failure investigation and regression prevention",
    tentacleId: "game-business",
    preferredProvider: "codex",
    operatingModel: "GPT Terra (Executor)",
    purpose:
      "Reproduces a problem, narrows the cause, verifies the fix, and records the lesson for the next release.",
    spawnReason:
      "Launch this when a playtest, test suite, build, or deployment check exposes an unresolved issue.",
    memoryAccess: "shared-project-memory",
  },
  {
    id: "marketing-council",
    title: "Marketing Council",
    role: "Audience learning and campaign drafts",
    tentacleId: "marketing-growth",
    preferredProvider: "claude-code",
    purpose:
      "Develops ethical messaging, content ideas, and audience hypotheses without publishing or spending money on its own.",
    spawnReason:
      "Launch this when preparing a campaign, reviewing feedback themes, or testing a growth idea.",
    memoryAccess: "shared-project-memory",
  },
  {
    id: "service-council",
    title: "Service Council",
    role: "Player feedback and support patterns",
    tentacleId: "game-business",
    preferredProvider: "claude-code",
    purpose:
      "Turns consented feedback into privacy-aware themes, improvements, and clear response drafts.",
    spawnReason:
      "Launch this after playtests or when feedback needs to become a prioritized product decision.",
    memoryAccess: "shared-project-memory",
  },
  {
    id: "automation-council",
    title: "Automation Council",
    role: "Safe repeatable operations",
    tentacleId: "game-business",
    preferredProvider: "codex",
    operatingModel: "GPT Terra (Executor)",
    purpose:
      "Designs and verifies small repeatable workflows while keeping external actions and user data behind approval rules.",
    spawnReason:
      "Launch this when a manual internal process repeats enough to justify a safe automation.",
    memoryAccess: "shared-project-memory",
  },
  {
    id: "finance-accounting",
    title: "Finance and Accounting",
    role: "Cost visibility and planning",
    tentacleId: "monetization",
    preferredProvider: "claude-code",
    purpose:
      "Prepares cost scenarios and records assumptions; it cannot spend, subscribe, invoice, or make commitments.",
    spawnReason:
      "Launch this to compare options, review costs, or prepare a decision packet for the operator.",
    memoryAccess: "shared-project-memory",
  },
  {
    id: "market-analysis",
    title: "Market Analysis",
    role: "Current, source-backed research",
    tentacleId: "market-research",
    preferredProvider: "perplexity",
    purpose:
      "Finds current evidence, competitors, and market signals, separating cited facts from assumptions.",
    spawnReason:
      "Launch this before changing the target audience, positioning, or a decision that depends on current facts.",
    memoryAccess: "shared-project-memory",
  },
  {
    id: "research-triad",
    title: "Research Triad",
    role: "Google-grounded research and synthesis",
    tentacleId: "research",
    preferredProvider: "gemini-cli",
    purpose:
      "Combines broad research, selected-source review, and durable notes so important decisions can be checked later.",
    spawnReason:
      "Launch this for an open research question that needs sources, comparison, and a concise brief.",
    memoryAccess: "shared-project-memory",
  },
  {
    id: "record-center",
    title: "Record Center",
    role: "Durable project memory",
    tentacleId: "game-business",
    preferredProvider: "notion",
    purpose:
      "Captures verified decisions, research summaries, test outcomes, and developer-journal updates for future agents and people.",
    spawnReason:
      "Launch this after a meaningful decision, test, or completed work item needs a durable record.",
    memoryAccess: "shared-project-memory",
  },
  {
    id: "stitch-ui-production",
    title: "Stitch UI Production",
    role: "UI and UX direction",
    tentacleId: "product-development",
    preferredProvider: "stitch",
    purpose:
      "Creates interface direction and implementation-ready UI notes while keeping the final product decisions with the operator.",
    spawnReason:
      "Launch this before a new game screen, visual refresh, or UI handoff to the coding team.",
    memoryAccess: "shared-project-memory",
  },
];

const matchingTerminals = (role: AgentRosterRole, terminals: readonly TerminalSnapshot[]) =>
  terminals.filter((terminal) => terminal.agentId === role.id);

const deriveRosterState = (terminals: readonly TerminalSnapshot[]): AgentRosterState => {
  if (terminals.some((terminal) => terminal.agentRuntimeState === "processing")) {
    return "working";
  }

  if (
    terminals.some(
      (terminal) =>
        terminal.agentRuntimeState === "waiting_for_permission" ||
        terminal.agentRuntimeState === "waiting_for_user",
    )
  ) {
    return "waiting";
  }

  if (
    terminals.some((terminal) => terminal.lifecycleState === "running" && terminal.state === "live")
  ) {
    return "ready";
  }

  if (terminals.some((terminal) => terminal.lifecycleState === "registered")) {
    return "prepared";
  }

  return "not_launched";
};

const activityFor = (
  state: AgentRosterState,
  terminals: readonly TerminalSnapshot[],
  activity?: AgentActivity,
) => {
  // A registered terminal can run internal bookkeeping, but it is not evidence
  // that its configured provider has started. Keep the roster truthful.
  if (activity && state !== "not_launched" && state !== "prepared") {
    return `${activity.status}: ${activity.summary}`;
  }

  if (state === "working") {
    const terminal = terminals.find((item) => item.agentRuntimeState === "processing");
    return terminal ? `Working in ${terminal.label}.` : "Working in an active terminal.";
  }

  if (state === "waiting") {
    return "Waiting for a permission or operator response.";
  }

  if (state === "ready") {
    return "Ready to receive a scoped task. Provider connection unverified.";
  }

  if (state === "prepared") {
    return "Prepared to start a scoped task; no provider session is running.";
  }

  return "No matching terminal is launched yet.";
};

const providerConnectionFor = (terminals: readonly TerminalSnapshot[]): ProviderConnectionState =>
  terminals.some((terminal) => terminal.lifecycleState === "running" && terminal.state === "live")
    ? "shell_started_unverified"
    : "not_started";

export const findAgentRosterRole = (agentId: string) =>
  AGENT_ROSTER.find((role) => role.id === agentId) ?? null;

export const listAgentRosterRoles = (): readonly AgentRosterRole[] => AGENT_ROSTER;

export const listAgentRoster = (
  terminals: readonly TerminalSnapshot[],
  activities: ReadonlyMap<string, AgentActivity> = new Map(),
): AgentRosterEntry[] =>
  AGENT_ROSTER.map((role) => {
    const roleTerminals = matchingTerminals(role, terminals);
    const state = deriveRosterState(roleTerminals);
    const activity = activities.get(role.id);
    return {
      ...role,
      state,
      providerConnection: providerConnectionFor(roleTerminals),
      currentActivity: activityFor(state, roleTerminals, activity),
      ...(activity && state !== "not_launched" && state !== "prepared"
        ? { activityStatus: activity.status }
        : {}),
      terminalIds: roleTerminals.map((terminal) => terminal.terminalId),
    };
  });
