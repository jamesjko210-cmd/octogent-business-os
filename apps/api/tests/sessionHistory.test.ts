import type { TerminalSnapshot } from "@octogent/core";
import { describe, expect, it } from "vitest";

import { buildSessionHistory } from "../src/sessionHistory";
import type { AuditEvent } from "../src/terminalRuntime/security";

const event = (
  eventType: AuditEvent["eventType"],
  timestamp: string,
  terminalId?: string,
  payload: Record<string, unknown> = {},
): AuditEvent => ({
  eventId: `${eventType}-${timestamp}`,
  timestamp,
  ...(terminalId ? { terminalId } : {}),
  eventType,
  payload,
  previousHash: null,
  hash: "test-hash",
});

const liveSnapshot: TerminalSnapshot = {
  terminalId: "codex-session",
  agentId: "codex-executor",
  label: "Codex Executor",
  tentacleId: "game-business",
  tentacleName: "Block Bounce verification",
  agentProvider: "codex",
  state: "live",
  lifecycleState: "running",
  createdAt: "2026-08-05T00:00:00.000Z",
};

describe("buildSessionHistory", () => {
  it("projects completed and live terminal sessions without exposing sensitive audit payloads", () => {
    const sessions = buildSessionHistory({
      terminalSnapshots: [liveSnapshot],
      auditEvents: [
        event("terminal.created", "2026-08-05T00:00:00.000Z", "codex-session", {
          agentId: "codex-executor",
          tentacleId: "game-business",
          tentacleName: "Block Bounce verification",
          agentProvider: "codex",
        }),
        event("session.started", "2026-08-05T00:01:00.000Z", "codex-session", {
          startedAt: "2026-08-05T00:01:00.000Z",
          processId: 51,
        }),
        event("session.input", "2026-08-05T00:02:00.000Z", "codex-session", {
          content: "this must never appear in the timeline",
        }),
        event("session.ended", "2026-08-05T00:03:00.000Z", "codex-session", {
          endedAt: "2026-08-05T00:03:00.000Z",
          reason: "operator_stop",
        }),
      ],
    });

    expect(sessions).toEqual([
      expect.objectContaining({
        terminalId: "codex-session",
        agentId: "codex-executor",
        agentTitle: "Codex Executor",
        tentacleId: "game-business",
        provider: "codex",
        state: "ended",
        endReason: "operator_stop",
        evidenceEventCount: 3,
      }),
    ]);
    expect(JSON.stringify(sessions)).not.toContain("this must never appear");
    expect(JSON.stringify(sessions)).not.toContain("processId");
  });

  it("keeps an unended session marked as running", () => {
    const sessions = buildSessionHistory({
      terminalSnapshots: [liveSnapshot],
      auditEvents: [
        event("session.started", "2026-08-05T00:01:00.000Z", "codex-session", {
          startedAt: "2026-08-05T00:01:00.000Z",
        }),
      ],
    });

    expect(sessions[0]).toMatchObject({ state: "running" });
    expect(sessions[0]).not.toHaveProperty("endedAt");
  });
});
