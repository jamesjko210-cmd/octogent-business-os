import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { formatTimestamp } from "../src/app/formatTimestamp";
import { SwarmDirectoryPanel } from "../src/components/SwarmDirectoryPanel";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SwarmDirectoryPanel", () => {
  it("shows separate project swarms with live role counts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              swarms: [
                {
                  id: "game-business",
                  title: "Game Business",
                  purpose: "Builds Block Bounce.",
                  agentIds: ["codex-executor"],
                  isDefault: true,
                  isRemovable: false,
                  state: "working",
                  roleCount: 12,
                  workingCount: 1,
                  waitingCount: 0,
                  readyCount: 2,
                  preparedCount: 0,
                  notLaunchedCount: 9,
                  activeRoles: [
                    {
                      id: "codex-executor",
                      title: "Codex Executor",
                      state: "working",
                      currentActivity: "testing: Running checks.",
                      activityUpdatedAt: "2026-08-05T00:00:00.000Z",
                    },
                  ],
                },
                {
                  id: "research",
                  title: "Research",
                  purpose: "Grounds decisions.",
                  agentIds: ["research-triad"],
                  isDefault: true,
                  isRemovable: false,
                  state: "prepared",
                  roleCount: 1,
                  workingCount: 0,
                  waitingCount: 0,
                  readyCount: 0,
                  preparedCount: 1,
                  notLaunchedCount: 0,
                  activeRoles: [
                    {
                      id: "research-triad",
                      title: "Research Triad",
                      state: "prepared",
                      currentActivity:
                        "Prepared to start a scoped task; no provider session is running.",
                    },
                  ],
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        ),
      ),
    );

    render(<SwarmDirectoryPanel />);

    expect(await screen.findByText("Game Business")).toBeInTheDocument();
    expect(screen.getByText("Research")).toBeInTheDocument();
    expect(screen.getByText("1 working")).toBeInTheDocument();
    expect(screen.getByText("2 ready")).toBeInTheDocument();
    expect(screen.getByText("1 prepared")).toBeInTheDocument();
    expect(screen.getByText("testing: Running checks.")).toBeInTheDocument();
    expect(
      screen.getByText(`Last report ${formatTimestamp("2026-08-05T00:00:00.000Z")}`),
    ).toBeInTheDocument();
  });

  it("shows the active work plan owned by each swarm", async () => {
    const jsonResponse = (body: unknown) =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "/api/swarms") {
          return jsonResponse({
            swarms: [
              {
                id: "game-business",
                title: "Game Business",
                purpose: "Builds Block Bounce.",
                agentIds: ["codex-executor"],
                isDefault: true,
                isRemovable: false,
                state: "working",
                roleCount: 1,
                workingCount: 1,
                waitingCount: 0,
                readyCount: 0,
                preparedCount: 0,
                notLaunchedCount: 0,
                activeRoles: [],
              },
            ],
          });
        }
        if (url === "/api/goals") {
          return jsonResponse({
            goals: [
              { id: "goal-1", title: "Playtest", status: "active", ownerAgentId: "codex-executor" },
              {
                id: "goal-legacy-game",
                title: "Game MVP",
                status: "active",
                tentacleId: "game-business",
              },
              {
                id: "goal-2",
                title: "Fix input",
                status: "blocked",
                ownerAgentId: "codex-executor",
              },
            ],
          });
        }
        if (url === "/api/workflows") {
          return jsonResponse({
            workflows: [{ id: "workflow-1", status: "active", ownerAgentId: "codex-executor" }],
            runs: [{ workflowId: "workflow-1", status: "queued" }],
          });
        }
        return jsonResponse({
          agents: [{ id: "codex-executor", title: "Codex Executor", tentacleId: "game-business" }],
        });
      }),
    );

    render(<SwarmDirectoryPanel />);

    const plan = await screen.findByLabelText("Game Business work plan");
    expect(plan).toHaveTextContent("2 active goals");
    expect(plan).toHaveTextContent("1 active workflows");
    expect(plan).toHaveTextContent("1 open workflow runs");
    expect(plan).toHaveTextContent("1 blocked goals");

    const currentGoals = screen.getByLabelText("Game Business current goals");
    expect(currentGoals).toHaveTextContent("Fix input");
    expect(currentGoals).toHaveTextContent("Blocked");
    expect(currentGoals).toHaveTextContent("Playtest");
    expect(currentGoals).toHaveTextContent("Game MVP");
  });

  it("removes a custom swarm without offering deletion of default workstreams", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            swarms: [
              {
                id: "game-business",
                title: "Game Business",
                purpose: "Builds Block Bounce.",
                agentIds: ["codex-executor"],
                isDefault: true,
                isRemovable: false,
                state: "not_launched",
                roleCount: 12,
                workingCount: 0,
                waitingCount: 0,
                readyCount: 0,
                preparedCount: 0,
                notLaunchedCount: 12,
                activeRoles: [],
              },
              {
                id: "school-project",
                title: "School Project",
                purpose: "Keeps school work separate.",
                agentIds: ["research-triad"],
                isDefault: false,
                isRemovable: true,
                state: "not_launched",
                roleCount: 1,
                workingCount: 0,
                waitingCount: 0,
                readyCount: 0,
                preparedCount: 0,
                notLaunchedCount: 1,
                activeRoles: [],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ goals: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ workflows: [], runs: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ agents: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ swarmId: "school-project" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ swarms: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ goals: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ workflows: [], runs: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ agents: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<SwarmDirectoryPanel />);

    expect(await screen.findByText("Default swarm: permanent project lane.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove Game Business" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove School Project" }));
    expect(await screen.findByRole("heading", { name: "Remove custom swarm" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm remove custom swarm" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/swarms/school-project",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
    expect(
      await screen.findByText("School Project was removed. Permanent roles remain available."),
    ).toBeInTheDocument();
  });

  it("does not offer custom-swarm removal while its assigned role is active", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            swarms: [
              {
                id: "school-project",
                title: "School Project",
                purpose: "Keeps school work separate.",
                agentIds: ["research-triad"],
                isDefault: false,
                isRemovable: false,
                state: "working",
                roleCount: 1,
                workingCount: 1,
                waitingCount: 0,
                readyCount: 0,
                preparedCount: 0,
                notLaunchedCount: 0,
                activeRoles: [
                  {
                    id: "research-triad",
                    title: "Research Triad",
                    state: "working",
                    currentActivity: "researching: Collecting sources.",
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ goals: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ workflows: [], runs: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ agents: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<SwarmDirectoryPanel />);

    expect(
      await screen.findByText(
        "Release or clean up its active role terminals before removing this custom swarm.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove School Project" })).not.toBeInTheDocument();
  });
});
