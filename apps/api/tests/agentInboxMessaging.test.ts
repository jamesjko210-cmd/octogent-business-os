import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentInboxMessaging } from "../src/terminalRuntime/agentInboxMessaging";
import type { PersistedTerminal, TerminalSession } from "../src/terminalRuntime/types";

describe("createAgentInboxMessaging", () => {
  const temporaryDirectories: string[] = [];

  const createStateDir = () => {
    const directory = mkdtempSync(join(tmpdir(), "octogent-agent-inbox-test-"));
    temporaryDirectories.push(directory);
    return directory;
  };

  afterEach(() => {
    for (const directory of temporaryDirectories) {
      rmSync(directory, { recursive: true, force: true });
    }
    temporaryDirectories.length = 0;
  });

  it("keeps a role message durable until its explicitly bound terminal is running", () => {
    const stateDir = createStateDir();
    const terminal: PersistedTerminal = {
      terminalId: "executor-terminal",
      agentId: "codex-executor",
      tentacleId: "game-business",
      tentacleName: "Codex Executor",
      createdAt: new Date().toISOString(),
      workspaceMode: "shared",
      agentProvider: "codex",
    };
    const terminals = new Map([[terminal.terminalId, terminal]]);
    const sessions = new Map<string, TerminalSession>();
    const writeInput = vi.fn();

    const firstRuntime = createAgentInboxMessaging({
      stateDir,
      terminals,
      sessions,
      writeInput,
    });
    const message = firstRuntime.enqueueAgentInboxMessage(
      "codex-executor",
      "Run the Block Bounce regression suite using api_key=not-a-real-secret.",
    );

    expect(message).toMatchObject({
      agentId: "codex-executor",
      content: "Run the Block Bounce regression suite using api_key=[redacted]",
      delivered: false,
    });
    expect(firstRuntime.deliverAgentInboxMessages("executor-terminal")).toBe(0);

    sessions.set("executor-terminal", {
      terminalId: "executor-terminal",
      tentacleId: "game-business",
      pty: {} as TerminalSession["pty"],
      clients: new Set(),
      directListeners: new Set(),
      cols: 80,
      rows: 24,
      agentState: "idle",
      stateTracker: {} as TerminalSession["stateTracker"],
      isBootstrapCommandSent: true,
      scrollbackChunks: [],
      scrollbackBytes: 0,
    });
    expect(firstRuntime.deliverAgentInboxMessages("executor-terminal")).toBe(1);
    expect(writeInput).toHaveBeenCalledWith(
      "executor-terminal",
      "[Operator message for codex-executor]: Run the Block Bounce regression suite using api_key=[redacted]\r",
    );

    const restartedRuntime = createAgentInboxMessaging({
      stateDir,
      terminals,
      sessions,
      writeInput: vi.fn(),
    });
    expect(restartedRuntime.listAgentInboxMessages("codex-executor")).toEqual([
      expect.objectContaining({
        messageId: "agent-msg-1",
        delivered: true,
        deliveredToTerminalId: "executor-terminal",
      }),
    ]);
    expect(readFileSync(join(stateDir, "state", "agent-inbox.json"), "utf8")).not.toContain(
      "not-a-real-secret",
    );
  });

  it("never sends a role message to a terminal without that exact role binding", () => {
    const stateDir = createStateDir();
    const terminals = new Map<string, PersistedTerminal>([
      [
        "generic-codex-terminal",
        {
          terminalId: "generic-codex-terminal",
          tentacleId: "game-business",
          tentacleName: "Generic Codex terminal",
          createdAt: new Date().toISOString(),
          workspaceMode: "shared",
          agentProvider: "codex",
        },
      ],
    ]);
    const writeInput = vi.fn();
    const runtime = createAgentInboxMessaging({
      stateDir,
      terminals,
      sessions: new Map<string, TerminalSession>([
        [
          "generic-codex-terminal",
          {
            terminalId: "generic-codex-terminal",
            tentacleId: "game-business",
            pty: {} as TerminalSession["pty"],
            clients: new Set(),
            directListeners: new Set(),
            cols: 80,
            rows: 24,
            agentState: "idle",
            stateTracker: {} as TerminalSession["stateTracker"],
            isBootstrapCommandSent: true,
            scrollbackChunks: [],
            scrollbackBytes: 0,
          },
        ],
      ]),
      writeInput,
    });

    runtime.enqueueAgentInboxMessage("codex-executor", "Do not leak into generic terminals.");

    expect(runtime.deliverAgentInboxMessages("generic-codex-terminal")).toBe(0);
    expect(writeInput).not.toHaveBeenCalled();
    expect(runtime.listAgentInboxMessages("codex-executor")[0]).toMatchObject({ delivered: false });
  });

  it("waits for an idle prompt boundary before injecting a role message", () => {
    const stateDir = createStateDir();
    const terminal: PersistedTerminal = {
      terminalId: "busy-executor-terminal",
      agentId: "codex-executor",
      tentacleId: "game-business",
      tentacleName: "Codex Executor",
      createdAt: new Date().toISOString(),
      workspaceMode: "shared",
      agentProvider: "codex",
    };
    const session: TerminalSession = {
      terminalId: terminal.terminalId,
      tentacleId: terminal.tentacleId,
      pty: {} as TerminalSession["pty"],
      clients: new Set(),
      directListeners: new Set(),
      cols: 80,
      rows: 24,
      agentState: "processing",
      stateTracker: {} as TerminalSession["stateTracker"],
      isBootstrapCommandSent: true,
      scrollbackChunks: [],
      scrollbackBytes: 0,
    };
    const writeInput = vi.fn();
    const runtime = createAgentInboxMessaging({
      stateDir,
      terminals: new Map([[terminal.terminalId, terminal]]),
      sessions: new Map([[terminal.terminalId, session]]),
      writeInput,
    });

    runtime.enqueueAgentInboxMessage("codex-executor", "Wait for the current task to finish.");
    expect(runtime.deliverAgentInboxMessages(terminal.terminalId)).toBe(0);
    expect(writeInput).not.toHaveBeenCalled();

    session.agentState = "idle";
    expect(runtime.deliverAgentInboxMessages(terminal.terminalId)).toBe(1);
    expect(writeInput).toHaveBeenCalledTimes(1);
  });

  it("preserves a verified agent handoff for a permanent role across restarts", () => {
    const stateDir = createStateDir();
    const targetTerminal: PersistedTerminal = {
      terminalId: "strategy-terminal",
      agentId: "ceo-command",
      tentacleId: "ceo-command",
      tentacleName: "CEO Command",
      createdAt: new Date().toISOString(),
      workspaceMode: "shared",
      agentProvider: "claude-code",
    };
    const writeInput = vi.fn();
    const sessions = new Map<string, TerminalSession>([
      [
        targetTerminal.terminalId,
        {
          terminalId: targetTerminal.terminalId,
          tentacleId: targetTerminal.tentacleId,
          pty: {} as TerminalSession["pty"],
          clients: new Set(),
          directListeners: new Set(),
          cols: 80,
          rows: 24,
          agentState: "idle",
          stateTracker: {} as TerminalSession["stateTracker"],
          isBootstrapCommandSent: true,
          scrollbackChunks: [],
          scrollbackBytes: 0,
        },
      ],
    ]);
    const runtime = createAgentInboxMessaging({
      stateDir,
      terminals: new Map([[targetTerminal.terminalId, targetTerminal]]),
      sessions,
      writeInput,
    });

    runtime.enqueueAgentInboxMessage(
      "ceo-command",
      "Research evidence is ready for the priority decision.",
      {
        from: "agent",
        fromTerminalId: "research-terminal",
        fromAgentId: "research-triad",
      },
    );

    expect(runtime.deliverAgentInboxMessages(targetTerminal.terminalId)).toBe(1);
    expect(writeInput).toHaveBeenCalledWith(
      "strategy-terminal",
      "[Agent message from research-triad (research-terminal) for ceo-command]: Research evidence is ready for the priority decision.\r",
    );

    const restartedRuntime = createAgentInboxMessaging({
      stateDir,
      terminals: new Map([[targetTerminal.terminalId, targetTerminal]]),
      sessions,
      writeInput: vi.fn(),
    });
    expect(restartedRuntime.listAgentInboxMessages("ceo-command")).toEqual([
      expect.objectContaining({
        from: "agent",
        fromAgentId: "research-triad",
        fromTerminalId: "research-terminal",
        delivered: true,
      }),
    ]);
  });
});
