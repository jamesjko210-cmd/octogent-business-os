import { useEffect, useState } from "react";

import { buildOperatorUpdatesUrl, buildTelegramStatusUrl } from "../runtime/runtimeEndpoints";

type TelegramBridgeStatus = {
  state: "not_configured" | "misconfigured" | "ready" | "running" | "error";
  mode: "long_polling";
  allowedChatCount: number;
  commands: string[];
  detail: string;
  lastPollAt?: string;
  lastError?: string;
};

type OperatorUpdate = {
  updateId: string;
  agentId: string;
  content: string;
};

const STATUS_LABEL: Record<TelegramBridgeStatus["state"], string> = {
  not_configured: "Needs setup",
  misconfigured: "Fix setup",
  ready: "Ready",
  running: "Running",
  error: "Needs attention",
};

const formatLastPoll = (value: string | undefined) => {
  if (!value) return "No poll yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "No poll yet" : `Last checked ${date.toLocaleTimeString()}`;
};

export const TelegramBridgePanel = () => {
  const [status, setStatus] = useState<TelegramBridgeStatus | null>(null);
  const [updates, setUpdates] = useState<OperatorUpdate[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    const loadStatus = async () => {
      try {
        const [statusResponse, updatesResponse] = await Promise.all([
          fetch(buildTelegramStatusUrl(), { headers: { Accept: "application/json" } }),
          fetch(buildOperatorUpdatesUrl(), { headers: { Accept: "application/json" } }),
        ]);
        const payload = (await statusResponse
          .json()
          .catch(() => null)) as TelegramBridgeStatus | null;
        const updatesPayload = (await updatesResponse.json().catch(() => null)) as {
          updates?: unknown;
        } | null;
        if (!statusResponse.ok || !payload) throw new Error("Unable to check the Telegram bridge.");
        if (!updatesResponse.ok) throw new Error("Unable to load recent agent reports.");
        if (isCurrent) {
          setStatus(payload);
          setUpdates(
            Array.isArray(updatesPayload?.updates)
              ? (updatesPayload.updates as OperatorUpdate[])
              : [],
          );
          setError(null);
        }
      } catch (requestError) {
        if (isCurrent) {
          setError(
            requestError instanceof Error ? requestError.message : "Unable to check Telegram.",
          );
        }
      }
    };

    void loadStatus();
    const timer = window.setInterval(() => void loadStatus(), 15_000);
    return () => {
      isCurrent = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <section
      className="settings-panel settings-panel--telegram"
      aria-label="Telegram operator bridge"
    >
      <header className="settings-panel-header settings-telegram-header">
        <div>
          <h2>Telegram operator bridge</h2>
          <p>
            Send a bounded instruction to a permanent role from your trusted Telegram chat.
            Agent-to-agent handoffs remain inside Octogent&apos;s audited local channels.
          </p>
        </div>
        <span className="settings-telegram-status" data-state={status?.state ?? "not_configured"}>
          {status ? STATUS_LABEL[status.state] : "Checking"}
        </span>
      </header>

      {error ? <p className="settings-telegram-error">{error}</p> : null}
      {status ? (
        <div className="settings-telegram-details">
          <p>{status.detail}</p>
          <small>
            {status.mode === "long_polling" ? "Local long polling" : status.mode} ·{" "}
            {status.allowedChatCount} trusted chat
            {status.allowedChatCount === 1 ? "" : "s"} · {formatLastPoll(status.lastPollAt)}
          </small>
          {status.lastError ? (
            <small className="settings-telegram-error">{status.lastError}</small>
          ) : null}
          <code>{status.commands.join("  ·  ")}</code>
        </div>
      ) : null}
      <div className="settings-telegram-updates" aria-label="Recent agent reports">
        <strong>Recent agent reports</strong>
        <p>
          Submitted locally by verified role terminals. Telegram sends them only when you request
          /updates.
        </p>
        {updates.length === 0 ? (
          <small>No safe reports queued yet.</small>
        ) : (
          <ol>
            {updates.map((update) => (
              <li key={update.updateId}>
                <strong>{update.agentId}</strong>
                <span>{update.content}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
};
