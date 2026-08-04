import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GoalCommandCenter } from "../src/components/GoalCommandCenter";

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GoalCommandCenter", () => {
  it("assigns an existing goal to a permanent role without launching that role", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/goals" && (!init?.method || init.method === "GET")) {
        return jsonResponse({
          goals: [
            {
              id: "goal-unassigned",
              title: "Prepare the game MVP",
              description: "Make the browser MVP ready for a playtest.",
              status: "active",
              priority: "high",
              tentacleId: "game-business",
              successCriteria: [],
              constraints: [],
              evidence: [],
            },
          ],
        });
      }
      if (url === "/api/agents") {
        return jsonResponse({
          agents: [
            {
              id: "codex-executor",
              title: "Codex Executor",
              tentacleId: "game-business",
              state: "not_launched",
              currentActivity: "No matching terminal is launched yet.",
            },
          ],
        });
      }
      if (url === "/api/workflows") return jsonResponse({ workflows: [], runs: [] });
      if (url === "/api/goals/goal-unassigned" && init?.method === "PATCH") {
        return jsonResponse({ id: "goal-unassigned", ownerAgentId: "codex-executor" });
      }
      return jsonResponse({ error: "Unexpected request" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<GoalCommandCenter />);

    expect(await screen.findByText("Prepare the game MVP")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assign role" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Owner for Prepare the game MVP"), {
      target: { value: "codex-executor" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Assign role" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/goals/goal-unassigned",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ ownerAgentId: "codex-executor" }),
        }),
      );
    });
  });

  it("creates a role-owned goal and requires completion evidence", async () => {
    const initialGoals = {
      goals: [
        {
          id: "goal-1",
          title: "Verify the game build",
          description: "Run the approved checks.",
          status: "active",
          priority: "high",
          tentacleId: "game-business",
          ownerAgentId: "codex-executor",
          successCriteria: ["Regression passes"],
          constraints: ["No external publishing"],
          evidence: [],
        },
      ],
    };
    const roles = {
      agents: [
        {
          id: "codex-executor",
          title: "Codex Executor",
          tentacleId: "game-business",
          state: "working",
          currentActivity: "testing: Running approved checks.",
        },
      ],
    };
    const workflows = {
      workflows: [{ id: "workflow-qa", title: "Game QA", status: "active", goalId: "goal-1" }],
      runs: [],
    };
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/goals" && (!init?.method || init.method === "GET")) {
        return jsonResponse(initialGoals);
      }
      if (url === "/api/agents") return jsonResponse(roles);
      if (url === "/api/workflows") return jsonResponse(workflows);
      if (url === "/api/goals" && init?.method === "POST")
        return jsonResponse({ id: "goal-2" }, 201);
      if (url === "/api/goals/goal-1") {
        return jsonResponse({
          ...initialGoals.goals[0],
          status: "completed",
          evidence: ["Tests passed"],
        });
      }
      if (url === "/api/workflows/workflow-qa/runs") {
        return jsonResponse(
          { id: "run-qa", workflowId: "workflow-qa", goalId: "goal-1", status: "queued" },
          201,
        );
      }
      return jsonResponse({ error: "Unexpected request" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<GoalCommandCenter />);

    expect(await screen.findByText("Verify the game build")).toBeInTheDocument();
    expect(screen.getByText("Codex Executor · working")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Complete with evidence" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Goal title"), {
      target: { value: "Prepare playtest" },
    });
    fireEvent.change(screen.getByLabelText("Owner role"), { target: { value: "codex-executor" } });
    fireEvent.click(screen.getByRole("button", { name: "Create goal" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        4,
        "/api/goals",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            title: "Prepare playtest",
            description: "",
            ownerAgentId: "codex-executor",
            priority: "normal",
            successCriteria: [],
            constraints: [],
          }),
        }),
      );
    });

    fireEvent.change(screen.getByLabelText("Completion evidence for Verify the game build"), {
      target: { value: "Tests passed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Complete with evidence" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        8,
        "/api/goals/goal-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ status: "completed", evidence: ["Tests passed"] }),
        }),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Queue safe run" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        12,
        "/api/workflows/workflow-qa/runs",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ initiatedBy: "operator", goalId: "goal-1" }),
        }),
      );
    });
  });
});
