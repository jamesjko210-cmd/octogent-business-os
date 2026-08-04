import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkflowsPrimaryView } from "../src/components/WorkflowsPrimaryView";
import { jsonResponse, resetAppTestHarness } from "./test-utils/appTestHarness";

describe("WorkflowsPrimaryView", () => {
  afterEach(() => {
    cleanup();
    resetAppTestHarness();
  });

  it("shows a claimed worker binding and its recorded outcome evidence", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        workflows: [
          {
            id: "workflow-game-qa-balance",
            title: "Game QA and balance sweep",
            description: "Run local QA.",
            status: "active",
            automationLevel: "autonomous",
            ownerAgentId: "codex-executor",
            tentacleId: "game-business",
            actionType: "test",
            actionContent: "Run local QA.",
            sop: [],
            successCriteria: [],
            allowedTools: ["tests"],
            createdAt: "2026-08-03T00:00:00.000Z",
            updatedAt: "2026-08-03T00:00:00.000Z",
          },
        ],
        runs: [
          {
            id: "run-game-qa",
            workflowId: "workflow-game-qa-balance",
            status: "succeeded",
            initiatedBy: "operator",
            policy: {
              decision: "allow",
              rationale: "Safe local test.",
              matchedGlobalPolicyIds: [],
              matchedAgentPolicyIds: [],
            },
            summary: "Game QA checks passed.",
            createdAt: "2026-08-03T00:00:00.000Z",
            updatedAt: "2026-08-03T00:01:00.000Z",
            execution: {
              terminalId: "game-qa-worker",
              agentId: "codex-executor",
              claimedAt: "2026-08-03T00:00:30.000Z",
              claimedBy: "runtime-worker",
            },
            outcome: {
              status: "succeeded",
              summary: "Game QA checks passed.",
              completedAt: "2026-08-03T00:01:00.000Z",
              evidence: [
                {
                  kind: "test",
                  summary: "13 engine tests passed.",
                  occurredAt: "2026-08-03T00:01:00.000Z",
                },
              ],
            },
          },
        ],
      }),
    );

    render(<WorkflowsPrimaryView enabled />);

    expect(
      await screen.findByText("Claimed by codex-executor on game-qa-worker"),
    ).toBeInTheDocument();
    expect(screen.getByText("Recorded outcome")).toBeInTheDocument();
    expect(screen.getByText("test: 13 engine tests passed.")).toBeInTheDocument();
  });

  it("offers the allowlisted runner only after the Game QA run is claimed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        workflows: [
          {
            id: "workflow-game-qa-balance",
            title: "Game QA and balance sweep",
            description: "Run local QA.",
            status: "active",
            automationLevel: "autonomous",
            ownerAgentId: "codex-executor",
            tentacleId: "game-business",
            actionType: "test",
            actionContent: "Run local QA.",
            sop: [],
            successCriteria: [],
            allowedTools: ["tests"],
            createdAt: "2026-08-03T00:00:00.000Z",
            updatedAt: "2026-08-03T00:00:00.000Z",
          },
        ],
        runs: [
          {
            id: "run-game-qa",
            workflowId: "workflow-game-qa-balance",
            status: "running",
            initiatedBy: "operator",
            policy: {
              decision: "allow",
              rationale: "Safe local test.",
              matchedGlobalPolicyIds: [],
              matchedAgentPolicyIds: [],
            },
            summary: "Workflow run claimed by a manifest-scoped runtime worker.",
            createdAt: "2026-08-03T00:00:00.000Z",
            updatedAt: "2026-08-03T00:01:00.000Z",
            execution: {
              terminalId: "game-qa-worker",
              agentId: "codex-executor",
              claimedAt: "2026-08-03T00:00:30.000Z",
              claimedBy: "runtime-worker",
            },
          },
        ],
      }),
    );

    render(<WorkflowsPrimaryView enabled />);

    expect(
      await screen.findByRole("button", { name: "Run allowlisted checks" }),
    ).toBeInTheDocument();
  });

  it("requests a claim only when the operator uses the queued-run control", async () => {
    const queuedRegistry = {
      workflows: [
        {
          id: "workflow-game-qa-balance",
          title: "Game QA and balance sweep",
          description: "Run local QA.",
          status: "active",
          automationLevel: "autonomous",
          ownerAgentId: "codex-executor",
          tentacleId: "game-business",
          actionType: "test",
          actionContent: "Run local QA.",
          sop: [],
          successCriteria: [],
          allowedTools: ["tests"],
          createdAt: "2026-08-03T00:00:00.000Z",
          updatedAt: "2026-08-03T00:00:00.000Z",
        },
      ],
      runs: [
        {
          id: "run-queued-qa",
          workflowId: "workflow-game-qa-balance",
          status: "queued",
          initiatedBy: "operator",
          policy: {
            decision: "allow",
            rationale: "Safe local test.",
            matchedGlobalPolicyIds: [],
            matchedAgentPolicyIds: [],
          },
          summary: "Safe run recorded as queued.",
          createdAt: "2026-08-03T00:00:00.000Z",
          updatedAt: "2026-08-03T00:00:00.000Z",
        },
      ],
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(queuedRegistry))
      .mockResolvedValueOnce(
        jsonResponse({
          ...queuedRegistry.runs[0],
          status: "running",
          execution: {
            terminalId: "single-codex-worker",
            agentId: "codex-executor",
            claimedAt: "2026-08-03T00:01:00.000Z",
            claimedBy: "runtime-worker",
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse(queuedRegistry));

    render(<WorkflowsPrimaryView enabled />);

    fireEvent.click(await screen.findByRole("button", { name: "Claim only eligible worker" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        "/api/workflows/workflow-game-qa-balance/runs/run-queued-qa/claim",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ selectSingleEligibleWorker: true }),
        }),
      );
    });
  });
});
