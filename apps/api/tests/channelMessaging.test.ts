import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MAX_CHANNEL_MESSAGE_LENGTH,
  createChannelMessaging,
} from "../src/terminalRuntime/channelMessaging";
import type { PersistedTerminal, TerminalSession } from "../src/terminalRuntime/types";

const createTerminal = (terminalId: string): PersistedTerminal => ({
  terminalId,
  tentacleId: terminalId,
  tentacleName: terminalId,
  createdAt: new Date().toISOString(),
  workspaceMode: "shared",
});

describe("createChannelMessaging", () => {
  const temporaryDirectories: string[] = [];

  const createStateDir = () => {
    const directory = mkdtempSync(join(tmpdir(), "octogent-channel-test-"));
    temporaryDirectories.push(directory);
    return directory;
  };

  afterEach(() => {
    for (const directory of temporaryDirectories) {
      rmSync(directory, { recursive: true, force: true });
    }
    temporaryDirectories.length = 0;
  });

  it("persists queued messages so the agent communication log survives restarts", () => {
    const stateDir = createStateDir();
    const terminals = new Map<string, PersistedTerminal>([
      ["agent-a", createTerminal("agent-a")],
      ["agent-b", createTerminal("agent-b")],
    ]);
    const sessions = new Map<string, TerminalSession>();

    const firstRuntime = createChannelMessaging({
      stateDir,
      terminals,
      sessions,
      writeInput: vi.fn(),
    });

    const message = firstRuntime.sendChannelMessage("agent-b", "agent-a", "Please review deck.");

    expect(message).toMatchObject({
      messageId: "msg-1",
      fromTerminalId: "agent-a",
      toTerminalId: "agent-b",
      content: "Please review deck.",
      delivered: false,
    });

    const secondRuntime = createChannelMessaging({
      stateDir,
      terminals,
      sessions,
      writeInput: vi.fn(),
    });

    expect(secondRuntime.listChannelMessages("agent-b")).toHaveLength(1);
    expect(secondRuntime.listChannelMessages("agent-b")[0]).toMatchObject({
      messageId: "msg-1",
      fromTerminalId: "agent-a",
      content: "Please review deck.",
      delivered: false,
    });

    const persisted = JSON.parse(
      readFileSync(join(stateDir, "state", "channel-messages.json"), "utf8"),
    ) as { messages: unknown[] };
    expect(persisted.messages).toHaveLength(1);
  });

  it("lets the operator talk to an idle agent and records delivery", () => {
    const stateDir = createStateDir();
    const terminals = new Map<string, PersistedTerminal>([["agent-a", createTerminal("agent-a")]]);
    const writeInput = vi.fn();
    const sessions = new Map<string, TerminalSession>([
      [
        "agent-a",
        {
          terminalId: "agent-a",
          tentacleId: "agent-a",
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

    const runtime = createChannelMessaging({
      stateDir,
      terminals,
      sessions,
      writeInput,
    });

    runtime.sendChannelMessage("agent-a", "", "Give me your current blocker.");

    const [message] = runtime.listChannelMessages("agent-a");
    expect(message).toMatchObject({
      fromTerminalId: "operator",
      toTerminalId: "agent-a",
      content: "Give me your current blocker.",
      delivered: true,
    });
    expect(message?.deliveredAt).toEqual(expect.any(String));
    expect(writeInput).toHaveBeenCalledWith(
      "agent-a",
      "[Channel message from operator]: Give me your current blocker.\r",
    );
  });

  it("redacts credentials and bounds durable channel content", () => {
    const stateDir = createStateDir();
    const runtime = createChannelMessaging({
      stateDir,
      terminals: new Map<string, PersistedTerminal>([["agent-a", createTerminal("agent-a")]]),
      sessions: new Map<string, TerminalSession>(),
      writeInput: vi.fn(),
    });

    const message = runtime.sendChannelMessage(
      "agent-a",
      "operator",
      `Use api_key=secret-value and Bearer token-value. ${"x".repeat(MAX_CHANNEL_MESSAGE_LENGTH)}`,
    );

    expect(message?.content).toContain("api_key=[redacted]");
    expect(message?.content).toContain("Bearer [redacted]");
    expect(message?.content).not.toContain("secret-value");
    expect(message?.content).not.toContain("token-value");
    expect(message?.content.length).toBe(MAX_CHANNEL_MESSAGE_LENGTH);
  });
});
