import { useCallback, useEffect, useState } from "react";

import {
  buildAgentInboxUrl,
  buildAgentRosterUrl,
  buildTerminalItemUrl,
  buildTerminalStartUrl,
  buildTerminalsUrl,
} from "../runtime/runtimeEndpoints";
import { ActionButton } from "./ui/ActionButton";
import { ConfirmationDialog } from "./ui/ConfirmationDialog";

type AgentRosterState = "working" | "waiting" | "ready" | "prepared" | "not_launched";
type ProviderConnectionState = "not_started" | "shell_started_unverified";

type AgentRosterEntry = {
  id: string;
  title: string;
  role: string;
  tentacleId: string;
  preferredProvider: string;
  operatingModel?: string;
  purpose: string;
  spawnReason: string;
  memoryAccess: "shared-project-memory";
  state: AgentRosterState;
  providerConnection: ProviderConnectionState;
  currentActivity: string;
  activityStatus?: string;
  terminalIds: string[];
  executionScope: {
    workspaceMode: "shared" | "worktree";
    allowedTools: string[];
  } | null;
};

type AgentInboxMessage = {
  messageId: string;
  from: "operator" | "agent";
  fromAgentId?: string;
  content: string;
  timestamp: string;
  delivered: boolean;
  deliveredToTerminalId?: string;
};

const STATE_LABELS: Record<AgentRosterState, string> = {
  working: "Working",
  waiting: "Waiting",
  ready: "Ready",
  prepared: "Prepared",
  not_launched: "Not launched",
};

const PROVIDER_CONNECTION_LABELS: Record<ProviderConnectionState, string> = {
  not_started: "Not started",
  shell_started_unverified: "Shell started; provider unverified",
};

const toErrorMessage = (payload: unknown) =>
  typeof payload === "object" &&
  payload !== null &&
  "error" in payload &&
  typeof payload.error === "string"
    ? payload.error
    : "Unable to load the Agent Directory.";

const readDeleteError = async (response: Response) => {
  const payload = (await response.json().catch(() => ({}))) as { error?: unknown };
  return typeof payload.error === "string" && payload.error.trim().length > 0
    ? payload.error
    : `Unable to release the terminal (${response.status}).`;
};

const AgentInbox = ({ agent, onClose }: { agent: AgentRosterEntry; onClose: () => void }) => {
  const [messages, setMessages] = useState<AgentInboxMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const loadMessages = useCallback(async (agentId: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(buildAgentInboxUrl(agentId), {
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json().catch(() => ({}))) as {
        messages?: unknown;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(toErrorMessage(payload));
      }
      setMessages(Array.isArray(payload.messages) ? (payload.messages as AgentInboxMessage[]) : []);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load this role inbox.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMessages(agent.id);
  }, [agent.id, loadMessages]);

  const sendMessage = async () => {
    const content = draft.trim();
    if (!content) return;
    setIsSending(true);
    try {
      const response = await fetch(buildAgentInboxUrl(agent.id), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ content }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(toErrorMessage(payload));
      }
      setDraft("");
      await loadMessages(agent.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to queue the message.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section className="settings-agent-inbox" aria-label={`${agent.title} inbox`}>
      <header>
        <div>
          <strong>Role inbox</strong>
          <p>
            Messages are delivered only to a terminal explicitly bound to this role. No model is
            launched by sending a message.
          </p>
        </div>
        <ActionButton onClick={onClose} size="dense" type="button" variant="info">
          Close
        </ActionButton>
      </header>
      {errorMessage ? <p className="settings-agentic-os-error">{errorMessage}</p> : null}
      <ol>
        {messages.length === 0 ? (
          <li>No role messages yet.</li>
        ) : (
          messages.map((message) => (
            <li key={message.messageId}>
              <span>{message.content}</span>
              <small>
                {message.from === "agent"
                  ? `From ${message.fromAgentId ?? "an agent"}. `
                  : "From operator. "}
                {message.delivered
                  ? `Delivered to ${message.deliveredToTerminalId ?? "role terminal"}`
                  : "Queued until this role's terminal is running"}
              </small>
            </li>
          ))
        )}
      </ol>
      <textarea
        aria-label={`Message ${agent.title}`}
        disabled={isSending}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            void sendMessage();
          }
        }}
        placeholder={`Message ${agent.title}...`}
        rows={3}
        value={draft}
      />
      <ActionButton
        disabled={draft.trim().length === 0 || isSending || isLoading}
        onClick={() => {
          void sendMessage();
        }}
        size="dense"
        type="button"
        variant="accent"
      >
        {isSending ? "Queueing..." : "Queue message"}
      </ActionButton>
    </section>
  );
};

const RoleTerminalReleaseDialog = ({
  agent,
  onCancel,
  onReleased,
}: {
  agent: AgentRosterEntry;
  onCancel: () => void;
  onReleased: (terminalIds: string[]) => void;
}) => {
  const [isReleasing, setIsReleasing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const terminalDescription =
    agent.state === "prepared" ? "prepared" : agent.state === "ready" ? "idle" : "inactive";

  const release = async () => {
    setIsReleasing(true);
    setErrorMessage(null);
    const releasedTerminalIds: string[] = [];

    for (const terminalId of agent.terminalIds) {
      try {
        const response = await fetch(buildTerminalItemUrl(terminalId), {
          method: "DELETE",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          throw new Error(await readDeleteError(response));
        }
        releasedTerminalIds.push(terminalId);
      } catch (error) {
        onReleased(releasedTerminalIds);
        setErrorMessage(error instanceof Error ? error.message : "Unable to release the terminal.");
        setIsReleasing(false);
        return;
      }
    }

    onReleased(releasedTerminalIds);
    onCancel();
  };

  return (
    <ConfirmationDialog
      ariaLabel={`Release ${agent.title} terminal`}
      confirmLabel={isReleasing ? "Releasing..." : `Release ${agent.terminalIds.length}`}
      isBusy={isReleasing}
      isConfirmDisabled={agent.terminalIds.length === 0}
      message={
        <>
          Release {agent.terminalIds.length} {terminalDescription} terminal
          {agent.terminalIds.length === 1 ? "" : "s"} for <strong>{agent.title}</strong>. The
          permanent role, role inbox, activity history, and project memory stay intact.
        </>
      }
      onCancel={onCancel}
      onConfirm={() => {
        void release();
      }}
      title="Release role terminal"
      warning="This removes the terminal record. For a worktree role, its isolated worktree may also be removed. Only release a role when it has no unfinished work."
    >
      {errorMessage ? <p className="settings-agentic-os-error">{errorMessage}</p> : null}
    </ConfirmationDialog>
  );
};

export const AgentDirectoryPanel = () => {
  const [agents, setAgents] = useState<AgentRosterEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [openInboxAgentId, setOpenInboxAgentId] = useState<string | null>(null);
  const [registeringAgentId, setRegisteringAgentId] = useState<string | null>(null);
  const [startingAgentId, setStartingAgentId] = useState<string | null>(null);
  const [releasingAgentId, setReleasingAgentId] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;

    const loadAgents = async () => {
      try {
        const response = await fetch(buildAgentRosterUrl(), {
          headers: { Accept: "application/json" },
        });
        const payload = (await response.json().catch(() => ({}))) as {
          agents?: unknown;
          error?: string;
        };
        if (!response.ok) {
          throw new Error(toErrorMessage(payload));
        }
        if (isCurrent) {
          setAgents(Array.isArray(payload.agents) ? (payload.agents as AgentRosterEntry[]) : []);
          setErrorMessage(null);
        }
      } catch (error) {
        if (isCurrent) {
          setErrorMessage(
            error instanceof Error ? error.message : "Unable to load the Agent Directory.",
          );
        }
      }
    };

    void loadAgents();
    const refreshTimer = window.setInterval(() => {
      void loadAgents();
    }, 5_000);
    return () => {
      isCurrent = false;
      window.clearInterval(refreshTimer);
    };
  }, []);

  const registerRoleTerminal = async (agent: AgentRosterEntry) => {
    setRegisteringAgentId(agent.id);
    try {
      const response = await fetch(buildTerminalsUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          agentId: agent.id,
          tentacleId: agent.tentacleId,
          name: agent.title,
          workspaceMode: agent.executionScope?.workspaceMode ?? "shared",
          agentProvider: agent.preferredProvider,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(toErrorMessage(payload));
      }
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to register this role terminal.",
      );
    } finally {
      setRegisteringAgentId(null);
    }
  };

  const startPreparedRoleTerminal = async (agent: AgentRosterEntry) => {
    const terminalId = agent.terminalIds[0];
    if (!terminalId) return;

    setStartingAgentId(agent.id);
    try {
      const response = await fetch(buildTerminalStartUrl(terminalId), {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(toErrorMessage(payload));
      }
      setAgents((current) =>
        current.map((entry) =>
          entry.id === agent.id
            ? {
                ...entry,
                state: "ready",
                currentActivity: "Ready to receive a scoped task. Provider connection unverified.",
                providerConnection: "shell_started_unverified",
              }
            : entry,
        ),
      );
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to start this role terminal.",
      );
    } finally {
      setStartingAgentId(null);
    }
  };

  return (
    <section
      className="settings-panel settings-panel--agent-directory"
      aria-label="Agent Directory"
    >
      <header className="settings-panel-header settings-agent-directory-header">
        <div>
          <h2>Agent Directory</h2>
          <p>
            Permanent roles stay visible here. Temporary terminals only change a role's live status;
            they do not create a new team role.
          </p>
        </div>
        <span className="settings-agent-directory-count">{agents.length} roles</span>
      </header>

      {errorMessage && <p className="settings-agentic-os-error">{errorMessage}</p>}

      <div className="settings-agent-directory-grid">
        {agents.map((agent) => (
          <article
            className="settings-agent-directory-card"
            data-state={agent.state}
            key={agent.id}
          >
            <div className="settings-agent-directory-topline">
              <div>
                <span className="settings-agent-directory-title">{agent.title}</span>
                <span className="settings-agent-directory-role">{agent.role}</span>
                {agent.operatingModel && (
                  <span className="settings-agent-directory-model">{agent.operatingModel}</span>
                )}
              </div>
              <span className="settings-agent-directory-state">{STATE_LABELS[agent.state]}</span>
            </div>
            <p>{agent.purpose}</p>
            <dl className="settings-agent-directory-details">
              <div>
                <dt>Why launch</dt>
                <dd>{agent.spawnReason}</dd>
              </div>
              <div>
                <dt>Current status</dt>
                <dd>{agent.currentActivity}</dd>
              </div>
              <div>
                <dt>Memory</dt>
                <dd>
                  Uses shared project memory. Verified updates are mirrored to the Record Center and
                  Obsidian.
                </dd>
              </div>
              <div>
                <dt>Provider</dt>
                <dd>{PROVIDER_CONNECTION_LABELS[agent.providerConnection]}</dd>
              </div>
            </dl>
            {agent.state === "not_launched" && agent.terminalIds.length === 0 ? (
              <ActionButton
                disabled={registeringAgentId !== null}
                onClick={() => {
                  void registerRoleTerminal(agent);
                }}
                size="dense"
                type="button"
                variant="info"
              >
                {registeringAgentId === agent.id ? "Registering..." : "Register role terminal"}
              </ActionButton>
            ) : null}
            {agent.state === "prepared" && agent.terminalIds.length === 1 ? (
              <ActionButton
                disabled={startingAgentId !== null}
                onClick={() => {
                  void startPreparedRoleTerminal(agent);
                }}
                size="dense"
                type="button"
                variant="accent"
              >
                {startingAgentId === agent.id ? "Starting..." : "Start role terminal"}
              </ActionButton>
            ) : null}
            {(agent.state === "ready" ||
              agent.state === "prepared" ||
              agent.state === "not_launched") &&
            agent.terminalIds.length > 0 ? (
              <ActionButton
                onClick={() => {
                  setReleasingAgentId(agent.id);
                }}
                size="dense"
                type="button"
                variant="danger"
              >
                Release{" "}
                {agent.state === "prepared"
                  ? "prepared"
                  : agent.state === "ready"
                    ? "idle"
                    : "inactive"}{" "}
                terminal
                {agent.terminalIds.length === 1 ? "" : "s"}
              </ActionButton>
            ) : null}
            {openInboxAgentId === agent.id ? (
              <AgentInbox
                agent={agent}
                onClose={() => {
                  setOpenInboxAgentId(null);
                }}
              />
            ) : (
              <ActionButton
                onClick={() => {
                  setOpenInboxAgentId(agent.id);
                }}
                size="dense"
                type="button"
                variant="info"
              >
                Message role
              </ActionButton>
            )}
            {releasingAgentId === agent.id ? (
              <RoleTerminalReleaseDialog
                agent={agent}
                onCancel={() => {
                  setReleasingAgentId(null);
                }}
                onReleased={(releasedTerminalIds) => {
                  const released = new Set(releasedTerminalIds);
                  setAgents((current) =>
                    current.map((entry) => {
                      if (entry.id !== agent.id) return entry;
                      const terminalIds = entry.terminalIds.filter(
                        (terminalId) => !released.has(terminalId),
                      );
                      return terminalIds.length > 0
                        ? { ...entry, terminalIds }
                        : {
                            ...entry,
                            state: "not_launched",
                            currentActivity: "No matching terminal is launched yet.",
                            terminalIds,
                          };
                    }),
                  );
                }}
              />
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
};
