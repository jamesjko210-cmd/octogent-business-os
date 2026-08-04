import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { logVerbose } from "../logging";
import { normalizeChannelContent } from "./channelMessaging";
import type { AuditEventType } from "./security";
import type { PersistedTerminal, TerminalSession } from "./types";

export type AgentInboxMessage = {
  messageId: string;
  agentId: string;
  from: "operator" | "telegram" | "agent";
  fromTerminalId?: string;
  fromAgentId?: string;
  content: string;
  timestamp: string;
  delivered: boolean;
  deliveredAt?: string;
  deliveredToTerminalId?: string;
};

export type AgentInboxMessageSource =
  | { from: "operator" }
  | { from: "telegram" }
  | { from: "agent"; fromTerminalId: string; fromAgentId: string };

const isInboxMessage = (value: unknown): value is AgentInboxMessage => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const message = value as Record<string, unknown>;
  return (
    typeof message.messageId === "string" &&
    typeof message.agentId === "string" &&
    (message.from === "operator" ||
      message.from === "telegram" ||
      (message.from === "agent" &&
        typeof message.fromTerminalId === "string" &&
        typeof message.fromAgentId === "string")) &&
    typeof message.content === "string" &&
    typeof message.timestamp === "string" &&
    typeof message.delivered === "boolean"
  );
};

export const createAgentInboxMessaging = (deps: {
  stateDir: string;
  terminals: Map<string, PersistedTerminal>;
  sessions: Map<string, TerminalSession>;
  writeInput: (terminalId: string, data: string) => boolean;
  appendAuditEvent?: (
    eventType: AuditEventType,
    options: { terminalId?: string; payload?: Record<string, unknown> },
  ) => void;
}) => {
  const { stateDir, terminals, sessions, writeInput, appendAuditEvent } = deps;
  const inboxPath = join(stateDir, "state", "agent-inbox.json");
  const inboxes = new Map<string, AgentInboxMessage[]>();

  const persist = () => {
    mkdirSync(dirname(inboxPath), { recursive: true });
    writeFileSync(
      inboxPath,
      `${JSON.stringify({ messages: Array.from(inboxes.values()).flat() }, null, 2)}\n`,
      "utf8",
    );
  };

  const load = () => {
    if (!existsSync(inboxPath)) {
      return 0;
    }

    try {
      const payload = JSON.parse(readFileSync(inboxPath, "utf8")) as { messages?: unknown[] };
      let greatestMessageNumber = 0;
      let didNormalize = false;
      for (const candidate of payload.messages ?? []) {
        if (!isInboxMessage(candidate)) {
          continue;
        }
        const content = normalizeChannelContent(candidate.content);
        if (content !== candidate.content) {
          candidate.content = content;
          didNormalize = true;
        }
        const inbox = inboxes.get(candidate.agentId) ?? [];
        inbox.push(candidate);
        inboxes.set(candidate.agentId, inbox);
        const match = /^agent-msg-(\d+)$/.exec(candidate.messageId);
        if (match) {
          greatestMessageNumber = Math.max(greatestMessageNumber, Number(match[1]));
        }
      }
      if (didNormalize) {
        persist();
      }
      return greatestMessageNumber;
    } catch {
      return 0;
    }
  };

  let messageCounter = load();

  const deliverAgentInboxMessages = (terminalId: string) => {
    const terminal = terminals.get(terminalId);
    const session = sessions.get(terminalId);
    // Operator instructions must wait for the agent's idle prompt boundary.
    // Injecting text while a model is using a tool or awaiting permission can
    // corrupt the task or be mistaken for an approval.
    if (!terminal?.agentId || !session || session.agentState !== "idle") {
      return 0;
    }

    const inbox = inboxes.get(terminal.agentId) ?? [];
    const pending = inbox.filter((message) => !message.delivered);
    if (pending.length === 0) {
      return 0;
    }

    const prompt = `${pending
      .map((message) => {
        const sender =
          message.from === "agent"
            ? `Agent message from ${message.fromAgentId} (${message.fromTerminalId})`
            : message.from === "telegram"
              ? "Telegram operator message"
              : "Operator message";
        return `[${sender} for ${terminal.agentId}]: ${message.content}`;
      })
      .join("\n")}\r`;
    if (writeInput(terminalId, prompt) === false) {
      return 0;
    }

    const deliveredAt = new Date().toISOString();
    for (const message of pending) {
      message.delivered = true;
      message.deliveredAt = deliveredAt;
      message.deliveredToTerminalId = terminalId;
      appendAuditEvent?.("agent_inbox.message_delivered", {
        terminalId,
        payload: { messageId: message.messageId, agentId: message.agentId },
      });
    }
    persist();
    logVerbose(`[Agent inbox] Delivered ${pending.length} message(s) to ${terminalId}`);
    return pending.length;
  };

  return {
    enqueueAgentInboxMessage(
      agentId: string,
      content: string,
      source: AgentInboxMessageSource = { from: "operator" },
    ): AgentInboxMessage {
      messageCounter += 1;
      const message: AgentInboxMessage = {
        messageId: `agent-msg-${messageCounter}`,
        agentId,
        from: source.from,
        ...(source.from === "agent"
          ? {
              fromTerminalId: source.fromTerminalId,
              fromAgentId: source.fromAgentId,
            }
          : {}),
        content: normalizeChannelContent(content),
        timestamp: new Date().toISOString(),
        delivered: false,
      };
      const inbox = inboxes.get(agentId) ?? [];
      inbox.push(message);
      inboxes.set(agentId, inbox);
      persist();
      appendAuditEvent?.("agent_inbox.message_queued", {
        ...(source.from === "agent" ? { terminalId: source.fromTerminalId } : {}),
        payload: { messageId: message.messageId, agentId },
      });
      return message;
    },
    listAgentInboxMessages(agentId: string): AgentInboxMessage[] {
      return [...(inboxes.get(agentId) ?? [])];
    },
    deliverAgentInboxMessages,
  };
};
