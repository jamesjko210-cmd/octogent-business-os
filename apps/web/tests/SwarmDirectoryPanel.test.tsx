import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SwarmDirectoryPanel } from "../src/components/SwarmDirectoryPanel";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SwarmDirectoryPanel", () => {
  it("shows separate project swarms with live role counts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            swarms: [
              {
                id: "game-business",
                title: "Game Business",
                purpose: "Builds Block Bounce.",
                isDefault: true,
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
                  },
                ],
              },
              {
                id: "research",
                title: "Research",
                purpose: "Grounds decisions.",
                isDefault: true,
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
    );

    render(<SwarmDirectoryPanel />);

    expect(await screen.findByText("Game Business")).toBeInTheDocument();
    expect(screen.getByText("Research")).toBeInTheDocument();
    expect(screen.getByText("1 working")).toBeInTheDocument();
    expect(screen.getByText("2 ready")).toBeInTheDocument();
    expect(screen.getByText("1 prepared")).toBeInTheDocument();
    expect(screen.getByText("testing: Running checks.")).toBeInTheDocument();
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
                isDefault: true,
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
                isDefault: false,
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
});
