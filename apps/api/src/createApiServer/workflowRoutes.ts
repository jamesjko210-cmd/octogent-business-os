import type {
  AgentManifest,
  RuntimePolicyDecision,
  TerminalSnapshot,
  Workflow,
  WorkflowRunEvidence,
  WorkflowRunOutcome,
  WorkflowRunStatus,
  WorkflowStatus,
} from "@octogent/core";

import { evaluateAgentManifest, findAgentManifest } from "../agentManifests";
import { findAgentRosterRole } from "../agentRoster";
import { createGoalStore } from "../goalStore";
import { evaluateRuntimePolicy } from "../runtimePolicies";
import { createWorkflowStore } from "../workflowStore";
import type { ApiRouteHandler } from "./routeHelpers";
import { readJsonBodyOrWriteError, writeJson, writeMethodNotAllowed } from "./routeHelpers";

const WORKFLOW_STATUSES = new Set<WorkflowStatus>(["draft", "active", "paused", "archived"]);
const RUN_INITIATORS = new Set(["operator", "agent", "scheduler"]);
const RUN_ITEM_PATTERN = /^\/api\/workflows\/([^/]+)\/runs\/([^/]+)$/;
const RUN_CLAIM_PATTERN = /^\/api\/workflows\/([^/]+)\/runs\/([^/]+)\/claim$/;
const RUN_OUTCOME_PATTERN = /^\/api\/workflows\/([^/]+)\/runs\/([^/]+)\/outcome$/;
const RUNS_PATTERN = /^\/api\/workflows\/([^/]+)\/runs$/;
const WORKFLOW_ITEM_PATTERN = /^\/api\/workflows\/([^/]+)$/;
const OUTCOME_STATUSES = new Set<WorkflowRunOutcome["status"]>(["succeeded", "blocked", "failed"]);
const EVIDENCE_KINDS = new Set<WorkflowRunEvidence["kind"]>(["test", "tool", "note"]);
const MAX_EVIDENCE_ITEMS = 20;
const MAX_EVIDENCE_SUMMARY_LENGTH = 600;
const MAX_OUTCOME_SUMMARY_LENGTH = 800;
const NONTERMINAL_GOAL_RUN_STATUSES = new Set<WorkflowRunStatus>([
  "queued",
  "running",
  "awaiting_approval",
  "blocked",
]);

const decisionRank: Record<RuntimePolicyDecision, number> = {
  allow: 0,
  requires_approval: 1,
  deny: 2,
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const redactSensitiveText = (value: string) =>
  value
    .replace(
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
      "[redacted private key]",
    )
    .replace(/\b(?:sk|pk|ghp|github_pat)_[A-Za-z0-9_-]+\b/gi, "[redacted credential]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+/gi, "Bearer [redacted]")
    .replace(/\b(api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]\s*\S+/gi, "$1=[redacted]");

const toBoundedSummary = (value: unknown, maxLength: number) =>
  typeof value === "string" ? redactSensitiveText(value.trim()).slice(0, maxLength).trim() : "";

const parseOutcomeEvidence = (value: unknown): WorkflowRunEvidence[] => {
  if (!Array.isArray(value)) return [];

  const recordedAt = new Date().toISOString();
  return value.slice(0, MAX_EVIDENCE_ITEMS).flatMap((entry) => {
    const candidate = asRecord(entry);
    const kind = candidate.kind;
    const summary = toBoundedSummary(candidate.summary, MAX_EVIDENCE_SUMMARY_LENGTH);
    if (
      typeof kind !== "string" ||
      !EVIDENCE_KINDS.has(kind as WorkflowRunEvidence["kind"]) ||
      !summary
    ) {
      return [];
    }
    return [
      {
        kind: kind as WorkflowRunEvidence["kind"],
        summary,
        occurredAt:
          typeof candidate.occurredAt === "string" &&
          !Number.isNaN(Date.parse(candidate.occurredAt))
            ? candidate.occurredAt
            : recordedAt,
      },
    ];
  });
};

const isSingleWorkerClaimCandidate = (
  terminal: TerminalSnapshot,
  workflow: Workflow,
  manifest: AgentManifest,
) =>
  terminal.lifecycleState === "running" &&
  terminal.state === "live" &&
  terminal.agentProvider === manifest.provider &&
  terminal.agentId === workflow.ownerAgentId &&
  (!workflow.tentacleId || terminal.tentacleId === workflow.tentacleId) &&
  (!terminal.workspaceMode || terminal.workspaceMode === manifest.scope.workspaceMode) &&
  (!terminal.agentRuntimeState || terminal.agentRuntimeState === "idle");

export const handleWorkflowsRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { projectStateDir, runtime },
) => {
  if (requestUrl.pathname !== "/api/workflows") return false;

  const workflowStore = createWorkflowStore(projectStateDir);
  const initialized = workflowStore.ensureInitialWorkflows();

  if (request.method === "GET") {
    const rawStatus = requestUrl.searchParams.get("status")?.trim();
    const status =
      rawStatus && WORKFLOW_STATUSES.has(rawStatus as WorkflowStatus)
        ? (rawStatus as WorkflowStatus)
        : undefined;
    const tentacleId = requestUrl.searchParams.get("tentacleId")?.trim() || undefined;
    const workflowFilters: { tentacleId?: string; status?: WorkflowStatus } = {};
    if (tentacleId) {
      workflowFilters.tentacleId = tentacleId;
    }
    if (status) {
      workflowFilters.status = status;
    }
    const workflows = workflowStore.list(workflowFilters);
    const runs = workflowStore.listRuns();
    runtime.appendAuditEvent("workflows.listed", {
      payload: { initialized, count: workflows.length, runCount: runs.length },
    });
    writeJson(response, 200, { workflows, runs }, corsOrigin);
    return true;
  }

  if (request.method !== "POST") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const bodyReadResult = await readJsonBodyOrWriteError(request, response, corsOrigin);
  if (!bodyReadResult.ok) return true;

  try {
    const workflowInput = asRecord(bodyReadResult.payload);
    const ownerAgentId =
      typeof workflowInput.ownerAgentId === "string" ? workflowInput.ownerAgentId.trim() : "";
    const owner = ownerAgentId ? findAgentRosterRole(ownerAgentId) : null;
    const manifest = owner ? findAgentManifest(owner.id) : null;
    if (!owner || !manifest) {
      writeJson(
        response,
        400,
        { error: "Workflow owner must be a permanent agent role with a policy manifest." },
        corsOrigin,
      );
      return true;
    }
    if (
      (typeof workflowInput.tentacleId === "string" &&
        workflowInput.tentacleId.trim() !== owner.tentacleId) ||
      !manifest.scope.tentacleIds.includes(owner.tentacleId)
    ) {
      writeJson(
        response,
        400,
        { error: "A workflow owner must use that role's assigned tentacle and policy scope." },
        corsOrigin,
      );
      return true;
    }
    const normalizedWorkflowInput = {
      ...workflowInput,
      ownerAgentId: owner.id,
      tentacleId: owner.tentacleId,
    };
    const goalId = typeof workflowInput.goalId === "string" ? workflowInput.goalId.trim() : "";
    if (goalId) {
      const goal = createGoalStore(projectStateDir).find(goalId);
      if (!goal) {
        writeJson(response, 400, { error: "Linked goal was not found." }, corsOrigin);
        return true;
      }
      if (!goal.ownerAgentId || !goal.tentacleId) {
        writeJson(
          response,
          409,
          { error: "Assign a permanent owner before linking a goal to a workflow." },
          corsOrigin,
        );
        return true;
      }
      if (
        owner.id !== goal.ownerAgentId ||
        normalizedWorkflowInput.tentacleId !== goal.tentacleId
      ) {
        writeJson(
          response,
          409,
          { error: "A linked workflow must match the goal owner's role and tentacle." },
          corsOrigin,
        );
        return true;
      }
    }
    const workflow = workflowStore.create(normalizedWorkflowInput);
    runtime.appendAuditEvent("workflow.created", {
      payload: {
        workflowId: workflow.id,
        ownerAgentId: workflow.ownerAgentId,
        automationLevel: workflow.automationLevel,
        goalId: workflow.goalId ?? null,
      },
    });
    writeJson(response, 201, workflow, corsOrigin);
  } catch (error) {
    writeJson(
      response,
      400,
      { error: error instanceof Error ? error.message : "Invalid workflow." },
      corsOrigin,
    );
  }
  return true;
};

export const handleWorkflowItemRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { projectStateDir, runtime },
) => {
  const match = requestUrl.pathname.match(WORKFLOW_ITEM_PATTERN);
  if (!match) return false;

  if (request.method !== "PATCH") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const bodyReadResult = await readJsonBodyOrWriteError(request, response, corsOrigin);
  if (!bodyReadResult.ok) return true;
  const rawStatus = asRecord(bodyReadResult.payload).status;
  if (typeof rawStatus !== "string" || !WORKFLOW_STATUSES.has(rawStatus as WorkflowStatus)) {
    writeJson(response, 400, { error: "status must be a valid workflow status." }, corsOrigin);
    return true;
  }

  const workflowId = decodeURIComponent(match[1] ?? "");
  const workflowStore = createWorkflowStore(projectStateDir);
  workflowStore.ensureInitialWorkflows();
  const workflow = workflowStore.updateStatus(workflowId, rawStatus as WorkflowStatus);
  if (!workflow) {
    writeJson(response, 404, { error: "Workflow not found." }, corsOrigin);
    return true;
  }

  runtime.appendAuditEvent("workflow.status_changed", {
    payload: { workflowId: workflow.id, status: workflow.status },
  });
  writeJson(response, 200, workflow, corsOrigin);
  return true;
};

export const handleWorkflowRunsRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { projectStateDir, runtime },
) => {
  const match = requestUrl.pathname.match(RUNS_PATTERN);
  if (!match) return false;

  if (request.method !== "POST") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const workflowId = decodeURIComponent(match[1] ?? "");
  const workflowStore = createWorkflowStore(projectStateDir);
  workflowStore.ensureInitialWorkflows();
  const workflow = workflowStore.find(workflowId);
  if (!workflow) {
    writeJson(response, 404, { error: "Workflow not found." }, corsOrigin);
    return true;
  }
  if (workflow.status !== "active") {
    writeJson(response, 409, { error: "Only active workflows can be run." }, corsOrigin);
    return true;
  }

  const bodyReadResult = await readJsonBodyOrWriteError(request, response, corsOrigin);
  if (!bodyReadResult.ok) return true;
  const payload = asRecord(bodyReadResult.payload);
  const initiatedBy =
    typeof payload.initiatedBy === "string" && RUN_INITIATORS.has(payload.initiatedBy)
      ? (payload.initiatedBy as "operator" | "agent" | "scheduler")
      : "operator";
  const requestedGoalId = typeof payload.goalId === "string" ? payload.goalId.trim() : "";
  const goalId = requestedGoalId || workflow.goalId;
  if (goalId) {
    const goal = createGoalStore(projectStateDir).find(goalId);
    if (!goal) {
      writeJson(response, 400, { error: "Linked goal was not found." }, corsOrigin);
      return true;
    }
    if (goal.ownerAgentId !== workflow.ownerAgentId || goal.tentacleId !== workflow.tentacleId) {
      writeJson(
        response,
        409,
        { error: "A goal-linked run must match the workflow owner and tentacle." },
        corsOrigin,
      );
      return true;
    }
    const existingGoalRun = workflowStore
      .listRuns()
      .find((run) => run.goalId === goalId && NONTERMINAL_GOAL_RUN_STATUSES.has(run.status));
    if (existingGoalRun) {
      writeJson(
        response,
        409,
        { error: "This goal already has an unfinished workflow run." },
        corsOrigin,
      );
      return true;
    }
  }
  const globalEvaluation = evaluateRuntimePolicy({
    actionType: workflow.actionType,
    content: workflow.actionContent,
  });
  const agentEvaluation = evaluateAgentManifest({
    agentId: workflow.ownerAgentId,
    actionType: workflow.actionType,
    content: workflow.actionContent,
  });
  const decision =
    decisionRank[globalEvaluation.decision] >= decisionRank[agentEvaluation?.decision ?? "allow"]
      ? globalEvaluation.decision
      : (agentEvaluation?.decision ?? "allow");
  const requiresHumanStart = workflow.automationLevel === "human_led" && initiatedBy !== "operator";
  const status: WorkflowRunStatus =
    decision === "deny"
      ? "denied"
      : decision === "requires_approval" || requiresHumanStart
        ? "awaiting_approval"
        : "queued";
  const run = workflowStore.createRun({
    workflowId: workflow.id,
    ...(goalId ? { goalId } : {}),
    status,
    initiatedBy,
    policy: {
      decision,
      rationale: [globalEvaluation.rationale, agentEvaluation?.rationale].filter(Boolean).join(" "),
      matchedGlobalPolicyIds: globalEvaluation.matchedPolicies.map((policy) => policy.id),
      matchedAgentPolicyIds: agentEvaluation?.matchedPolicies.map((policy) => policy.id) ?? [],
    },
    summary:
      status === "awaiting_approval"
        ? requiresHumanStart
          ? "Human-led workflow run is waiting for an operator to start it."
          : "Protected workflow run is waiting for operator approval."
        : status === "denied"
          ? "Workflow run was denied by runtime policy."
          : "Workflow run is queued. A later runtime worker may claim this safe run.",
  });
  runtime.appendAuditEvent("workflow.run_created", {
    payload: {
      workflowId: workflow.id,
      runId: run.id,
      initiatedBy,
      status: run.status,
      decision,
    },
  });
  writeJson(response, 201, run, corsOrigin);
  return true;
};

export const handleWorkflowRunItemRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { projectStateDir, runtime },
) => {
  const match = requestUrl.pathname.match(RUN_ITEM_PATTERN);
  if (!match) return false;

  if (request.method !== "PATCH") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const bodyReadResult = await readJsonBodyOrWriteError(request, response, corsOrigin);
  if (!bodyReadResult.ok) return true;
  const payload = asRecord(bodyReadResult.payload);
  const decision = payload.decision;
  if (decision !== "approved" && decision !== "rejected") {
    writeJson(response, 400, { error: "decision must be approved or rejected." }, corsOrigin);
    return true;
  }

  const workflowId = decodeURIComponent(match[1] ?? "");
  const runId = decodeURIComponent(match[2] ?? "");
  const note = typeof payload.note === "string" ? payload.note.trim() : "";
  const run = createWorkflowStore(projectStateDir).decideRun({ workflowId, runId, decision, note });
  if (!run) {
    writeJson(
      response,
      409,
      { error: "Only pending workflow approvals can be decided." },
      corsOrigin,
    );
    return true;
  }

  runtime.appendAuditEvent("workflow.run_approval_decided", {
    payload: { workflowId, runId: run.id, decision, status: run.status },
  });
  writeJson(response, 200, run, corsOrigin);
  return true;
};

export const handleWorkflowRunClaimRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { projectStateDir, runtime },
) => {
  const match = requestUrl.pathname.match(RUN_CLAIM_PATTERN);
  if (!match) return false;

  if (request.method !== "POST") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const bodyReadResult = await readJsonBodyOrWriteError(request, response, corsOrigin);
  if (!bodyReadResult.ok) return true;
  const payload = asRecord(bodyReadResult.payload);
  let terminalId = typeof payload.terminalId === "string" ? payload.terminalId.trim() : "";
  const selectSingleEligibleWorker = payload.selectSingleEligibleWorker === true;
  const workflowId = decodeURIComponent(match[1] ?? "");
  const runId = decodeURIComponent(match[2] ?? "");
  const workflowStore = createWorkflowStore(projectStateDir);
  workflowStore.ensureInitialWorkflows();
  const workflow = workflowStore.find(workflowId);
  const run = workflowStore.listRuns(workflowId).find((candidate) => candidate.id === runId);

  runtime.appendAuditEvent("workflow.run_claim_requested", {
    ...(terminalId ? { terminalId } : {}),
    payload: {
      workflowId,
      runId,
      requestedTerminalId: terminalId || null,
      selection: selectSingleEligibleWorker ? "single_eligible_worker" : "explicit_terminal",
    },
  });

  const reject = (status: number, error: string) => {
    runtime.appendAuditEvent("workflow.run_claim_rejected", {
      ...(terminalId ? { terminalId } : {}),
      payload: { workflowId, runId, error },
    });
    writeJson(response, status, { error }, corsOrigin);
  };

  if (!workflow || !run) {
    reject(404, "Workflow run not found.");
    return true;
  }
  if (workflow.status !== "active") {
    reject(409, "Only active workflows can be claimed.");
    return true;
  }
  if (run.status !== "queued") {
    reject(409, "Only queued workflow runs can be claimed.");
    return true;
  }

  const manifest = findAgentManifest(workflow.ownerAgentId);
  if (!manifest) {
    reject(409, "The workflow owner has no registered agent manifest.");
    return true;
  }

  if (!terminalId && selectSingleEligibleWorker) {
    const eligibleTerminals = runtime
      .listTerminalSnapshots()
      .filter((terminal) => isSingleWorkerClaimCandidate(terminal, workflow, manifest));
    if (eligibleTerminals.length === 0) {
      reject(409, "No eligible worker is available to claim this workflow run.");
      return true;
    }
    if (eligibleTerminals.length > 1) {
      reject(409, "More than one eligible worker is available. Select a terminal explicitly.");
      return true;
    }
    terminalId = eligibleTerminals[0]?.terminalId ?? "";
  }
  if (!terminalId) {
    reject(400, "terminalId or selectSingleEligibleWorker is required.");
    return true;
  }

  const terminal = runtime
    .listTerminalSnapshots()
    .find((candidate) => candidate.terminalId === terminalId);
  if (!terminal) {
    reject(404, "Terminal not found.");
    return true;
  }
  if (terminal.agentProvider !== manifest.provider) {
    reject(409, "Terminal provider does not match the workflow owner manifest.");
    return true;
  }
  if (terminal.agentId !== workflow.ownerAgentId) {
    reject(409, "Terminal identity does not match the workflow owner role.");
    return true;
  }
  if (workflow.tentacleId && terminal.tentacleId !== workflow.tentacleId) {
    reject(409, "Terminal tentacle does not match the workflow scope.");
    return true;
  }
  if (terminal.workspaceMode && terminal.workspaceMode !== manifest.scope.workspaceMode) {
    reject(409, "Terminal workspace mode does not match the workflow owner manifest.");
    return true;
  }
  if (terminal.lifecycleState !== "running" || terminal.state !== "live") {
    reject(409, "Workflow claims require a running role terminal.");
    return true;
  }
  if (terminal.agentRuntimeState && terminal.agentRuntimeState !== "idle") {
    reject(409, "Terminal is already processing another task.");
    return true;
  }

  const globalEvaluation = evaluateRuntimePolicy({
    actionType: workflow.actionType,
    content: workflow.actionContent,
  });
  const agentEvaluation = evaluateAgentManifest({
    agentId: workflow.ownerAgentId,
    actionType: workflow.actionType,
    content: workflow.actionContent,
  });
  const currentDecision =
    decisionRank[globalEvaluation.decision] >= decisionRank[agentEvaluation?.decision ?? "allow"]
      ? globalEvaluation.decision
      : (agentEvaluation?.decision ?? "allow");
  if (currentDecision === "deny") {
    reject(409, "Current runtime policy denies this workflow claim.");
    return true;
  }
  if (currentDecision === "requires_approval" && run.approval?.decision !== "approved") {
    reject(409, "Fresh operator approval is required before this run can be claimed.");
    return true;
  }

  const result = workflowStore.claimRun({
    workflowId,
    runId,
    terminalId,
    agentId: workflow.ownerAgentId,
  });
  if (!result.ok) {
    const message =
      result.reason === "already_claimed"
        ? "Workflow run is already claimed."
        : result.reason === "not_queued"
          ? "Only queued workflow runs can be claimed."
          : "Workflow run is no longer eligible for claiming.";
    reject(409, message);
    return true;
  }

  runtime.appendAuditEvent("workflow.run_claimed", {
    terminalId,
    payload: { workflowId, runId, agentId: workflow.ownerAgentId, status: result.run.status },
  });
  writeJson(response, 200, result.run, corsOrigin);
  return true;
};

export const handleWorkflowRunOutcomeRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { projectStateDir, runtime },
) => {
  const match = requestUrl.pathname.match(RUN_OUTCOME_PATTERN);
  if (!match) return false;

  if (request.method !== "POST") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const bodyReadResult = await readJsonBodyOrWriteError(request, response, corsOrigin);
  if (!bodyReadResult.ok) return true;
  const payload = asRecord(bodyReadResult.payload);
  const status = payload.status;
  const summary = toBoundedSummary(payload.summary, MAX_OUTCOME_SUMMARY_LENGTH);
  const workflowId = decodeURIComponent(match[1] ?? "");
  const runId = decodeURIComponent(match[2] ?? "");
  const existingRun = createWorkflowStore(projectStateDir)
    .listRuns(workflowId)
    .find((candidate) => candidate.id === runId);
  const terminalId = existingRun?.execution?.terminalId;

  const reject = (statusCode: number, error: string) => {
    runtime.appendAuditEvent("workflow.run_outcome_rejected", {
      ...(terminalId ? { terminalId } : {}),
      payload: { workflowId, runId, error },
    });
    writeJson(response, statusCode, { error }, corsOrigin);
  };

  if (typeof status !== "string" || !OUTCOME_STATUSES.has(status as WorkflowRunOutcome["status"])) {
    reject(400, "status must be succeeded, blocked, or failed.");
    return true;
  }
  if (!summary) {
    reject(400, "summary is required.");
    return true;
  }

  const outcome = {
    status: status as WorkflowRunOutcome["status"],
    summary,
    evidence: parseOutcomeEvidence(payload.evidence),
  };
  const result = createWorkflowStore(projectStateDir).recordOutcome({ workflowId, runId, outcome });
  if (!result.ok) {
    const message =
      result.reason === "already_completed"
        ? "Workflow run already has an outcome."
        : result.reason === "missing_claim"
          ? "A workflow run must be claimed before an outcome can be recorded."
          : result.reason === "not_running"
            ? "Only running workflow runs can record an outcome."
            : "Workflow run not found.";
    reject(result.reason === "not_found" ? 404 : 409, message);
    return true;
  }

  runtime.appendAuditEvent("workflow.run_outcome_recorded", {
    ...(result.run.execution?.terminalId ? { terminalId: result.run.execution.terminalId } : {}),
    payload: {
      workflowId,
      runId,
      status: result.run.status,
      evidenceCount: result.run.outcome?.evidence.length ?? 0,
    },
  });
  writeJson(response, 200, result.run, corsOrigin);
  return true;
};
