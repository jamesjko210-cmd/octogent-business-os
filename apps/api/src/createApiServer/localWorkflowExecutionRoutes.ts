import { createAgentActivityStore } from "../agentActivityStore";
import {
  executeAllowlistedLocalWorkflow,
  isAllowlistedLocalWorkflow,
} from "../localWorkflowExecutor";
import { createWorkflowStore } from "../workflowStore";
import type { ApiRouteHandler } from "./routeHelpers";
import { readJsonBodyOrWriteError, writeJson, writeMethodNotAllowed } from "./routeHelpers";

const LOCAL_EXECUTION_PATTERN = /^\/api\/workflows\/([^/]+)\/runs\/([^/]+)\/execute-local$/;

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const handleLocalWorkflowExecutionRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { projectStateDir, runtime, workspaceCwd },
) => {
  const match = requestUrl.pathname.match(LOCAL_EXECUTION_PATTERN);
  if (!match) return false;

  if (request.method !== "POST") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const workflowId = decodeURIComponent(match[1] ?? "");
  const runId = decodeURIComponent(match[2] ?? "");
  const reject = (status: number, error: string, terminalId?: string) => {
    runtime.appendAuditEvent("workflow.run_local_execution_rejected", {
      ...(terminalId ? { terminalId } : {}),
      payload: { workflowId, runId, error },
    });
    writeJson(response, status, { error }, corsOrigin);
  };

  if (!isAllowlistedLocalWorkflow(workflowId)) {
    reject(404, "This workflow has no allowlisted local executor.");
    return true;
  }

  const bodyReadResult = await readJsonBodyOrWriteError(request, response, corsOrigin);
  if (!bodyReadResult.ok) return true;
  const payload = asRecord(bodyReadResult.payload);
  const terminalId = typeof payload.terminalId === "string" ? payload.terminalId.trim() : "";
  if (!terminalId) {
    reject(400, "terminalId is required.");
    return true;
  }

  const workflowStore = createWorkflowStore(projectStateDir);
  workflowStore.ensureInitialWorkflows();
  const workflow = workflowStore.find(workflowId);
  const run = workflowStore.listRuns(workflowId).find((candidate) => candidate.id === runId);
  if (!workflow || !run) {
    reject(404, "Workflow run not found.", terminalId);
    return true;
  }
  if (run.status !== "running" || run.execution?.terminalId !== terminalId) {
    reject(409, "Only the terminal that claimed a running workflow may execute it.", terminalId);
    return true;
  }
  if (workflow.ownerAgentId !== "codex-executor") {
    reject(409, "The local executor is limited to the Codex game-QA workflow.", terminalId);
    return true;
  }

  const terminal = runtime
    .listTerminalSnapshots()
    .find((snapshot) => snapshot.terminalId === terminalId);
  if (
    !terminal ||
    terminal.agentId !== workflow.ownerAgentId ||
    terminal.tentacleId !== workflow.tentacleId ||
    terminal.agentProvider !== "codex" ||
    terminal.lifecycleState === "stopped" ||
    terminal.lifecycleState === "exited" ||
    terminal.lifecycleState === "stale"
  ) {
    reject(409, "The claiming terminal is no longer eligible for local execution.", terminalId);
    return true;
  }

  const activityStore = createAgentActivityStore(projectStateDir);
  activityStore.update({
    agentId: "codex-executor",
    terminalId,
    status: "testing",
    summary: "Running the allowlisted Block Bounce verification checks.",
  });
  runtime.appendAuditEvent("workflow.run_local_execution_started", {
    terminalId,
    payload: { workflowId, runId, commandPlan: "block-bounce-node-tests" },
  });

  const executionResult = await executeAllowlistedLocalWorkflow({ workflowId, workspaceCwd });
  const outcomeResult = workflowStore.recordOutcome({
    workflowId,
    runId,
    outcome: executionResult.outcome,
  });
  if (!outcomeResult.ok) {
    activityStore.update({
      agentId: "codex-executor",
      terminalId,
      status: "waiting",
      summary: "Verification ended, but the workflow result could not be recorded.",
    });
    reject(409, "The workflow result could not be recorded.", terminalId);
    return true;
  }

  activityStore.update({
    agentId: "codex-executor",
    terminalId,
    status: executionResult.outcome.status === "succeeded" ? "reviewing" : "waiting",
    summary: executionResult.outcome.summary,
  });
  runtime.appendAuditEvent("workflow.run_local_execution_finished", {
    terminalId,
    payload: {
      workflowId,
      runId,
      status: outcomeResult.run.status,
      evidenceCount: outcomeResult.run.outcome?.evidence.length ?? 0,
    },
  });
  writeJson(response, 200, { run: outcomeResult.run }, corsOrigin);
  return true;
};
