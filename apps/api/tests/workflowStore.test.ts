import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createWorkflowStore } from "../src/workflowStore";

describe("workflow store", () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories) {
      rmSync(directory, { recursive: true, force: true });
    }
    temporaryDirectories.length = 0;
  });

  const createStore = () => {
    const projectStateDir = mkdtempSync(join(tmpdir(), "octogent-workflow-store-"));
    temporaryDirectories.push(projectStateDir);
    return createWorkflowStore(projectStateDir);
  };

  it("seeds the four initial operating procedures once", () => {
    const store = createStore();

    expect(store.ensureInitialWorkflows()).toBe(true);
    expect(store.ensureInitialWorkflows()).toBe(false);
    expect(store.list().map((workflow) => workflow.id)).toEqual([
      "workflow-game-qa-balance",
      "workflow-research-triad-brief",
      "workflow-developer-journal-update",
      "workflow-playtest-feedback-review",
    ]);
  });

  it("migrates built-in workflows from legacy placeholder roles", () => {
    const store = createStore();
    expect(store.ensureInitialWorkflows()).toBe(true);

    const snapshot = JSON.parse(readFileSync(store.workflowsPath, "utf8")) as {
      workflows: Array<{ id: string; ownerAgentId: string; tentacleId?: string }>;
    };
    const researchWorkflow = snapshot.workflows.find(
      (workflow) => workflow.id === "workflow-research-triad-brief",
    );
    const journalWorkflow = snapshot.workflows.find(
      (workflow) => workflow.id === "workflow-developer-journal-update",
    );
    if (!researchWorkflow || !journalWorkflow) throw new Error("Missing built-in workflow.");
    researchWorkflow.ownerAgentId = "claude-strategist";
    researchWorkflow.tentacleId = "game-business";
    journalWorkflow.ownerAgentId = "notion-record-center";
    writeFileSync(store.workflowsPath, `${JSON.stringify(snapshot)}\n`, "utf8");

    expect(store.ensureInitialWorkflows()).toBe(false);
    expect(store.find("workflow-research-triad-brief")).toEqual(
      expect.objectContaining({ ownerAgentId: "research-triad", tentacleId: "research" }),
    );
    expect(store.find("workflow-developer-journal-update")).toEqual(
      expect.objectContaining({ ownerAgentId: "record-center", tentacleId: "game-business" }),
    );
  });

  it("persists drafts, status changes, and approval decisions", () => {
    const store = createStore();
    store.ensureInitialWorkflows();
    const workflow = store.create({
      title: "Review weekly retention evidence",
      ownerAgentId: "ceo-command",
      automationLevel: "human_assisted",
      actionType: "analysis",
      actionContent: "Analyze only anonymized aggregate gameplay evidence.",
      sop: ["Read the verified metrics", "Record a recommendation"],
      successCriteria: ["Recommendation is evidence-backed"],
    });

    expect(workflow.status).toBe("draft");
    expect(store.updateStatus(workflow.id, "active")).toEqual(
      expect.objectContaining({ id: workflow.id, status: "active" }),
    );

    const run = store.createRun({
      workflowId: workflow.id,
      status: "awaiting_approval",
      initiatedBy: "operator",
      policy: {
        decision: "requires_approval",
        rationale: "A human checkpoint is required.",
        matchedGlobalPolicyIds: ["approval-personal-data-actions"],
        matchedAgentPolicyIds: [],
      },
      summary: "Waiting for approval.",
    });
    const decided = store.decideRun({
      workflowId: workflow.id,
      runId: run.id,
      decision: "approved",
      note: "Aggregate-only review is approved.",
    });

    expect(decided).toEqual(
      expect.objectContaining({
        status: "queued",
        approval: expect.objectContaining({ decision: "approved" }),
      }),
    );

    const reloaded = createWorkflowStore(temporaryDirectories[0] as string);
    expect(reloaded.find(workflow.id)).toEqual(expect.objectContaining({ status: "active" }));
    expect(reloaded.listRuns(workflow.id)).toEqual([
      expect.objectContaining({ id: run.id, status: "queued" }),
    ]);
  });

  it("claims a queued run once and persists its worker binding", () => {
    const store = createStore();
    store.ensureInitialWorkflows();
    const run = store.createRun({
      workflowId: "workflow-game-qa-balance",
      status: "queued",
      initiatedBy: "scheduler",
      policy: {
        decision: "allow",
        rationale: "Local test workflow is safe to queue.",
        matchedGlobalPolicyIds: [],
        matchedAgentPolicyIds: [],
      },
      summary: "Queued for a worker.",
    });

    const claimed = store.claimRun({
      workflowId: run.workflowId,
      runId: run.id,
      terminalId: "terminal-game-qa",
      agentId: "codex-executor",
    });
    expect(claimed).toEqual({
      ok: true,
      run: expect.objectContaining({
        status: "running",
        execution: expect.objectContaining({
          terminalId: "terminal-game-qa",
          agentId: "codex-executor",
          claimedBy: "runtime-worker",
        }),
      }),
    });

    expect(
      store.claimRun({
        workflowId: run.workflowId,
        runId: run.id,
        terminalId: "terminal-game-qa-2",
        agentId: "codex-executor",
      }),
    ).toEqual({ ok: false, reason: "already_claimed" });

    const reloaded = createWorkflowStore(temporaryDirectories[0] as string);
    expect(reloaded.listRuns(run.workflowId)).toEqual([
      expect.objectContaining({
        id: run.id,
        status: "running",
        execution: expect.objectContaining({ terminalId: "terminal-game-qa" }),
      }),
    ]);
  });

  it("records one terminal-bound outcome after a run is claimed", () => {
    const store = createStore();
    store.ensureInitialWorkflows();
    const run = store.createRun({
      workflowId: "workflow-game-qa-balance",
      status: "queued",
      initiatedBy: "operator",
      policy: {
        decision: "allow",
        rationale: "Local test workflow is safe to queue.",
        matchedGlobalPolicyIds: [],
        matchedAgentPolicyIds: [],
      },
      summary: "Queued for a worker.",
    });
    expect(
      store.claimRun({
        workflowId: run.workflowId,
        runId: run.id,
        terminalId: "terminal-game-qa",
        agentId: "codex-executor",
      }),
    ).toEqual(expect.objectContaining({ ok: true }));

    const outcome = store.recordOutcome({
      workflowId: run.workflowId,
      runId: run.id,
      outcome: {
        status: "succeeded",
        summary: "Game QA checks passed.",
        evidence: [
          {
            kind: "test",
            summary: "13 engine tests passed.",
            occurredAt: "2026-08-03T00:00:00.000Z",
          },
        ],
      },
    });
    expect(outcome).toEqual({
      ok: true,
      run: expect.objectContaining({
        status: "succeeded",
        outcome: expect.objectContaining({
          summary: "Game QA checks passed.",
          evidence: [expect.objectContaining({ kind: "test" })],
        }),
      }),
    });
    expect(
      store.recordOutcome({
        workflowId: run.workflowId,
        runId: run.id,
        outcome: { status: "failed", summary: "Should not overwrite.", evidence: [] },
      }),
    ).toEqual({ ok: false, reason: "already_completed" });
  });
});
