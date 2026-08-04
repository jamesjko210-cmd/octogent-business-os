import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { logVerbose } from "../logging";
import type { AuditEventType } from "./security";
import type { ChannelMessage, PersistedTerminal, TerminalSession } from "./types";

export const MAX_CHANNEL_MESSAGE_LENGTH = 4_000;

const redactSensitiveChannelContent = (value: string) =>
  value
    .replace(
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
      "[redacted private key]",
    )
    .replace(/\b(?:sk|pk|ghp|github_pat)_[A-Za-z0-9_-]+\b/gi, "[redacted credential]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+/gi, "Bearer [redacted]")
    .replace(/\b(api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]\s*\S+/gi, "$1=[redacted]");

export const normalizeChannelContent = (value: string) =>
  redactSensitiveChannelContent(value.trim()).slice(0, MAX_CHANNEL_MESSAGE_LENGTH);

export const createChannelMessaging = (deps: {
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
  const channelQueues = new Map<string, ChannelMessage[]>();
  const channelMessagesPath = join(stateDir, "state", "channel-messages.json");

  const persistChannelMessages = () => {
    const payload = {
      messages: Array.from(channelQueues.values()).flat(),
    };
    mkdirSync(dirname(channelMessagesPath), { recursive: true });
    writeFileSync(channelMessagesPath, `${JSON.stringify(payload, null, 2)}\n`);
  };

  const loadChannelMessages = (): number => {
    if (!existsSync(channelMessagesPath)) {
      return 0;
    }

    try {
      const payload = JSON.parse(readFileSync(channelMessagesPath, "utf8")) as {
        messages?: ChannelMessage[];
      };
      let maxMessageNumber = 0;
      let didRedactPersistedContent = false;
      for (const message of payload.messages ?? []) {
        if (
          !message ||
          typeof message.toTerminalId !== "string" ||
          typeof message.content !== "string"
        ) {
          continue;
        }
        const content = normalizeChannelContent(message.content);
        if (content !== message.content) {
          message.content = content;
          didRedactPersistedContent = true;
        }
        const queue = channelQueues.get(message.toTerminalId) ?? [];
        queue.push(message);
        channelQueues.set(message.toTerminalId, queue);
        const match = /^msg-(\d+)$/.exec(message.messageId);
        if (match) {
          maxMessageNumber = Math.max(maxMessageNumber, Number(match[1]));
        }
      }
      if (didRedactPersistedContent) {
        persistChannelMessages();
      }
      return maxMessageNumber;
    } catch {
      return 0;
    }
  };

  let channelMessageCounter = loadChannelMessages();

  const deliverChannelMessages = (terminalId: string): number => {
    const queue = channelQueues.get(terminalId);
    if (!queue || queue.length === 0) {
      return 0;
    }

    const session = sessions.get(terminalId);
    if (!session) {
      return 0;
    }

    const undelivered = queue.filter((m) => !m.delivered);
    if (undelivered.length === 0) {
      return 0;
    }

    // Compose all pending messages into a single prompt injection.
    const lines = undelivered.map(
      (m) => `[Channel message from ${m.fromTerminalId}]: ${m.content}`,
    );
    const prompt = `${lines.join("\n")}\r`;

    logVerbose(`[Channel] Delivering ${undelivered.length} message(s) to ${terminalId}`);

    for (const m of undelivered) {
      m.delivered = true;
      m.deliveredAt = new Date().toISOString();
      appendAuditEvent?.("channel.message_delivered", {
        terminalId,
        payload: {
          messageId: m.messageId,
          fromTerminalId: m.fromTerminalId,
          content: m.content,
        },
      });
    }

    writeInput(terminalId, prompt);
    persistChannelMessages();
    return undelivered.length;
  };

  return {
    sendChannelMessage(
      toTerminalId: string,
      fromTerminalId: string,
      content: string,
    ): ChannelMessage | null {
      if (!terminals.has(toTerminalId)) {
        return null;
      }

      channelMessageCounter += 1;
      const normalizedFromTerminalId = fromTerminalId.trim() || "operator";
      const message: ChannelMessage = {
        messageId: `msg-${channelMessageCounter}`,
        fromTerminalId: normalizedFromTerminalId,
        toTerminalId,
        content: normalizeChannelContent(content),
        timestamp: new Date().toISOString(),
        delivered: false,
      };

      const queue = channelQueues.get(toTerminalId) ?? [];
      queue.push(message);
      channelQueues.set(toTerminalId, queue);

      logVerbose(
        `[Channel] Queued message ${message.messageId} from=${fromTerminalId} to=${toTerminalId}`,
      );
      appendAuditEvent?.("channel.message_queued", {
        terminalId: toTerminalId,
        payload: {
          messageId: message.messageId,
          fromTerminalId: normalizedFromTerminalId,
          content: message.content,
        },
      });
      persistChannelMessages();

      // If the target session is idle, deliver immediately.
      const targetSession = sessions.get(toTerminalId);
      if (targetSession && targetSession.agentState === "idle") {
        deliverChannelMessages(toTerminalId);
      }

      return message;
    },

    listChannelMessages(terminalId: string): ChannelMessage[] {
      return [...(channelQueues.get(terminalId) ?? [])];
    },

    listAllChannelMessages(): ChannelMessage[] {
      return Array.from(channelQueues.values())
        .flat()
        .sort((left, right) => right.timestamp.localeCompare(left.timestamp));
    },

    pruneOrphanedChannelMessages(): string[] {
      const prunedMessageIds: string[] = [];
      for (const [terminalId, messages] of channelQueues) {
        if (terminals.has(terminalId)) {
          continue;
        }
        // Keep delivered messages as durable handoff history; only a message that can no
        // longer reach its deleted target is safe to remove.
        const orphanedQueuedMessages = messages.filter((message) => !message.delivered);
        if (orphanedQueuedMessages.length === 0) {
          continue;
        }
        const deliveredMessages = messages.filter((message) => message.delivered);
        if (deliveredMessages.length === 0) {
          channelQueues.delete(terminalId);
        } else {
          channelQueues.set(terminalId, deliveredMessages);
        }
        prunedMessageIds.push(...orphanedQueuedMessages.map((message) => message.messageId));
      }
      if (prunedMessageIds.length === 0) {
        return [];
      }
      persistChannelMessages();
      appendAuditEvent?.("channel.orphaned_messages_pruned", {
        payload: { messageCount: prunedMessageIds.length },
      });
      return prunedMessageIds;
    },

    deliverChannelMessages,
  };
};
