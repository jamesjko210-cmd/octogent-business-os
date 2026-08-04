import { render, screen } from "@testing-library/react";
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
});
