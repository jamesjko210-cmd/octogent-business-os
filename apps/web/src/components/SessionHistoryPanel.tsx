import { useEffect, useState } from "react";

import { formatTimestamp } from "../app/formatTimestamp";
import { buildSessionHistoryUrl } from "../runtime/runtimeEndpoints";

type SessionHistoryEntry = {
  terminalId: string;
  title: string;
  agentId?: string;
  agentTitle?: string;
  tentacleId: string;
  provider: string;
  startedAt: string;
  endedAt?: string;
  state: "running" | "ended";
  endReason?: string;
  evidenceEventCount: number;
  lastEvidenceAt: string;
};

const readError = async (response: Response) => {
  const payload = (await response.json().catch(() => ({}))) as { error?: unknown };
  return typeof payload.error === "string" ? payload.error : "Unable to load session history.";
};

export const SessionHistoryPanel = () => {
  const [sessions, setSessions] = useState<SessionHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    const load = async () => {
      try {
        const response = await fetch(buildSessionHistoryUrl(), {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error(await readError(response));
        const payload = (await response.json()) as { sessions?: SessionHistoryEntry[] };
        if (isCurrent) {
          setSessions(Array.isArray(payload.sessions) ? payload.sessions.slice(0, 12) : []);
          setError(null);
        }
      } catch (requestError) {
        if (isCurrent)
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Unable to load session history.",
          );
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => {
      isCurrent = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <section
      className="settings-panel settings-panel--session-history"
      aria-label="Verified session history"
    >
      <header className="settings-panel-header settings-session-history-header">
        <div>
          <h2>Verified session history</h2>
          <p>
            Read-only local timeline from the append-only audit. Safe metadata only; no prompts or
            credentials.
          </p>
        </div>
        <span className="settings-session-history-count">{sessions.length} recent</span>
      </header>
      {error ? <p className="settings-session-history-error">{error}</p> : null}
      {sessions.length === 0 && !error ? (
        <p className="settings-memory-empty">No managed sessions recorded yet.</p>
      ) : null}
      {sessions.length > 0 ? (
        <ol className="settings-session-history-list" aria-label="Recent managed sessions">
          {sessions.map((session) => (
            <li data-state={session.state} key={`${session.terminalId}-${session.startedAt}`}>
              <div className="settings-session-history-meta">
                <strong>{session.agentTitle ?? session.title}</strong>
                <span>{session.provider}</span>
                <span>{session.tentacleId}</span>
                <span>
                  {session.state === "running" ? "running" : (session.endReason ?? "ended")}
                </span>
              </div>
              <p>
                {formatTimestamp(session.startedAt)}
                {session.endedAt ? ` to ${formatTimestamp(session.endedAt)}` : ""}
              </p>
              <small>
                {session.evidenceEventCount} verified audit events · last evidence{" "}
                {formatTimestamp(session.lastEvidenceAt)}
              </small>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
};
