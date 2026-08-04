import { useCallback, useEffect, useState } from "react";

import { formatTimestamp } from "../app/formatTimestamp";
import { buildMemoryUrl } from "../runtime/runtimeEndpoints";
import { ActionButton } from "./ui/ActionButton";

type MemoryEntry = {
  id: string;
  type: "fact" | "decision" | "preference" | "handoff" | "research" | "note";
  content: string;
  summary?: string;
  tags: string[];
  source: string;
  tentacleId?: string;
  updatedAt: string;
};

const readMemoryError = async (response: Response) => {
  const payload = (await response.json().catch(() => ({}))) as { error?: unknown };
  return typeof payload.error === "string" ? payload.error : "Unable to load shared memory.";
};

export const MemoryCenterPanel = () => {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [draftQuery, setDraftQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadMemory = useCallback(async (query: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(buildMemoryUrl({ query }), {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(await readMemoryError(response));
      const payload = (await response.json()) as { entries?: unknown };
      setEntries(Array.isArray(payload.entries) ? (payload.entries as MemoryEntry[]) : []);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load shared memory.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMemory("");
  }, [loadMemory]);

  const search = () => {
    const query = draftQuery.trim();
    setActiveQuery(query);
    void loadMemory(query);
  };

  return (
    <section
      className="settings-panel settings-panel--memory-center"
      aria-label="Shared Memory Center"
    >
      <header className="settings-panel-header settings-memory-center-header">
        <div>
          <h2>Shared Memory Center</h2>
          <p>
            Read verified decisions, research, and handoffs shared across swarms. Record Center
            consolidates durable updates.
          </p>
        </div>
        <span className="settings-agent-directory-count">{entries.length} entries</span>
      </header>
      <form
        className="settings-memory-search"
        onSubmit={(event) => {
          event.preventDefault();
          search();
        }}
      >
        <input
          aria-label="Search shared memory"
          onChange={(event) => setDraftQuery(event.currentTarget.value)}
          placeholder="Search decisions, research, or handoffs..."
          value={draftQuery}
        />
        <ActionButton disabled={isLoading} size="dense" type="submit" variant="info">
          {isLoading ? "Searching..." : "Search"}
        </ActionButton>
        {activeQuery ? (
          <ActionButton
            onClick={() => {
              setDraftQuery("");
              setActiveQuery("");
              void loadMemory("");
            }}
            size="dense"
            type="button"
            variant="info"
          >
            Clear
          </ActionButton>
        ) : null}
      </form>
      {errorMessage ? <p className="settings-agentic-os-error">{errorMessage}</p> : null}
      <ol className="settings-memory-list" aria-label="Shared memory entries">
        {entries.length === 0 ? (
          <li className="settings-memory-empty">
            {activeQuery ? "No matching memory entries." : "No verified memory entries yet."}
          </li>
        ) : (
          entries.slice(0, 12).map((entry) => (
            <li key={entry.id}>
              <div className="settings-memory-entry-meta">
                <strong>{entry.type}</strong>
                <span>{entry.tentacleId ?? "project"}</span>
                <span>{formatTimestamp(entry.updatedAt)}</span>
              </div>
              <p>{entry.summary ?? entry.content}</p>
              <small>Source: {entry.source}</small>
            </li>
          ))
        )}
      </ol>
    </section>
  );
};
