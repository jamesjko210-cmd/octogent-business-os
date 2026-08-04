import { findAgentRosterRole, listAgentRosterRoles } from "./agentRoster";
import type { TerminalRuntime } from "./createApiServer/routeHelpers";
import { logVerbose } from "./logging";
import {
  MAX_CHANNEL_MESSAGE_LENGTH,
  normalizeChannelContent,
} from "./terminalRuntime/channelMessaging";

const TELEGRAM_API_ORIGIN = "https://api.telegram.org";
const DEFAULT_POLL_TIMEOUT_SECONDS = 20;
const MAX_POLL_TIMEOUT_SECONDS = 50;

export type TelegramBridgeStatus = {
  state: "not_configured" | "misconfigured" | "ready" | "running" | "error";
  mode: "long_polling";
  allowedChatCount: number;
  commands: string[];
  detail: string;
  lastPollAt?: string;
  lastError?: string;
};

export type TelegramBridgeConfig =
  | {
      enabled: false;
      reason: "missing_token" | "missing_allowed_chat_ids" | "invalid_allowed_chat_ids";
    }
  | {
      enabled: true;
      botToken: string;
      allowedChatIds: ReadonlySet<string>;
      pollTimeoutSeconds: number;
    };

type TelegramMessage = {
  chat?: { id?: number | string };
  text?: string;
};

type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
};

type TelegramApiResponse<T> = {
  ok?: boolean;
  result?: T;
  description?: string;
};

type TelegramFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Pick<Response, "ok" | "json">>;

const COMMANDS = ["/help", "/roles", "/agent <role-id> <message>", "/updates [role-id]"];

const parseAllowedChatIds = (raw: string | undefined): ReadonlySet<string> | null => {
  const values = (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.length === 0) return null;
  if (values.some((value) => !/^-?\d+$/.test(value))) return new Set();
  return new Set(values);
};

const parsePollTimeoutSeconds = (raw: string | undefined) => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_POLL_TIMEOUT_SECONDS;
  return Math.max(1, Math.min(MAX_POLL_TIMEOUT_SECONDS, Math.floor(parsed)));
};

export const resolveTelegramBridgeConfig = (
  env: Record<string, string | undefined> = process.env,
): TelegramBridgeConfig => {
  const botToken = env.OCTOGENT_TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken) return { enabled: false, reason: "missing_token" };

  const allowedChatIds = parseAllowedChatIds(env.OCTOGENT_TELEGRAM_ALLOWED_CHAT_IDS);
  if (allowedChatIds === null) return { enabled: false, reason: "missing_allowed_chat_ids" };
  if (allowedChatIds.size === 0) return { enabled: false, reason: "invalid_allowed_chat_ids" };

  return {
    enabled: true,
    botToken,
    allowedChatIds,
    pollTimeoutSeconds: parsePollTimeoutSeconds(env.OCTOGENT_TELEGRAM_POLL_TIMEOUT_SECONDS),
  };
};

const responseText = (text: string) => ({ text: text.slice(0, MAX_CHANNEL_MESSAGE_LENGTH) });

export const createTelegramBridge = ({
  runtime,
  config = resolveTelegramBridgeConfig(),
  fetchImpl = globalThis.fetch.bind(globalThis) as TelegramFetch,
}: {
  runtime: TerminalRuntime;
  config?: TelegramBridgeConfig;
  fetchImpl?: TelegramFetch;
}) => {
  let isRunning = false;
  let shouldStop = false;
  let nextUpdateId: number | undefined;
  let lastPollAt: string | undefined;
  let lastError: string | undefined;
  let activePollAbortController: AbortController | undefined;

  const status = (): TelegramBridgeStatus => {
    if (!config.enabled) {
      const detail =
        config.reason === "missing_token"
          ? "Add a bot token and a trusted chat ID to enable the local bridge."
          : config.reason === "missing_allowed_chat_ids"
            ? "Add one or more trusted chat IDs before the bridge can receive messages."
            : "Trusted chat IDs must be comma-separated Telegram numeric IDs.";
      return {
        state: config.reason === "invalid_allowed_chat_ids" ? "misconfigured" : "not_configured",
        mode: "long_polling",
        allowedChatCount: 0,
        commands: COMMANDS,
        detail,
      };
    }

    return {
      state: lastError ? "error" : isRunning ? "running" : "ready",
      mode: "long_polling",
      allowedChatCount: config.allowedChatIds.size,
      commands: COMMANDS,
      detail:
        "Only trusted chats can queue bounded messages for permanent roles. Telegram never receives terminal capabilities, secrets, or agent transcripts.",
      ...(lastPollAt ? { lastPollAt } : {}),
      ...(lastError ? { lastError } : {}),
    };
  };

  const telegramRequest = async <T>(
    method: string,
    body?: Record<string, unknown>,
    signal?: AbortSignal,
  ) => {
    if (!config.enabled) return null;
    const requestInit: RequestInit = body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          ...(signal ? { signal } : {}),
        }
      : { method: "GET", ...(signal ? { signal } : {}) };
    const response = await fetchImpl(
      `${TELEGRAM_API_ORIGIN}/bot${config.botToken}/${method}`,
      requestInit,
    );
    const payload = (await response.json()) as TelegramApiResponse<T>;
    if (!response.ok || payload.ok !== true) {
      throw new Error(payload.description || `Telegram ${method} request failed.`);
    }
    return payload.result ?? null;
  };

  const sendReply = async (chatId: string, text: string) => {
    await telegramRequest("sendMessage", { chat_id: chatId, ...responseText(text) });
  };

  const formatOperatorUpdates = (agentId?: string) => {
    const updates = runtime.listOperatorUpdates({
      ...(agentId ? { agentId } : {}),
      limit: agentId ? 8 : 12,
    });
    if (updates.length === 0) {
      return agentId
        ? `No safe updates are waiting from ${agentId}.`
        : "No safe agent updates are waiting.";
    }
    return `Recent agent updates:\n${updates
      .map((update) => `- ${update.agentId}: ${update.content}`)
      .join("\n")}`;
  };

  const handleMessage = async (message: TelegramMessage) => {
    if (!config.enabled || typeof message.chat?.id === "undefined") return;
    const chatId = String(message.chat.id);
    if (!config.allowedChatIds.has(chatId)) {
      runtime.appendAuditEvent("telegram.message_rejected", {
        payload: { reason: "untrusted_chat" },
      });
      return;
    }

    const text = message.text?.trim() ?? "";
    if (!text || /^\/help(?:@\w+)?$/i.test(text)) {
      await sendReply(
        chatId,
        "Octogent bridge commands:\n/roles\n/agent <role-id> <message>\n/updates [role-id]\n\nMessages are queued to the selected role's local inbox. Agents can submit concise, redacted reports; retrieve them only when you request /updates. Agent-to-agent handoffs stay inside Octogent's audited local channels.",
      );
      return;
    }

    if (/^\/roles(?:@\w+)?$/i.test(text)) {
      const roles = listAgentRosterRoles()
        .map((role) => `- ${role.id}: ${role.title}`)
        .join("\n");
      await sendReply(chatId, `Available roles:\n${roles}\n\nSend: /agent <role-id> <message>`);
      return;
    }

    const updatesMatch = text.match(/^\/updates(?:@\w+)?(?:\s+([a-z0-9-]+))?\s*$/i);
    if (updatesMatch) {
      const requestedAgentId = updatesMatch[1]?.toLowerCase();
      if (requestedAgentId && !findAgentRosterRole(requestedAgentId)) {
        await sendReply(
          chatId,
          "That role does not exist. Send /roles to see the available permanent roles.",
        );
        return;
      }
      const updates = runtime.listOperatorUpdates({
        ...(requestedAgentId ? { agentId: requestedAgentId } : {}),
        limit: 12,
      });
      runtime.appendAuditEvent("telegram.updates_viewed", {
        payload: { agentId: requestedAgentId ?? null, updateCount: updates.length },
      });
      await sendReply(chatId, formatOperatorUpdates(requestedAgentId));
      return;
    }

    const match = text.match(/^\/agent(?:@\w+)?\s+([a-z0-9-]+)\s+([\s\S]+)$/i);
    if (!match) {
      await sendReply(
        chatId,
        "Use /agent <role-id> <message>, or /updates [role-id]. Send /roles to see permanent roles.",
      );
      return;
    }

    const agentId = match[1]?.toLowerCase() ?? "";
    const content = normalizeChannelContent(match[2] ?? "");
    const role = findAgentRosterRole(agentId);
    if (!role) {
      await sendReply(
        chatId,
        "That role does not exist. Send /roles to see the available permanent roles.",
      );
      return;
    }
    if (!content) {
      await sendReply(chatId, "Your message was empty after safety filtering. Please try again.");
      return;
    }
    if ((match[2] ?? "").trim().length > MAX_CHANNEL_MESSAGE_LENGTH) {
      await sendReply(
        chatId,
        `Messages must be ${MAX_CHANNEL_MESSAGE_LENGTH} characters or fewer.`,
      );
      return;
    }

    const queued = runtime.enqueueAgentInboxMessage(agentId, content, { from: "telegram" });
    runtime.appendAuditEvent("telegram.message_queued", {
      payload: { messageId: queued.messageId, agentId },
    });
    await sendReply(
      chatId,
      `Queued for ${role.title}. Octogent will deliver it when that role's bound terminal reaches an idle prompt.`,
    );
  };

  const pollOnce = async () => {
    if (!config.enabled) return 0;
    activePollAbortController = new AbortController();
    let updates: TelegramUpdate[] | null;
    try {
      updates = await telegramRequest<TelegramUpdate[]>(
        "getUpdates",
        {
          ...(nextUpdateId ? { offset: nextUpdateId } : {}),
          timeout: config.pollTimeoutSeconds,
          allowed_updates: ["message"],
        },
        activePollAbortController.signal,
      );
    } finally {
      activePollAbortController = undefined;
    }
    lastPollAt = new Date().toISOString();
    let handled = 0;
    for (const update of updates ?? []) {
      if (typeof update.update_id === "number") {
        nextUpdateId = Math.max(nextUpdateId ?? 0, update.update_id + 1);
      }
      if (!update.message) continue;
      await handleMessage(update.message);
      handled += 1;
    }
    lastError = undefined;
    return handled;
  };

  const runPollLoop = async () => {
    while (!shouldStop) {
      try {
        await pollOnce();
      } catch (error) {
        if (shouldStop) break;
        // Keep provider responses out of the dashboard and audit trail. A bot token
        // must never become visible through an upstream error message.
        lastError = "Telegram polling is unavailable. Check the local bot configuration.";
        runtime.appendAuditEvent("telegram.poll_failed", { payload: { reason: "request_failed" } });
        if (!shouldStop) await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
    }
    isRunning = false;
  };

  return {
    getStatus: status,
    async pollOnce() {
      return pollOnce();
    },
    start() {
      if (!config.enabled || isRunning) return;
      shouldStop = false;
      isRunning = true;
      void runPollLoop();
      logVerbose("[Telegram] Long-polling bridge started.");
    },
    stop() {
      shouldStop = true;
      activePollAbortController?.abort();
    },
  };
};

export type TelegramBridge = ReturnType<typeof createTelegramBridge>;
