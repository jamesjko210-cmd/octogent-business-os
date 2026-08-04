import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { formatTimestamp } from "../app/formatTimestamp";
import { useConversationsRuntime } from "../app/hooks/useConversationsRuntime";
import type { ChannelMessage, TerminalView } from "../app/types";
import {
  buildAgentInboxUrl,
  buildAgentRosterUrl,
  buildAllChannelMessagesUrl,
  buildChannelMessagesUrl,
} from "../runtime/runtimeEndpoints";
import { ClearAllConversationsDialog } from "./ClearAllConversationsDialog";
import { SidebarConversationsList } from "./SidebarConversationsList";
import { ActionButton } from "./ui/ActionButton";
import { MarkdownContent } from "./ui/MarkdownContent";

type ConversationsPrimaryViewProps = {
  enabled: boolean;
  columns: TerminalView;
  onSidebarContent?: (content: ReactNode) => void;
  onActionPanel?: (content: ReactNode) => void;
};

const CHANNEL_POLL_INTERVAL_MS = 4_000;

type AgentRosterState = "working" | "waiting" | "ready" | "prepared" | "not_launched";
type ProviderConnectionState = "not_started" | "shell_started_unverified";

type AgentRosterEntry = {
  id: string;
  title: string;
  role: string;
  tentacleId: string;
  purpose: string;
  state: AgentRosterState;
  providerConnection: ProviderConnectionState;
  currentActivity: string;
  terminalIds: string[];
};

type AgentInboxMessage = {
  messageId: string;
  from: "operator" | "agent";
  fromTerminalId?: string;
  fromAgentId?: string;
  content: string;
  timestamp: string;
  delivered: boolean;
  deliveredAt?: string;
  deliveredToTerminalId?: string;
};

type CommsMessage = ChannelMessage | AgentInboxMessage;

const isChannelMessage = (message: CommsMessage): message is ChannelMessage =>
  "toTerminalId" in message;

const senderLabel = (message: CommsMessage) => {
  if (isChannelMessage(message)) return message.fromTerminalId;
  if (message.from === "agent") return message.fromAgentId ?? message.fromTerminalId ?? "agent";
  return "operator";
};

const ROLE_STATE_LABELS: Record<AgentRosterState, string> = {
  working: "working",
  waiting: "waiting",
  ready: "ready",
  prepared: "prepared",
  not_launched: "not launched",
};

const readChannelError = async (response: Response) => {
  try {
    const payload = (await response.json()) as { error?: unknown };
    return typeof payload.error === "string" ? payload.error : "Channel request failed.";
  } catch {
    return "Channel request failed.";
  }
};

const AgentHandoffsPanel = ({ enabled }: { enabled: boolean }) => {
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [agents, setAgents] = useState<AgentRosterEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let isCurrent = true;
    const loadHandoffs = async () => {
      try {
        const [response, rosterResponse] = await Promise.all([
          fetch(buildAllChannelMessagesUrl(), { headers: { Accept: "application/json" } }),
          fetch(buildAgentRosterUrl(), { headers: { Accept: "application/json" } }),
        ]);
        if (!response.ok) throw new Error(await readChannelError(response));
        const payload = (await response.json()) as { messages?: unknown };
        const rosterPayload = rosterResponse.ok
          ? ((await rosterResponse.json()) as { agents?: unknown })
          : null;
        if (isCurrent) {
          setMessages(
            Array.isArray(payload.messages) ? (payload.messages as ChannelMessage[]) : [],
          );
          if (Array.isArray(rosterPayload?.agents)) {
            setAgents(rosterPayload.agents as AgentRosterEntry[]);
          }
          setErrorMessage(null);
        }
      } catch (error) {
        if (isCurrent) {
          setErrorMessage(
            error instanceof Error ? error.message : "Unable to load agent handoffs.",
          );
        }
      }
    };

    void loadHandoffs();
    const intervalId = window.setInterval(() => {
      void loadHandoffs();
    }, CHANNEL_POLL_INTERVAL_MS);
    return () => {
      isCurrent = false;
      window.clearInterval(intervalId);
    };
  }, [enabled]);

  const roleByTerminalId = new Map(
    agents.flatMap((agent) => agent.terminalIds.map((terminalId) => [terminalId, agent] as const)),
  );
  const roleLabel = (terminalId: string) => roleByTerminalId.get(terminalId)?.title ?? terminalId;

  return (
    <section className="agent-handoffs-panel" aria-label="Recent agent handoffs">
      <header>
        <div>
          <p className="agent-comms-kicker">Cross-Agent Handoffs</p>
          <h3>Recent coordination</h3>
        </div>
        <span>{messages.length} recorded</span>
      </header>
      {errorMessage ? <p className="agent-handoffs-error">{errorMessage}</p> : null}
      <ol className="agent-handoffs-list">
        {messages.length === 0 ? (
          <li>No agent-to-agent handoffs recorded yet.</li>
        ) : (
          messages.slice(0, 8).map((message) => (
            <li key={message.messageId}>
              <div>
                <span className="agent-handoff-participant">
                  <strong>{roleLabel(message.fromTerminalId)}</strong>
                  <small>{message.fromTerminalId}</small>
                </span>
                <span>to</span>
                <span className="agent-handoff-participant">
                  <strong>{roleLabel(message.toTerminalId)}</strong>
                  <small>{message.toTerminalId}</small>
                </span>
                <em>{message.delivered ? "delivered" : "queued"}</em>
              </div>
              <p>{message.content}</p>
              <small>{formatTimestamp(message.timestamp)}</small>
            </li>
          ))
        )}
      </ol>
    </section>
  );
};

const AgentCommsPanel = ({ columns, enabled }: { columns: TerminalView; enabled: boolean }) => {
  const [agents, setAgents] = useState<AgentRosterEntry[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedTerminalId, setSelectedTerminalId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CommsMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const messageRequestId = useRef(0);
  const lastMessageEndpoint = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let isCurrent = true;
    const loadAgents = async () => {
      try {
        const response = await fetch(buildAgentRosterUrl(), {
          headers: { Accept: "application/json" },
        });
        const payload = (await response.json().catch(() => ({}))) as { agents?: unknown };
        if (!response.ok) throw new Error(await readChannelError(response));
        if (isCurrent) {
          setAgents(Array.isArray(payload.agents) ? (payload.agents as AgentRosterEntry[]) : []);
        }
      } catch (error) {
        if (isCurrent) {
          setErrorMessage(
            error instanceof Error ? error.message : "Unable to load permanent roles.",
          );
        }
      }
    };

    void loadAgents();
    const intervalId = window.setInterval(() => {
      void loadAgents();
    }, CHANNEL_POLL_INTERVAL_MS);
    return () => {
      isCurrent = false;
      window.clearInterval(intervalId);
    };
  }, [enabled]);

  useEffect(() => {
    if (selectedAgentId && agents.some((agent) => agent.id === selectedAgentId)) return;
    if (agents.length > 0) {
      setSelectedAgentId(agents[0]?.id ?? null);
      setSelectedTerminalId(null);
      return;
    }
    if (
      selectedTerminalId &&
      columns.some((terminal) => terminal.terminalId === selectedTerminalId)
    ) {
      return;
    }
    setSelectedTerminalId(columns[0]?.terminalId ?? null);
  }, [agents, columns, selectedAgentId, selectedTerminalId]);

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? null;
  const selectedTerminal =
    columns.find((terminal) => terminal.terminalId === selectedTerminalId) ?? null;
  const unboundTerminals = columns.filter(
    (terminal) => !terminal.agentId || !agents.some((agent) => agent.id === terminal.agentId),
  );
  const selectedEndpoint = selectedAgent
    ? buildAgentInboxUrl(selectedAgent.id)
    : selectedTerminal
      ? buildChannelMessagesUrl(selectedTerminal.terminalId)
      : null;

  useEffect(() => {
    if (lastMessageEndpoint.current === selectedEndpoint) return;
    lastMessageEndpoint.current = selectedEndpoint;
    messageRequestId.current += 1;
    setMessages([]);
    setErrorMessage(null);
  }, [selectedEndpoint]);

  const refreshMessages = useCallback(async () => {
    if (!enabled || !selectedEndpoint) {
      return;
    }

    const requestId = messageRequestId.current + 1;
    messageRequestId.current = requestId;
    setIsLoading(true);
    try {
      const response = await fetch(selectedEndpoint, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(await readChannelError(response));
      }
      const payload = (await response.json()) as { messages?: CommsMessage[] };
      if (requestId === messageRequestId.current) {
        setMessages(Array.isArray(payload.messages) ? payload.messages : []);
        setErrorMessage(null);
      }
    } catch (error) {
      if (requestId === messageRequestId.current) {
        setErrorMessage(
          error instanceof Error ? error.message : "Unable to load channel messages.",
        );
      }
    } finally {
      if (requestId === messageRequestId.current) {
        setIsLoading(false);
      }
    }
  }, [enabled, selectedEndpoint]);

  useEffect(() => {
    void refreshMessages();
  }, [refreshMessages]);

  useEffect(() => {
    if (!enabled || !selectedEndpoint) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshMessages();
    }, CHANNEL_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [enabled, refreshMessages, selectedEndpoint]);

  const sendMessage = useCallback(async () => {
    const content = draft.trim();
    if (!selectedEndpoint || content.length === 0) {
      return;
    }

    setIsSending(true);
    try {
      const response = await fetch(selectedEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!response.ok) {
        throw new Error(await readChannelError(response));
      }
      setDraft("");
      await refreshMessages();
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to send channel message.");
    } finally {
      setIsSending(false);
    }
  }, [draft, refreshMessages, selectedEndpoint]);

  return (
    <section className="agent-comms-panel" aria-label="Agent OS communications">
      <header className="agent-comms-header">
        <div>
          <p className="agent-comms-kicker">Agent OS Comms</p>
          <h2>Talk to each agent</h2>
          <p>Durable channel messages for operator-to-agent and agent-to-agent coordination.</p>
        </div>
        <div className="agent-comms-health" aria-label="Communication health summary">
          <strong>{agents.length}</strong>
          <span>roles</span>
          <strong>{messages.length}</strong>
          <span>messages</span>
        </div>
      </header>

      <AgentHandoffsPanel enabled={enabled} />

      <div className="agent-comms-grid">
        <aside className="agent-comms-roster" aria-label="Agent roster">
          {agents.length === 0 && unboundTerminals.length === 0 ? (
            <p className="agent-comms-empty">
              No permanent roles or live terminals are available yet.
            </p>
          ) : (
            <>
              <p className="agent-comms-roster-heading">Permanent roles</p>
              {agents.map((agent) => (
                <button
                  className="agent-comms-roster-item"
                  data-active={agent.id === selectedAgentId ? "true" : undefined}
                  key={agent.id}
                  onClick={() => {
                    setSelectedAgentId(agent.id);
                    setSelectedTerminalId(null);
                  }}
                  type="button"
                >
                  <span>
                    <strong>{agent.title}</strong>
                    <small>{agent.role}</small>
                  </span>
                  <em>{ROLE_STATE_LABELS[agent.state]}</em>
                </button>
              ))}
              {unboundTerminals.length > 0 ? (
                <>
                  <p className="agent-comms-roster-heading">Unbound live terminals</p>
                  {unboundTerminals.map((terminal) => (
                    <button
                      className="agent-comms-roster-item"
                      data-active={terminal.terminalId === selectedTerminalId ? "true" : undefined}
                      key={terminal.terminalId}
                      onClick={() => {
                        setSelectedAgentId(null);
                        setSelectedTerminalId(terminal.terminalId);
                      }}
                      type="button"
                    >
                      <span>
                        <strong>
                          {terminal.tentacleName || terminal.label || terminal.terminalId}
                        </strong>
                        <small>{terminal.terminalId}</small>
                      </span>
                      <em>
                        {terminal.agentRuntimeState ?? terminal.lifecycleState ?? terminal.state}
                      </em>
                    </button>
                  ))}
                </>
              ) : null}
            </>
          )}
        </aside>

        <section className="agent-comms-thread" aria-label="Selected agent channel">
          <header className="agent-comms-thread-header">
            <div>
              <h3>
                {selectedAgent
                  ? selectedAgent.title
                  : selectedTerminal
                    ? selectedTerminal.tentacleName ||
                      selectedTerminal.label ||
                      selectedTerminal.terminalId
                    : "Select an agent"}
              </h3>
              {selectedAgent ? (
                <p>
                  {selectedAgent.role} · {ROLE_STATE_LABELS[selectedAgent.state]} · durable role
                  inbox ·{" "}
                  {selectedAgent.providerConnection === "shell_started_unverified"
                    ? "provider unverified"
                    : "provider not started"}
                </p>
              ) : selectedTerminal ? (
                <p>
                  {selectedTerminal.terminalId} · {selectedTerminal.workspaceMode ?? "shared"} ·{" "}
                  {selectedTerminal.lifecycleState ?? selectedTerminal.state}
                </p>
              ) : null}
            </div>
            <ActionButton
              disabled={!selectedEndpoint || isLoading}
              onClick={() => {
                void refreshMessages();
              }}
              size="dense"
              variant="info"
            >
              {isLoading ? "Refreshing..." : "Refresh"}
            </ActionButton>
          </header>

          {errorMessage ? <p className="agent-comms-error">{errorMessage}</p> : null}

          <ol className="agent-comms-message-list" aria-label="Channel message history">
            {messages.length === 0 ? (
              <li className="agent-comms-empty-message">
                No channel messages yet. Send a direct instruction or status check.
              </li>
            ) : (
              messages.map((message) => (
                <li
                  className="agent-comms-message"
                  data-from-operator={
                    !isChannelMessage(message) || message.fromTerminalId === "operator"
                      ? "true"
                      : undefined
                  }
                  key={message.messageId}
                >
                  <div className="agent-comms-message-meta">
                    <strong>{senderLabel(message)}</strong>
                    <span>{formatTimestamp(message.timestamp)}</span>
                    <em>{message.delivered ? "delivered" : "queued"}</em>
                  </div>
                  <p>{message.content}</p>
                  {message.deliveredAt ? (
                    <small>
                      Delivered
                      {"deliveredToTerminalId" in message && message.deliveredToTerminalId
                        ? ` to ${message.deliveredToTerminalId}`
                        : ""}{" "}
                      {formatTimestamp(message.deliveredAt)}
                    </small>
                  ) : null}
                </li>
              ))
            )}
          </ol>

          <form
            className="agent-comms-compose"
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage();
            }}
          >
            <textarea
              aria-label="Message selected agent"
              disabled={!selectedEndpoint || isSending}
              onChange={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder={
                selectedAgent
                  ? `Message ${selectedAgent.title}...`
                  : selectedTerminal
                    ? `Message ${selectedTerminal.tentacleName || selectedTerminal.terminalId}...`
                    : "Select an agent first..."
              }
              rows={3}
              value={draft}
            />
            <ActionButton
              disabled={!selectedEndpoint || draft.trim().length === 0 || isSending}
              size="dense"
              type="submit"
              variant="accent"
            >
              {isSending ? "Sending..." : selectedAgent ? "Queue for role" : "Send to terminal"}
            </ActionButton>
          </form>
        </section>
      </div>
    </section>
  );
};

export const ConversationsPrimaryView = ({
  enabled,
  columns,
  onSidebarContent,
  onActionPanel,
}: ConversationsPrimaryViewProps) => {
  const {
    sessions,
    selectedSessionId,
    selectedSession,
    isLoadingSessions: isLoadingConversationSessions,
    isLoadingSelectedSession,
    isExporting,
    isClearing: isClearingConversations,
    isSearching: isSearchingConversations,
    searchQuery,
    searchHits: conversationsSearchHits,
    highlightedTurnId,
    errorMessage,
    selectSession,
    refreshSessions,
    clearAllSessions,
    deleteSession,
    exportSession,
    searchConversations,
    clearSearch: clearConversationsSearch,
    navigateToSearchHit: navigateToConversationSearchHit,
  } = useConversationsRuntime({ enabled });

  const [isPendingClearAll, setIsPendingClearAll] = useState(false);

  const onDeleteSession = useCallback(() => {
    if (selectedSessionId) {
      void deleteSession(selectedSessionId);
    }
  }, [selectedSessionId, deleteSession]);

  const onExport = useCallback(
    (format: "json" | "md") => {
      if (!selectedSessionId) {
        return;
      }

      void exportSession(selectedSessionId, format).then((result) => {
        if (!result) {
          return;
        }

        const blob = new Blob([result.content], { type: result.contentType });
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = result.filename;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(objectUrl);
      });
    },
    [selectedSessionId, exportSession],
  );

  // Push sidebar content
  const sidebarContent = (
    <SidebarConversationsList
      sessions={sessions}
      selectedSessionId={selectedSessionId}
      isLoadingSessions={isLoadingConversationSessions}
      isSearching={isSearchingConversations}
      searchQuery={searchQuery}
      searchHits={conversationsSearchHits}
      onSelectSession={selectSession}
      onRefresh={() => {
        void refreshSessions();
      }}
      onClearAll={() => {
        setIsPendingClearAll(true);
      }}
      onSearch={(query) => {
        void searchConversations(query);
      }}
      onClearSearch={clearConversationsSearch}
      onNavigateToHit={navigateToConversationSearchHit}
    />
  );

  useEffect(() => {
    onSidebarContent?.(sidebarContent);
    return () => onSidebarContent?.(null);
  });

  // Push action panel for clear-all dialog
  const actionPanelContent = isPendingClearAll ? (
    <ClearAllConversationsDialog
      sessionCount={sessions.length}
      isClearing={isClearingConversations}
      onCancel={() => {
        setIsPendingClearAll(false);
      }}
      onConfirm={() => {
        void clearAllSessions().then(() => {
          setIsPendingClearAll(false);
        });
      }}
    />
  ) : null;

  useEffect(() => {
    onActionPanel?.(actionPanelContent);
    return () => onActionPanel?.(null);
  });

  const isDeletingSession = false;
  const highlightedRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (highlightedTurnId && highlightedRef.current) {
      highlightedRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightedTurnId]);

  return (
    <section className="conversations-view" aria-label="Conversations primary view">
      {errorMessage ? <p className="conversations-error">{errorMessage}</p> : null}

      <AgentCommsPanel columns={columns} enabled={enabled} />

      <section className="conversations-transcript" aria-label="Conversation transcript pane">
        {isLoadingSelectedSession ? (
          <p className="conversations-empty">Loading conversation...</p>
        ) : selectedSession ? (
          <>
            <header className="conversations-transcript-header">
              <div className="conversations-transcript-header-top">
                <h3>{selectedSession.sessionId}</h3>
                <div className="conversations-transcript-header-actions">
                  <ActionButton
                    aria-label="Export conversation as JSON"
                    className="conversations-export"
                    disabled={isExporting}
                    onClick={() => {
                      onExport("json");
                    }}
                    size="dense"
                    variant="info"
                  >
                    {isExporting ? "Exporting..." : "Export JSON"}
                  </ActionButton>
                  <ActionButton
                    aria-label="Export conversation as Markdown"
                    className="conversations-export"
                    disabled={isExporting}
                    onClick={() => {
                      onExport("md");
                    }}
                    size="dense"
                    variant="info"
                  >
                    {isExporting ? "Exporting..." : "Export Markdown"}
                  </ActionButton>
                  <button
                    aria-label="Delete this conversation"
                    className="conversations-delete-btn"
                    disabled={isDeletingSession}
                    onClick={onDeleteSession}
                    type="button"
                  >
                    <svg
                      aria-hidden="true"
                      focusable="false"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 4h10" />
                      <path d="M6 4V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1" />
                      <path d="M4.5 4l.5 9a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1l.5-9" />
                      <path d="M6.5 7v4" />
                      <path d="M9.5 7v4" />
                    </svg>
                  </button>
                </div>
              </div>
              <dl>
                <div>
                  <dt>Started</dt>
                  <dd>{formatTimestamp(selectedSession.startedAt)}</dd>
                </div>
                <div>
                  <dt>Ended</dt>
                  <dd>{formatTimestamp(selectedSession.endedAt)}</dd>
                </div>
                <div>
                  <dt>Events</dt>
                  <dd>{selectedSession.eventCount}</dd>
                </div>
              </dl>
            </header>
            <ol className="conversations-turn-list">
              {selectedSession.turns.map((turn) => (
                <li
                  className="conversations-turn"
                  data-role={turn.role}
                  data-highlighted={turn.turnId === highlightedTurnId ? "true" : undefined}
                  key={turn.turnId}
                  ref={turn.turnId === highlightedTurnId ? highlightedRef : undefined}
                >
                  <time className="conversations-turn-time" dateTime={turn.startedAt}>
                    {formatTimestamp(turn.startedAt)}
                  </time>
                  <MarkdownContent
                    content={turn.content}
                    className="conversations-turn-content"
                    {...(turn.turnId === highlightedTurnId && searchQuery.length > 0
                      ? { highlightTerm: searchQuery }
                      : {})}
                  />
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className="conversations-empty">Select a conversation from the sidebar.</p>
        )}
      </section>
    </section>
  );
};
