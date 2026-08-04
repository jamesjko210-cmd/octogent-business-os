import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SessionHistoryPanel } from "../src/components/SessionHistoryPanel";

const jsonResponse = (payload: unknown) =>
  new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } });

describe("SessionHistoryPanel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows safe, verified session metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          sessions: [
            {
              terminalId: "codex-session",
              agentTitle: "Codex Executor",
              title: "Block Bounce verification",
              tentacleId: "game-business",
              provider: "codex",
              startedAt: "2026-08-05T00:01:00.000Z",
              endedAt: "2026-08-05T00:03:00.000Z",
              state: "ended",
              endReason: "operator_stop",
              evidenceEventCount: 3,
              lastEvidenceAt: "2026-08-05T00:03:00.000Z",
            },
          ],
        }),
      ),
    );

    render(<SessionHistoryPanel />);

    expect(await screen.findByText("Codex Executor")).toBeInTheDocument();
    expect(screen.getByText(/3 verified audit events/)).toBeInTheDocument();
    expect(screen.getByText("operator_stop")).toBeInTheDocument();
  });
});
