import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type {
  Workflow,
  WorkflowAutomationLevel,
  WorkflowRun,
  WorkflowRunEvidence,
  WorkflowRunOutcome,
  WorkflowRunStatus,
  WorkflowSnapshot,
  WorkflowStatus,
} from "@octogent/core";

const WORKFLOW_STATUSES = new Set<WorkflowStatus>(["draft", "active", "paused", "archived"]);
const AUTOMATION_LEVELS = new Set<WorkflowAutomationLevel>([
  "human_led",
  "human_assisted",
  "autonomous",
]);
const WORKFLOW_RUN_STATUSES = new Set<WorkflowRunStatus>([
  "queued",
  "running",
  "awaiting_approval",
  "blocked",
  "succeeded",
  "failed",
  "denied",
  "cancelled",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeStringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

const parseEvidence = (value: unknown): WorkflowRunEvidence[] =>
  Array.isArray(value)
    ? value.flatMap((entry) => {
        if (!isRecord(entry)) return [];
        if (
          (entry.kind !== "test" && entry.kind !== "tool" && entry.kind !== "note") ||
          typeof entry.summary !== "string" ||
          typeof entry.occurredAt !== "string"
        ) {
          return [];
        }
        return [
          {
            kind: entry.kind,
            summary: entry.summary,
            occurredAt: entry.occurredAt,
          },
        ];
      })
    : [];

const parseWorkflow = (value: unknown): Workflow | null => {
  if (!isRecord(value)) return null;

  const id = typeof value.id === "string" ? value.id.trim() : "";
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const ownerAgentId = typeof value.ownerAgentId === "string" ? value.ownerAgentId.trim() : "";
  const status =
    typeof value.status === "string" && WORKFLOW_STATUSES.has(value.status as WorkflowStatus)
      ? (value.status as WorkflowStatus)
      : null;
  const automationLevel =
    typeof value.automationLevel === "string" &&
    AUTOMATION_LEVELS.has(value.automationLevel as WorkflowAutomationLevel)
      ? (value.automationLevel as WorkflowAutomationLevel)
      : null;
  const createdAt = typeof value.createdAt === "string" ? value.createdAt : "";
  const updatedAt = typeof value.updatedAt === "string" ? value.updatedAt : "";

  if (!id || !title || !ownerAgentId || !status || !automationLevel || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id,
    title,
    description: typeof value.description === "string" ? value.description.trim() : "",
    status,
    automationLevel,
    ownerAgentId,
    ...(typeof value.tentacleId === "string" && value.tentacleId.trim()
      ? { tentacleId: value.tentacleId.trim() }
      : {}),
    ...(typeof value.goalId === "string" && value.goalId.trim()
      ? { goalId: value.goalId.trim() }
      : {}),
    actionType:
      typeof value.actionType === "string" && value.actionType.trim()
        ? value.actionType.trim()
        : "workflow",
    actionContent:
      typeof value.actionContent === "string" && value.actionContent.trim()
        ? value.actionContent.trim()
        : title,
    sop: normalizeStringList(value.sop),
    successCriteria: normalizeStringList(value.successCriteria),
    allowedTools: normalizeStringList(value.allowedTools),
    createdAt,
    updatedAt,
  };
};

const parseWorkflowRun = (value: unknown): WorkflowRun | null => {
  if (!isRecord(value)) return null;

  const id = typeof value.id === "string" ? value.id.trim() : "";
  const workflowId = typeof value.workflowId === "string" ? value.workflowId.trim() : "";
  const status =
    typeof value.status === "string" && WORKFLOW_RUN_STATUSES.has(value.status as WorkflowRunStatus)
      ? (value.status as WorkflowRunStatus)
      : null;
  const initiatedBy =
    value.initiatedBy === "operator" ||
    value.initiatedBy === "agent" ||
    value.initiatedBy === "scheduler"
      ? value.initiatedBy
      : null;
  const createdAt = typeof value.createdAt === "string" ? value.createdAt : "";
  const updatedAt = typeof value.updatedAt === "string" ? value.updatedAt : "";
  const policy = isRecord(value.policy) ? value.policy : null;

  if (!id || !workflowId || !status || !initiatedBy || !createdAt || !updatedAt || !policy) {
    return null;
  }

  const decision =
    policy.decision === "allow" ||
    policy.decision === "requires_approval" ||
    policy.decision === "deny"
      ? policy.decision
      : null;
  if (!decision) return null;

  const approval: NonNullable<WorkflowRun["approval"]> | undefined = isRecord(value.approval)
    ? value.approval.decision === "approved" || value.approval.decision === "rejected"
      ? {
          decision: value.approval.decision as "approved" | "rejected",
          decidedBy: "operator" as const,
          note: typeof value.approval.note === "string" ? value.approval.note : "",
          decidedAt: typeof value.approval.decidedAt === "string" ? value.approval.decidedAt : "",
        }
      : undefined
    : undefined;
  const execution: NonNullable<WorkflowRun["execution"]> | undefined = isRecord(value.execution)
    ? typeof value.execution.terminalId === "string" &&
      typeof value.execution.agentId === "string" &&
      typeof value.execution.claimedAt === "string" &&
      value.execution.claimedBy === "runtime-worker"
      ? {
          terminalId: value.execution.terminalId,
          agentId: value.execution.agentId,
          claimedAt: value.execution.claimedAt,
          claimedBy: "runtime-worker" as const,
        }
      : undefined
    : undefined;
  const outcome: WorkflowRunOutcome | undefined = isRecord(value.outcome)
    ? (value.outcome.status === "succeeded" ||
        value.outcome.status === "blocked" ||
        value.outcome.status === "failed") &&
      typeof value.outcome.summary === "string" &&
      typeof value.outcome.completedAt === "string"
      ? {
          status: value.outcome.status,
          summary: value.outcome.summary,
          completedAt: value.outcome.completedAt,
          evidence: parseEvidence(value.outcome.evidence),
        }
      : undefined
    : undefined;

  return {
    id,
    workflowId,
    ...(typeof value.goalId === "string" && value.goalId.trim()
      ? { goalId: value.goalId.trim() }
      : {}),
    status,
    initiatedBy,
    policy: {
      decision,
      rationale: typeof policy.rationale === "string" ? policy.rationale : "",
      matchedGlobalPolicyIds: normalizeStringList(policy.matchedGlobalPolicyIds),
      matchedAgentPolicyIds: normalizeStringList(policy.matchedAgentPolicyIds),
    },
    summary: typeof value.summary === "string" ? value.summary : "",
    createdAt,
    updatedAt,
    ...(approval ? { approval } : {}),
    ...(execution ? { execution } : {}),
    ...(outcome ? { outcome } : {}),
  };
};

const createSeedWorkflows = (): Workflow[] => {
  const now = new Date().toISOString();
  return [
    {
      id: "workflow-game-qa-balance",
      title: "Game QA and balance sweep",
      description:
        "Verify Block Bounce mechanics, level pacing, scoring, ranking, and regressions before a manual playtest.",
      status: "active",
      automationLevel: "autonomous",
      ownerAgentId: "codex-executor",
      tentacleId: "game-business",
      actionType: "test",
      actionContent:
        "Run local Block Bounce QA, build checks, and regression tests; record failures and evidence.",
      sop: [
        "Read the current game goal and previous playtest notes.",
        "Run the scoped automated checks and inspect failures.",
        "Record verified results, blockers, and follow-up tasks.",
      ],
      successCriteria: [
        "Automated checks pass",
        "Known regressions are documented",
        "Manual playtest is ready",
      ],
      allowedTools: ["terminal", "tests", "filesystem", "record-center"],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "workflow-research-triad-brief",
      title: "Research triad brief",
      description:
        "Turn a focused question into a cited, source-grounded brief with clear uncertainty and next actions.",
      status: "active",
      automationLevel: "human_assisted",
      ownerAgentId: "research-triad",
      tentacleId: "research",
      actionType: "research",
      actionContent:
        "Prepare a research brief using Perplexity, NotebookLM, and Notion without publishing or contacting anyone.",
      sop: [
        "Clarify the research question and success criteria.",
        "Gather current evidence, ground key sources, and synthesize the result.",
        "Save a concise brief with citations, confidence, and decisions needed.",
      ],
      successCriteria: [
        "Citations are present",
        "Claims show confidence",
        "Decision owner is clear",
      ],
      allowedTools: ["live-research", "notebooklm", "notion-capture", "memory"],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "workflow-developer-journal-update",
      title: "Developer journal update",
      description:
        "Keep the human-readable record of development decisions, changes, results, and next steps current.",
      status: "active",
      automationLevel: "human_assisted",
      ownerAgentId: "record-center",
      tentacleId: "game-business",
      actionType: "write",
      actionContent:
        "Draft an update to the local developer journal and Record Center from verified project changes.",
      sop: [
        "Collect only verified changes, decisions, and test results.",
        "Write a dated update in plain language with justification and future goals.",
        "Flag anything that needs operator review before external sharing.",
      ],
      successCriteria: [
        "Date and change rationale are present",
        "Future work is explicit",
        "No unverified claims",
      ],
      allowedTools: ["docs", "record-center", "memory"],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "workflow-playtest-feedback-review",
      title: "Playtest feedback review",
      description:
        "Convert anonymized playtest observations into prioritized, evidence-backed game improvements.",
      status: "active",
      automationLevel: "human_assisted",
      ownerAgentId: "service-council",
      tentacleId: "game-business",
      actionType: "analysis",
      actionContent:
        "Summarize anonymized aggregate playtest feedback and local gameplay metrics into improvement recommendations.",
      sop: [
        "Use only approved, anonymized aggregate feedback and gameplay data.",
        "Separate observations from hypotheses and recommendations.",
        "Create a ranked improvement list with expected player impact.",
      ],
      successCriteria: [
        "Feedback is anonymized",
        "Recommendations cite evidence",
        "Top change is testable",
      ],
      allowedTools: ["analytics", "feedback-notes", "record-center"],
      createdAt: now,
      updatedAt: now,
    },
  ];
};

// Early local state used placeholder role IDs. Keep the built-in workflows on
// their permanent, manifest-backed owners when an existing project is opened.
const BUILT_IN_WORKFLOW_OWNERS: Record<string, Pick<Workflow, "ownerAgentId" | "tentacleId">> = {
  "workflow-game-qa-balance": { ownerAgentId: "codex-executor", tentacleId: "game-business" },
  "workflow-research-triad-brief": { ownerAgentId: "research-triad", tentacleId: "research" },
  "workflow-developer-journal-update": {
    ownerAgentId: "record-center",
    tentacleId: "game-business",
  },
  "workflow-playtest-feedback-review": {
    ownerAgentId: "service-council",
    tentacleId: "game-business",
  },
};

const migrateBuiltInWorkflowOwners = (snapshot: WorkflowSnapshot) => {
  let changed = false;
  const workflows = snapshot.workflows.map((workflow) => {
    const expectedOwner = BUILT_IN_WORKFLOW_OWNERS[workflow.id];
    if (
      !expectedOwner ||
      (workflow.ownerAgentId === expectedOwner.ownerAgentId &&
        workflow.tentacleId === expectedOwner.tentacleId)
    ) {
      return workflow;
    }
    changed = true;
    return {
      ...workflow,
      ...expectedOwner,
      updatedAt: new Date().toISOString(),
    };
  });
  return { changed, snapshot: { workflows, runs: snapshot.runs } };
};

export const createWorkflowStore = (projectStateDir: string) => {
  const workflowsPath = join(projectStateDir, "state", "workflows.json");

  const readSnapshot = (): WorkflowSnapshot => {
    if (!existsSync(workflowsPath)) return { workflows: [], runs: [] };

    try {
      const parsed = JSON.parse(readFileSync(workflowsPath, "utf8")) as unknown;
      if (!isRecord(parsed)) return { workflows: [], runs: [] };
      return {
        workflows: Array.isArray(parsed.workflows)
          ? parsed.workflows
              .map(parseWorkflow)
              .filter((workflow): workflow is Workflow => workflow !== null)
          : [],
        runs: Array.isArray(parsed.runs)
          ? parsed.runs.map(parseWorkflowRun).filter((run): run is WorkflowRun => run !== null)
          : [],
      };
    } catch {
      return { workflows: [], runs: [] };
    }
  };

  const writeSnapshot = (snapshot: WorkflowSnapshot) => {
    mkdirSync(dirname(workflowsPath), { recursive: true });
    writeFileSync(workflowsPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  };

  const ensureInitialWorkflows = () => {
    if (!existsSync(workflowsPath)) {
      writeSnapshot({ workflows: createSeedWorkflows(), runs: [] });
      return true;
    }

    const migration = migrateBuiltInWorkflowOwners(readSnapshot());
    if (migration.changed) {
      writeSnapshot(migration.snapshot);
    }
    return false;
  };

  const list = ({ tentacleId, status }: { tentacleId?: string; status?: WorkflowStatus } = {}) => {
    const snapshot = readSnapshot();
    return snapshot.workflows.filter(
      (workflow) =>
        (!tentacleId || workflow.tentacleId === tentacleId) &&
        (!status || workflow.status === status),
    );
  };

  const listRuns = (workflowId?: string) => {
    const snapshot = readSnapshot();
    return snapshot.runs.filter((run) => !workflowId || run.workflowId === workflowId);
  };

  const find = (workflowId: string) =>
    readSnapshot().workflows.find((workflow) => workflow.id === workflowId) ?? null;

  const create = (input: {
    title?: unknown;
    description?: unknown;
    automationLevel?: unknown;
    ownerAgentId?: unknown;
    tentacleId?: unknown;
    goalId?: unknown;
    actionType?: unknown;
    actionContent?: unknown;
    sop?: unknown;
    successCriteria?: unknown;
    allowedTools?: unknown;
  }): Workflow => {
    const title = typeof input.title === "string" ? input.title.trim() : "";
    const ownerAgentId = typeof input.ownerAgentId === "string" ? input.ownerAgentId.trim() : "";
    if (!title || !ownerAgentId) throw new Error("Workflow title and ownerAgentId are required.");

    const automationLevel =
      typeof input.automationLevel === "string" &&
      AUTOMATION_LEVELS.has(input.automationLevel as WorkflowAutomationLevel)
        ? (input.automationLevel as WorkflowAutomationLevel)
        : "human_assisted";
    const now = new Date().toISOString();
    const workflow: Workflow = {
      id: `workflow-${randomUUID()}`,
      title,
      description: typeof input.description === "string" ? input.description.trim() : "",
      status: "draft",
      automationLevel,
      ownerAgentId,
      ...(typeof input.tentacleId === "string" && input.tentacleId.trim()
        ? { tentacleId: input.tentacleId.trim() }
        : {}),
      ...(typeof input.goalId === "string" && input.goalId.trim()
        ? { goalId: input.goalId.trim() }
        : {}),
      actionType:
        typeof input.actionType === "string" && input.actionType.trim()
          ? input.actionType.trim()
          : "workflow",
      actionContent:
        typeof input.actionContent === "string" && input.actionContent.trim()
          ? input.actionContent.trim()
          : title,
      sop: normalizeStringList(input.sop),
      successCriteria: normalizeStringList(input.successCriteria),
      allowedTools: normalizeStringList(input.allowedTools),
      createdAt: now,
      updatedAt: now,
    };
    const snapshot = readSnapshot();
    writeSnapshot({ workflows: [workflow, ...snapshot.workflows], runs: snapshot.runs });
    return workflow;
  };

  const updateStatus = (workflowId: string, status: WorkflowStatus) => {
    const snapshot = readSnapshot();
    const index = snapshot.workflows.findIndex((workflow) => workflow.id === workflowId);
    if (index < 0) return null;
    const existing = snapshot.workflows[index];
    if (!existing) return null;
    const updated = { ...existing, status, updatedAt: new Date().toISOString() };
    const workflows = [...snapshot.workflows];
    workflows[index] = updated;
    writeSnapshot({ workflows, runs: snapshot.runs });
    return updated;
  };

  const createRun = (input: Omit<WorkflowRun, "id" | "createdAt" | "updatedAt">): WorkflowRun => {
    const now = new Date().toISOString();
    const run: WorkflowRun = {
      ...input,
      id: `run-${randomUUID()}`,
      createdAt: now,
      updatedAt: now,
    };
    const snapshot = readSnapshot();
    writeSnapshot({ workflows: snapshot.workflows, runs: [run, ...snapshot.runs] });
    return run;
  };

  const decideRun = ({
    workflowId,
    runId,
    decision,
    note,
  }: {
    workflowId: string;
    runId: string;
    decision: "approved" | "rejected";
    note: string;
  }) => {
    const snapshot = readSnapshot();
    const index = snapshot.runs.findIndex(
      (run) => run.id === runId && run.workflowId === workflowId,
    );
    if (index < 0) return null;
    const existing = snapshot.runs[index];
    if (!existing || existing.status !== "awaiting_approval") return null;
    const now = new Date().toISOString();
    const updated: WorkflowRun = {
      ...existing,
      status: decision === "approved" ? "queued" : "cancelled",
      updatedAt: now,
      approval: { decision, decidedBy: "operator", note, decidedAt: now },
    };
    const runs = [...snapshot.runs];
    runs[index] = updated;
    writeSnapshot({ workflows: snapshot.workflows, runs });
    return updated;
  };

  const claimRun = ({
    workflowId,
    runId,
    terminalId,
    agentId,
  }: {
    workflowId: string;
    runId: string;
    terminalId: string;
    agentId: string;
  }):
    | { ok: true; run: WorkflowRun }
    | {
        ok: false;
        reason: "not_found" | "workflow_inactive" | "not_queued" | "already_claimed";
      } => {
    const snapshot = readSnapshot();
    const workflow = snapshot.workflows.find((candidate) => candidate.id === workflowId);
    if (!workflow) return { ok: false, reason: "not_found" };
    if (workflow.status !== "active") return { ok: false, reason: "workflow_inactive" };

    const index = snapshot.runs.findIndex(
      (run) => run.id === runId && run.workflowId === workflowId,
    );
    if (index < 0) return { ok: false, reason: "not_found" };
    const existing = snapshot.runs[index];
    if (!existing) return { ok: false, reason: "not_found" };
    if (existing.execution) return { ok: false, reason: "already_claimed" };
    if (existing.status !== "queued") return { ok: false, reason: "not_queued" };

    const now = new Date().toISOString();
    const updated: WorkflowRun = {
      ...existing,
      status: "running",
      updatedAt: now,
      execution: { terminalId, agentId, claimedAt: now, claimedBy: "runtime-worker" },
      summary: "Workflow run claimed by a manifest-scoped runtime worker.",
    };
    const runs = [...snapshot.runs];
    runs[index] = updated;
    writeSnapshot({ workflows: snapshot.workflows, runs });
    return { ok: true, run: updated };
  };

  const recordOutcome = ({
    workflowId,
    runId,
    outcome,
  }: {
    workflowId: string;
    runId: string;
    outcome: Omit<WorkflowRunOutcome, "completedAt">;
  }):
    | { ok: true; run: WorkflowRun }
    | {
        ok: false;
        reason: "not_found" | "not_running" | "missing_claim" | "already_completed";
      } => {
    const snapshot = readSnapshot();
    const index = snapshot.runs.findIndex(
      (run) => run.id === runId && run.workflowId === workflowId,
    );
    if (index < 0) return { ok: false, reason: "not_found" };
    const existing = snapshot.runs[index];
    if (!existing) return { ok: false, reason: "not_found" };
    if (existing.outcome) return { ok: false, reason: "already_completed" };
    if (!existing.execution) return { ok: false, reason: "missing_claim" };
    if (existing.status !== "running") return { ok: false, reason: "not_running" };

    const now = new Date().toISOString();
    const updated: WorkflowRun = {
      ...existing,
      status: outcome.status,
      summary: outcome.summary,
      updatedAt: now,
      outcome: { ...outcome, completedAt: now },
    };
    const runs = [...snapshot.runs];
    runs[index] = updated;
    writeSnapshot({ workflows: snapshot.workflows, runs });
    return { ok: true, run: updated };
  };

  return {
    create,
    createRun,
    claimRun,
    recordOutcome,
    decideRun,
    ensureInitialWorkflows,
    find,
    list,
    listRuns,
    updateStatus,
    workflowsPath,
  };
};
