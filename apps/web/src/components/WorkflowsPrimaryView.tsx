import { type FormEvent, useCallback, useEffect, useState } from "react";

import type { Workflow, WorkflowAutomationLevel, WorkflowRun, WorkflowStatus } from "../app/types";
import {
  buildWorkflowRunClaimUrl,
  buildWorkflowRunDecisionUrl,
  buildWorkflowRunLocalExecutionUrl,
  buildWorkflowRunsUrl,
  buildWorkflowStatusUrl,
  buildWorkflowsUrl,
} from "../runtime/runtimeEndpoints";
import { ActionButton } from "./ui/ActionButton";

type WorkflowsPrimaryViewProps = {
  enabled: boolean;
};

type WorkflowApiResponse = {
  workflows?: Workflow[];
  runs?: WorkflowRun[];
  error?: string;
};

type WorkflowDraft = {
  title: string;
  description: string;
  ownerAgentId: string;
  tentacleId: string;
  automationLevel: WorkflowAutomationLevel;
  actionType: string;
  actionContent: string;
  sop: string;
  successCriteria: string;
  allowedTools: string;
  goalId: string;
};

const EMPTY_DRAFT: WorkflowDraft = {
  title: "",
  description: "",
  ownerAgentId: "codex-executor",
  tentacleId: "game-business",
  automationLevel: "human_assisted",
  actionType: "workflow",
  actionContent: "",
  sop: "",
  successCriteria: "",
  allowedTools: "",
  goalId: "",
};

const OWNER_OPTIONS = [
  { value: "codex-executor", label: "Codex Executor" },
  { value: "ceo-command", label: "CEO Command" },
  { value: "execution-ops", label: "Execution Ops" },
  { value: "debugging-council", label: "Debugging Council" },
  { value: "research-triad", label: "Research Triad" },
  { value: "market-analysis", label: "Market Analysis" },
  { value: "record-center", label: "Record Center" },
  { value: "stitch-ui-production", label: "Stitch UI Production" },
];

const automationLabels: Record<WorkflowAutomationLevel, string> = {
  human_led: "Human led",
  human_assisted: "Human assisted",
  autonomous: "Autonomous",
};

const statusLabels: Record<WorkflowStatus, string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  archived: "Archived",
};

const splitLines = (value: string) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const toErrorMessage = (payload: unknown, fallback: string) =>
  typeof payload === "object" &&
  payload !== null &&
  "error" in payload &&
  typeof payload.error === "string"
    ? payload.error
    : fallback;

const formatRunTime = (timestamp: string) => {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? "Unknown time"
    : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
};

const ownerLabel = (ownerAgentId: string) =>
  OWNER_OPTIONS.find((owner) => owner.value === ownerAgentId)?.label ?? ownerAgentId;

export const WorkflowsPrimaryView = ({ enabled }: WorkflowsPrimaryViewProps) => {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [draft, setDraft] = useState<WorkflowDraft>(EMPTY_DRAFT);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(buildWorkflowsUrl(), {
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json().catch(() => ({}))) as WorkflowApiResponse;
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Unable to load workflow registry."));
      }
      setWorkflows(Array.isArray(payload.workflows) ? payload.workflows : []);
      setRuns(Array.isArray(payload.runs) ? payload.runs : []);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load workflow registry.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      void refresh();
    }
  }, [enabled, refresh]);

  const updateStatus = async (workflowId: string, status: WorkflowStatus) => {
    setPendingAction(`status:${workflowId}`);
    setNotice(null);
    try {
      const response = await fetch(buildWorkflowStatusUrl(workflowId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = (await response.json().catch(() => ({}))) as WorkflowApiResponse;
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Unable to update workflow status."));
      }
      setNotice(`Workflow is now ${statusLabels[status].toLowerCase()}.`);
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update workflow status.");
    } finally {
      setPendingAction(null);
    }
  };

  const requestRun = async (workflow: Workflow) => {
    setPendingAction(`run:${workflow.id}`);
    setNotice(null);
    try {
      const response = await fetch(buildWorkflowRunsUrl(workflow.id), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initiatedBy: "operator" }),
      });
      const payload = (await response.json().catch(() => ({}))) as WorkflowRun & { error?: string };
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Unable to queue workflow run."));
      }
      setNotice(
        payload.status === "awaiting_approval"
          ? "Run is waiting for approval. No work has been dispatched."
          : payload.status === "denied"
            ? "Run was denied by policy. No work has been dispatched."
            : "Safe run recorded as queued. Execution remains disabled until a runtime worker claims it.",
      );
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to queue workflow run.");
    } finally {
      setPendingAction(null);
    }
  };

  const decideRun = async (
    workflowId: string,
    runId: string,
    decision: "approved" | "rejected",
  ) => {
    setPendingAction(`approval:${runId}`);
    setNotice(null);
    try {
      const response = await fetch(buildWorkflowRunDecisionUrl(workflowId, runId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const payload = (await response.json().catch(() => ({}))) as WorkflowRun & { error?: string };
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Unable to decide workflow approval."));
      }
      setNotice(
        decision === "approved"
          ? "Approval recorded. The run is queued, not automatically executed."
          : "Run rejected and cancelled.",
      );
      await refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to decide workflow approval.",
      );
    } finally {
      setPendingAction(null);
    }
  };

  const claimSingleEligibleWorker = async (workflowId: string, runId: string) => {
    setPendingAction(`claim:${runId}`);
    setNotice(null);
    try {
      const response = await fetch(buildWorkflowRunClaimUrl(workflowId, runId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectSingleEligibleWorker: true }),
      });
      const payload = (await response.json().catch(() => ({}))) as WorkflowRun & { error?: string };
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Unable to claim an eligible workflow worker."));
      }
      setNotice(
        "The single eligible worker claimed this run. Review the recorded binding before continuing.",
      );
      await refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to claim an eligible workflow worker.",
      );
    } finally {
      setPendingAction(null);
    }
  };

  const executeLocalRun = async (workflowId: string, runId: string, terminalId: string) => {
    setPendingAction(`execute:${runId}`);
    setNotice(null);
    try {
      const response = await fetch(buildWorkflowRunLocalExecutionUrl(workflowId, runId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terminalId }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Unable to run the allowlisted verification."));
      }
      setNotice(
        "Allowlisted local verification completed. The recorded outcome is now visible below.",
      );
      await refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to run the allowlisted verification.",
      );
    } finally {
      setPendingAction(null);
    }
  };

  const createWorkflow = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsCreating(true);
    setNotice(null);
    try {
      const response = await fetch(buildWorkflowsUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          description: draft.description,
          ownerAgentId: draft.ownerAgentId,
          tentacleId: draft.tentacleId,
          automationLevel: draft.automationLevel,
          actionType: draft.actionType,
          actionContent: draft.actionContent,
          sop: splitLines(draft.sop),
          successCriteria: splitLines(draft.successCriteria),
          allowedTools: splitLines(draft.allowedTools),
          ...(draft.goalId.trim() ? { goalId: draft.goalId.trim() } : {}),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as Workflow & { error?: string };
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Unable to create workflow."));
      }
      setDraft(EMPTY_DRAFT);
      setNotice("Workflow created as a draft. Review it, then activate it when ready.");
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to create workflow.");
    } finally {
      setIsCreating(false);
    }
  };

  const activeCount = workflows.filter((workflow) => workflow.status === "active").length;
  const autonomousCount = workflows.filter(
    (workflow) => workflow.automationLevel === "autonomous",
  ).length;
  const pendingApprovalCount = runs.filter((run) => run.status === "awaiting_approval").length;

  return (
    <section className="workflows-view" aria-label="Workflow registry">
      <header className="workflow-command-header">
        <div>
          <p className="workflow-kicker">Agent OS workflow registry</p>
          <h2>Persistent work, clear ownership, visible control.</h2>
          <p>
            Every workflow has an owner, SOP, autonomy level, policy check, and durable run record.
            Queued work must be claimed by a matching terminal before it can be handled.
          </p>
        </div>
        <ActionButton
          aria-label="Refresh workflow registry"
          disabled={isLoading}
          onClick={() => {
            void refresh();
          }}
          variant="info"
        >
          {isLoading ? "Refreshing..." : "Refresh registry"}
        </ActionButton>
      </header>

      <section className="workflow-summary-grid" aria-label="Workflow summary">
        <article className="workflow-summary-card">
          <strong>{activeCount}</strong>
          <span>active workflows</span>
        </article>
        <article className="workflow-summary-card" data-tone="autonomous">
          <strong>{autonomousCount}</strong>
          <span>autonomous workflows</span>
        </article>
        <article className="workflow-summary-card" data-tone="approval">
          <strong>{pendingApprovalCount}</strong>
          <span>awaiting approval</span>
        </article>
      </section>

      {(errorMessage || notice) && (
        <output className="workflow-notice" data-tone={errorMessage ? "error" : "success"}>
          {errorMessage ?? notice}
        </output>
      )}

      <section className="workflow-workbench">
        <form className="workflow-create-panel" onSubmit={(event) => void createWorkflow(event)}>
          <div>
            <p className="workflow-kicker">Build a workflow</p>
            <h3>Create a reusable operating procedure</h3>
            <p>
              New workflows begin as drafts. A person activates them after reviewing their scope.
            </p>
          </div>

          <label>
            Title
            <input
              onChange={(event) =>
                setDraft((current) => ({ ...current, title: event.target.value }))
              }
              placeholder="Example: Weekly game QA report"
              required
              value={draft.title}
            />
          </label>
          <label>
            Purpose
            <textarea
              onChange={(event) =>
                setDraft((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="What result should this workflow produce?"
              rows={3}
              value={draft.description}
            />
          </label>
          <div className="workflow-form-grid">
            <label>
              Owner
              <select
                onChange={(event) =>
                  setDraft((current) => ({ ...current, ownerAgentId: event.target.value }))
                }
                value={draft.ownerAgentId}
              >
                {OWNER_OPTIONS.map((owner) => (
                  <option key={owner.value} value={owner.value}>
                    {owner.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Autonomy
              <select
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    automationLevel: event.target.value as WorkflowAutomationLevel,
                  }))
                }
                value={draft.automationLevel}
              >
                <option value="human_led">Human led</option>
                <option value="human_assisted">Human assisted</option>
                <option value="autonomous">Autonomous</option>
              </select>
            </label>
          </div>
          <div className="workflow-form-grid">
            <label>
              Tentacle
              <input
                onChange={(event) =>
                  setDraft((current) => ({ ...current, tentacleId: event.target.value }))
                }
                placeholder="game-business"
                value={draft.tentacleId}
              />
            </label>
            <label>
              Action type
              <input
                onChange={(event) =>
                  setDraft((current) => ({ ...current, actionType: event.target.value }))
                }
                placeholder="research, test, write"
                value={draft.actionType}
              />
            </label>
          </div>
          <label>
            Linked Goal ID (optional)
            <input
              onChange={(event) =>
                setDraft((current) => ({ ...current, goalId: event.target.value }))
              }
              placeholder="goal-... from Goal Command Center"
              value={draft.goalId}
            />
          </label>
          <label>
            Requested action
            <textarea
              onChange={(event) =>
                setDraft((current) => ({ ...current, actionContent: event.target.value }))
              }
              placeholder="Describe the work so policy can evaluate it before every run."
              required
              rows={3}
              value={draft.actionContent}
            />
          </label>
          <label>
            SOP steps, one per line
            <textarea
              onChange={(event) => setDraft((current) => ({ ...current, sop: event.target.value }))}
              placeholder="Read the source of truth\nDo scoped work\nRecord evidence and next step"
              rows={4}
              value={draft.sop}
            />
          </label>
          <label>
            Success criteria, one per line
            <textarea
              onChange={(event) =>
                setDraft((current) => ({ ...current, successCriteria: event.target.value }))
              }
              placeholder="Sources are cited\nResult is ready for review"
              rows={3}
              value={draft.successCriteria}
            />
          </label>
          <label>
            Allowed tools, one per line
            <textarea
              onChange={(event) =>
                setDraft((current) => ({ ...current, allowedTools: event.target.value }))
              }
              placeholder="terminal\ntests\nrecord-center"
              rows={3}
              value={draft.allowedTools}
            />
          </label>
          <ActionButton disabled={isCreating} type="submit" variant="primary">
            {isCreating ? "Creating..." : "Create draft workflow"}
          </ActionButton>
        </form>

        <section className="workflow-list-panel" aria-label="Workflow list">
          <header>
            <div>
              <p className="workflow-kicker">Operating procedures</p>
              <h3>{workflows.length} registered workflows</h3>
            </div>
            <p className="workflow-policy-key">
              Policy checks happen every time a run is requested.
            </p>
          </header>

          <div className="workflow-card-grid">
            {workflows.map((workflow) => {
              const workflowRuns = runs.filter((run) => run.workflowId === workflow.id);
              const latestRun = workflowRuns[0];
              const isPending =
                pendingAction === `status:${workflow.id}` || pendingAction === `run:${workflow.id}`;
              return (
                <article
                  className="workflow-card"
                  data-level={workflow.automationLevel}
                  data-status={workflow.status}
                  key={workflow.id}
                >
                  <header className="workflow-card-header">
                    <div>
                      <span className="workflow-card-eyebrow">
                        {automationLabels[workflow.automationLevel]}
                      </span>
                      <h4>{workflow.title}</h4>
                    </div>
                    <span className="workflow-status-badge">{statusLabels[workflow.status]}</span>
                  </header>
                  <p className="workflow-card-description">
                    {workflow.description || "No description yet."}
                  </p>
                  <dl className="workflow-metadata">
                    <div>
                      <dt>Owner</dt>
                      <dd>{ownerLabel(workflow.ownerAgentId)}</dd>
                    </div>
                    <div>
                      <dt>Tentacle</dt>
                      <dd>{workflow.tentacleId ?? "System"}</dd>
                    </div>
                    <div>
                      <dt>Action</dt>
                      <dd>{workflow.actionType}</dd>
                    </div>
                    {workflow.goalId ? (
                      <div>
                        <dt>Goal</dt>
                        <dd>{workflow.goalId}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {workflow.sop.length > 0 && (
                    <section className="workflow-detail-list">
                      <h5>SOP</h5>
                      <ol>
                        {workflow.sop.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                    </section>
                  )}
                  {workflow.successCriteria.length > 0 && (
                    <section className="workflow-detail-list">
                      <h5>Success check</h5>
                      <ul>
                        {workflow.successCriteria.map((criterion) => (
                          <li key={criterion}>{criterion}</li>
                        ))}
                      </ul>
                    </section>
                  )}
                  <section
                    className="workflow-run-history"
                    aria-label={`${workflow.title} run history`}
                  >
                    <h5>Latest run</h5>
                    {latestRun ? (
                      <div className="workflow-run-row" data-status={latestRun.status}>
                        <div>
                          <strong>{latestRun.status.replaceAll("_", " ")}</strong>
                          <span>{formatRunTime(latestRun.updatedAt)}</span>
                        </div>
                        <p>{latestRun.summary}</p>
                        {latestRun.execution && (
                          <span className="workflow-run-binding">
                            Claimed by {latestRun.execution.agentId} on{" "}
                            {latestRun.execution.terminalId}
                          </span>
                        )}
                        {latestRun.outcome && (
                          <section className="workflow-run-outcome">
                            <strong>Recorded outcome</strong>
                            <p>{latestRun.outcome.summary}</p>
                            {latestRun.outcome.evidence.length > 0 && (
                              <ul>
                                {latestRun.outcome.evidence.map((evidence) => (
                                  <li key={`${evidence.occurredAt}-${evidence.summary}`}>
                                    {evidence.kind}: {evidence.summary}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </section>
                        )}
                        {latestRun.status === "awaiting_approval" && (
                          <div className="workflow-approval-actions">
                            <ActionButton
                              disabled={pendingAction === `approval:${latestRun.id}`}
                              onClick={() => {
                                void decideRun(workflow.id, latestRun.id, "approved");
                              }}
                              variant="primary"
                            >
                              Approve
                            </ActionButton>
                            <ActionButton
                              disabled={pendingAction === `approval:${latestRun.id}`}
                              onClick={() => {
                                void decideRun(workflow.id, latestRun.id, "rejected");
                              }}
                              variant="danger"
                            >
                              Reject
                            </ActionButton>
                          </div>
                        )}
                        {latestRun.status === "queued" && (
                          <div className="workflow-approval-actions">
                            <ActionButton
                              disabled={pendingAction === `claim:${latestRun.id}`}
                              onClick={() => {
                                void claimSingleEligibleWorker(workflow.id, latestRun.id);
                              }}
                              variant="primary"
                            >
                              {pendingAction === `claim:${latestRun.id}`
                                ? "Claiming worker..."
                                : "Claim only eligible worker"}
                            </ActionButton>
                          </div>
                        )}
                        {latestRun.status === "running" &&
                          workflow.id === "workflow-game-qa-balance" &&
                          latestRun.execution && (
                            <div className="workflow-approval-actions">
                              <ActionButton
                                disabled={pendingAction === `execute:${latestRun.id}`}
                                onClick={() => {
                                  void executeLocalRun(
                                    workflow.id,
                                    latestRun.id,
                                    latestRun.execution?.terminalId ?? "",
                                  );
                                }}
                                variant="accent"
                              >
                                {pendingAction === `execute:${latestRun.id}`
                                  ? "Running checks..."
                                  : "Run allowlisted checks"}
                              </ActionButton>
                            </div>
                          )}
                      </div>
                    ) : (
                      <p className="workflow-empty-run">No runs recorded.</p>
                    )}
                  </section>
                  <footer className="workflow-card-actions">
                    {workflow.status === "draft" && (
                      <ActionButton
                        disabled={isPending}
                        onClick={() => {
                          void updateStatus(workflow.id, "active");
                        }}
                        variant="primary"
                      >
                        Activate
                      </ActionButton>
                    )}
                    {workflow.status === "active" && (
                      <>
                        <ActionButton
                          disabled={isPending}
                          onClick={() => {
                            void requestRun(workflow);
                          }}
                          variant="accent"
                        >
                          Queue safe run
                        </ActionButton>
                        <ActionButton
                          disabled={isPending}
                          onClick={() => {
                            void updateStatus(workflow.id, "paused");
                          }}
                          variant="info"
                        >
                          Pause
                        </ActionButton>
                      </>
                    )}
                    {workflow.status === "paused" && (
                      <ActionButton
                        disabled={isPending}
                        onClick={() => {
                          void updateStatus(workflow.id, "active");
                        }}
                        variant="primary"
                      >
                        Resume
                      </ActionButton>
                    )}
                  </footer>
                </article>
              );
            })}
          </div>
          {!isLoading && workflows.length === 0 && (
            <p className="workflow-empty-state">
              No workflows are registered yet. Create the first draft on the left.
            </p>
          )}
        </section>
      </section>
    </section>
  );
};
