import { describe, expect, it } from "vitest";

import {
  createTerminalSecurity,
  hasTerminalChannelCapability,
  terminalChannelCapability,
} from "../src/terminalRuntime/security";
import type { PersistedTerminal } from "../src/terminalRuntime/types";

describe("terminal channel capabilities", () => {
  it("derives a private sender capability from one terminal identity", () => {
    const terminal: PersistedTerminal = {
      terminalId: "sender-terminal",
      tentacleId: "game-business",
      tentacleName: "Sender terminal",
      createdAt: new Date().toISOString(),
      workspaceMode: "shared",
      agentProvider: "codex",
      security: createTerminalSecurity({
        terminalId: "sender-terminal",
        tentacleId: "game-business",
        workspaceMode: "shared",
        agentProvider: "codex",
      }),
    };

    const capability = terminalChannelCapability(terminal);

    expect(capability).toEqual(expect.any(String));
    expect(capability).not.toContain("PUBLIC KEY");
    expect(hasTerminalChannelCapability(terminal, capability ?? "")).toBe(true);
    expect(hasTerminalChannelCapability(terminal, "wrong-capability")).toBe(false);
  });
});
