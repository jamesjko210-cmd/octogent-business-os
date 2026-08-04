import { useCallback, useEffect, useState } from "react";

import {
  buildAgentRosterUrl,
  buildGoalItemUrl,
  buildGoalsUrl,
  buildWorkflowRunsUrl,
  buildWorkflowsUrl,
} from "../runtime/runtimeEndpoints";
import { ActionButton } from "./ui/ActionButton";

type GoalStatus = "planned" | "active" | "blocked" | "needs_review" | "completed" | "cancelled";
type GoalPriority = "low" | "normal" | "high" | "urgent";

type Goal = {
  id: string;
  title: string;
  description: string;
  status: GoalStatus;
  priority: GoalPriority;
  tentacleId?: string;
  ownerAgentId?: string;
  successCriteria: string[];
  constraints: string[];
  evidence: string[];
};

type AgentRole = {
  id: string;
  title: string;
  tentacleId: string;
  state: "working" | "waiting" | "ready" | "prepared" | "not_launched";
  currentActivity: string;
};

type LinkedWorkflow = {
  id: string;
  title: string;
  status: "draft" | "active" | "paused" | "archived";
  goalId?: string;
};

type LinkedRun = {
  id: string;
  workflowId: string;
  goalId?: string;
  status: string;
  summary: string;
  execution?: { terminalId: string; agentId: string };
  outcome?: { evidence: Array<{ kind: string; summary: string }> };
};

const STATUS_LABELS: Record<GoalStatus, string> = {
  planned: "Planned",
  active: "Active",
  blocked: "Blocked",
  needs_review: "Needs review",
  completed: "Completed",
  cancelled: "Cancelled",
};

const toList = (value: string) =>
  value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

const readError = async (response: Response, fallback: string) => {
  const payload = (await response.json().catch(() => ({}))) as { error?: unknown };
  return typeof payload.error === "string" && payload.error.trim() ? payload.error : fallback;
};

export const GoalCommandCenter = () => {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [roles, setRoles] = useState<AgentRole[]>([]);
  const [workflows, setWorkflows] = useState<LinkedWorkflow[]>([]);
  const [runs, setRuns] = useState<LinkedRun[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ownerAgentId, setOwnerAgentId] = useState("");
  const [priority, setPriority] = useState<GoalPriority>("normal");
  const [successCriteria, setSuccessCriteria] = useState("");
  const [constraints, setConstraints] = useState("");
  const [evidenceDrafts, setEvidenceDrafts] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [goalsResponse, rolesResponse, workflowsResponse] = await Promise.all([
        fetch(buildGoalsUrl(), { headers: { Accept: "application/json" } }),
        fetch(buildAgentRosterUrl(), { headers: { Accept: "application/json" } }),
        fetch(buildWorkflowsUrl(), { headers: { Accept: "application/json" } }),
      ]);
      if (!goalsResponse.ok)
        throw new Error(await readError(goalsResponse, "Unable to load goals."));
      if (!rolesResponse.ok)
        throw new Error(await readError(rolesResponse, "Unable to load roles."));
      if (!workflowsResponse.ok)
        throw new Error(await readError(workflowsResponse, "Unable to load workflow links."));
      const goalsPayload = (await goalsResponse.json()) as { goals?: Goal[] };
      const rolesPayload = (await rolesResponse.json()) as { agents?: AgentRole[] };
      const workflowsPayload = (await workflowsResponse.json()) as {
        workflows?: LinkedWorkflow[];
        runs?: LinkedRun[];
      };
      setGoals(Array.isArray(goalsPayload.goals) ? goalsPayload.goals : []);
      setRoles(Array.isArray(rolesPayload.agents) ? rolesPayload.agents : []);
      setWorkflows(Array.isArray(workflowsPayload.workflows) ? workflowsPayload.workflows : []);
      setRuns(Array.isArray(workflowsPayload.runs) ? workflowsPayload.runs : []);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load goals.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createGoal = async () => {
    if (!title.trim()) return;
    setIsSaving(true);
    try {
      const response = await fetch(buildGoalsUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          ownerAgentId: ownerAgentId || undefined,
          priority,
          successCriteria: toList(successCriteria),
          constraints: toList(constraints),
        }),
      });
      if (!response.ok) throw new Error(await readError(response, "Unable to create the goal."));
      setTitle("");
      setDescription("");
      setSuccessCriteria("");
      setConstraints("");
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to create the goal.");
    } finally {
      setIsSaving(false);
    }
  };

  const updateStatus = async (goal: Goal, status: GoalStatus) => {
    const evidence = status === "completed" ? toList(evidenceDrafts[goal.id] ?? "") : undefined;
    setIsSaving(true);
    try {
      const response = await fetch(buildGoalItemUrl(goal.id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ status, ...(evidence ? { evidence } : {}) }),
      });
      if (!response.ok) throw new Error(await readError(response, "Unable to update the goal."));
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update the goal.");
    } finally {
      setIsSaving(false);
    }
  };

  const queueLinkedRun = async (goal: Goal, workflow: LinkedWorkflow) => {
    setIsSaving(true);
    try {
      const response = await fetch(buildWorkflowRunsUrl(workflow.id), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ initiatedBy: "operator", goalId: goal.id }),
      });
      if (!response.ok)
        throw new Error(await readError(response, "Unable to queue the workflow run."));
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to queue the workflow run.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section
      className="settings-panel settings-panel--goal-command"
      aria-label="Goal Command Center"
    >
      <header className="settings-panel-header settings-agent-directory-header">
        <div>
          <h2>Goal Command Center</h2>
          <p>
            Turn an outcome into a durable, role-owned brief. Activation records priority only; it
            never launches a model or starts external work on its own.
          </p>
        </div>
        <ActionButton disabled={isLoading} onClick={() => void load()} size="dense" variant="info">
          {isLoading ? "Refreshing..." : "Refresh"}
        </ActionButton>
      </header>

      {errorMessage ? <p className="settings-agentic-os-error">{errorMessage}</p> : null}

      <form
        className="goal-command-form"
        onSubmit={(event) => {
          event.preventDefault();
          void createGoal();
        }}
      >
        <label>
          Goal title
          <input onChange={(event) => setTitle(event.currentTarget.value)} value={title} />
        </label>
        <label>
          Owner role
          <select
            onChange={(event) => setOwnerAgentId(event.currentTarget.value)}
            value={ownerAgentId}
          >
            <option value="">Unassigned for now</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Priority
          <select
            onChange={(event) => setPriority(event.currentTarget.value as GoalPriority)}
            value={priority}
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </label>
        <label className="goal-command-form-wide">
          Brief
          <textarea
            onChange={(event) => setDescription(event.currentTarget.value)}
            placeholder="What outcome is needed and why?"
            rows={2}
            value={description}
          />
        </label>
        <label>
          Success criteria
          <textarea
            onChange={(event) => setSuccessCriteria(event.currentTarget.value)}
            placeholder="One check per line"
            rows={3}
            value={successCriteria}
          />
        </label>
        <label>
          Constraints
          <textarea
            onChange={(event) => setConstraints(event.currentTarget.value)}
            placeholder="One guardrail per line"
            rows={3}
            value={constraints}
          />
        </label>
        <ActionButton
          disabled={!title.trim() || isSaving}
          size="dense"
          type="submit"
          variant="accent"
        >
          {isSaving ? "Saving..." : "Create goal"}
        </ActionButton>
      </form>

      <div className="goal-command-grid">
        {goals.length === 0 ? (
          <p className="settings-swarm-empty-activity">No goals yet. Create one above to begin.</p>
        ) : (
          goals.map((goal) => {
            const owner = roles.find((role) => role.id === goal.ownerAgentId);
            const linkedWorkflow = workflows.find((workflow) => workflow.goalId === goal.id);
            const linkedRun = linkedWorkflow
              ? runs.find((run) => run.workflowId === linkedWorkflow.id)
              : undefined;
            return (
              <article className="goal-command-card" data-status={goal.status} key={goal.id}>
                <div className="goal-command-card-topline">
                  <div>
                    <strong>{goal.title}</strong>
                    <small>{goal.priority} priority</small>
                  </div>
                  <span>{STATUS_LABELS[goal.status]}</span>
                </div>
                {goal.description ? <p>{goal.description}</p> : null}
                <dl>
                  <div>
                    <dt>Goal ID</dt>
                    <dd>{goal.id}</dd>
                  </div>
                  <div>
                    <dt>Owner</dt>
                    <dd>{owner ? `${owner.title} · ${owner.state}` : "Unassigned"}</dd>
                  </div>
                  <div>
                    <dt>Activity</dt>
                    <dd>{owner?.currentActivity ?? "Assign an owner to route this goal."}</dd>
                  </div>
                  <div>
                    <dt>Success</dt>
                    <dd>
                      {goal.successCriteria.length
                        ? goal.successCriteria.join("; ")
                        : "Not set yet"}
                    </dd>
                  </div>
                </dl>
                <section className="goal-command-workflow">
                  <strong>Workflow handoff</strong>
                  {linkedWorkflow ? (
                    <>
                      <p>
                        {linkedWorkflow.title} · {linkedWorkflow.status}
                        {linkedRun ? ` · latest run: ${linkedRun.status}` : " · no run yet"}
                      </p>
                      {linkedRun?.execution ? (
                        <small>
                          Claimed by {linkedRun.execution.agentId} on{" "}
                          {linkedRun.execution.terminalId}
                        </small>
                      ) : null}
                      {linkedRun?.outcome?.evidence.length ? (
                        <small>
                          Evidence:{" "}
                          {linkedRun.outcome.evidence.map((item) => item.summary).join("; ")}
                        </small>
                      ) : null}
                      <ActionButton
                        disabled={linkedWorkflow.status !== "active" || isSaving}
                        onClick={() => void queueLinkedRun(goal, linkedWorkflow)}
                        size="dense"
                        variant="info"
                      >
                        Queue safe run
                      </ActionButton>
                    </>
                  ) : (
                    <p>
                      No linked workflow. Create one in Workflows with this Goal ID, the same owner,
                      and the same tentacle.
                    </p>
                  )}
                </section>
                {goal.evidence.length > 0 ? (
                  <p className="goal-command-evidence">Evidence: {goal.evidence.join("; ")}</p>
                ) : null}
                {goal.status !== "completed" && goal.status !== "cancelled" ? (
                  <div className="goal-command-actions">
                    {goal.status !== "active" ? (
                      <ActionButton
                        onClick={() => void updateStatus(goal, "active")}
                        size="dense"
                        variant="accent"
                      >
                        Activate
                      </ActionButton>
                    ) : null}
                    <ActionButton
                      onClick={() => void updateStatus(goal, "needs_review")}
                      size="dense"
                      variant="info"
                    >
                      Review
                    </ActionButton>
                    <ActionButton
                      onClick={() => void updateStatus(goal, "blocked")}
                      size="dense"
                      variant="info"
                    >
                      Mark blocked
                    </ActionButton>
                    <ActionButton
                      onClick={() => void updateStatus(goal, "cancelled")}
                      size="dense"
                      variant="danger"
                    >
                      Cancel
                    </ActionButton>
                  </div>
                ) : null}
                {goal.status !== "completed" ? (
                  <div className="goal-command-complete">
                    <textarea
                      aria-label={`Completion evidence for ${goal.title}`}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setEvidenceDrafts((current) => ({
                          ...current,
                          [goal.id]: value,
                        }));
                      }}
                      placeholder="Evidence for completion, one item per line"
                      rows={2}
                      value={evidenceDrafts[goal.id] ?? ""}
                    />
                    <ActionButton
                      disabled={toList(evidenceDrafts[goal.id] ?? "").length === 0 || isSaving}
                      onClick={() => void updateStatus(goal, "completed")}
                      size="dense"
                      variant="accent"
                    >
                      Complete with evidence
                    </ActionButton>
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
};
