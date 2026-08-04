import { useEffect, useState } from "react";

import { formatTimestamp } from "../app/formatTimestamp";
import {
  buildAgentRosterUrl,
  buildSwarmRegistryItemUrl,
  buildSwarmRegistryUrl,
} from "../runtime/runtimeEndpoints";
import { ActionButton } from "./ui/ActionButton";
import { ConfirmationDialog } from "./ui/ConfirmationDialog";

type SwarmState = "working" | "waiting" | "ready" | "prepared" | "not_launched";

type SwarmRegistryEntry = {
  id: string;
  title: string;
  purpose: string;
  isDefault: boolean;
  isRemovable: boolean;
  state: SwarmState;
  roleCount: number;
  workingCount: number;
  waitingCount: number;
  readyCount: number;
  preparedCount: number;
  notLaunchedCount: number;
  activeRoles: Array<{
    id: string;
    title: string;
    state: SwarmState;
    currentActivity: string;
    activityUpdatedAt?: string;
  }>;
};

const STATE_LABELS: Record<SwarmState, string> = {
  working: "Working",
  waiting: "Waiting",
  ready: "Ready",
  prepared: "Prepared",
  not_launched: "Not launched",
};

export const SwarmDirectoryPanel = () => {
  const [swarms, setSwarms] = useState<SwarmRegistryEntry[]>([]);
  const [roles, setRoles] = useState<Array<{ id: string; title: string }>>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [removingSwarm, setRemovingSwarm] = useState<SwarmRegistryEntry | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [newSwarm, setNewSwarm] = useState({
    id: "",
    title: "",
    purpose: "",
    agentIds: [] as string[],
  });

  useEffect(() => {
    void refreshToken;
    let isCurrent = true;
    const loadSwarms = async () => {
      try {
        const response = await fetch(buildSwarmRegistryUrl(), {
          headers: { Accept: "application/json" },
        });
        const payload = (await response.json().catch(() => ({}))) as {
          swarms?: unknown;
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load project swarms.");
        }
        if (isCurrent) {
          setSwarms(Array.isArray(payload.swarms) ? (payload.swarms as SwarmRegistryEntry[]) : []);
          setErrorMessage(null);
        }
      } catch (error) {
        if (isCurrent) {
          setErrorMessage(
            error instanceof Error ? error.message : "Unable to load project swarms.",
          );
        }
      }
    };

    void loadSwarms();
    void fetch(buildAgentRosterUrl(), { headers: { Accept: "application/json" } })
      .then(async (response) => ({
        response,
        payload: (await response.json()) as { agents?: unknown },
      }))
      .then(({ response, payload }) => {
        if (response.ok && Array.isArray(payload.agents) && isCurrent) {
          setRoles(
            payload.agents.filter(
              (agent): agent is { id: string; title: string } =>
                Boolean(agent) &&
                typeof agent === "object" &&
                typeof (agent as { id?: unknown }).id === "string" &&
                typeof (agent as { title?: unknown }).title === "string",
            ),
          );
        }
      })
      .catch(() => undefined);
    const intervalId = window.setInterval(() => {
      void loadSwarms();
    }, 5_000);
    return () => {
      isCurrent = false;
      window.clearInterval(intervalId);
    };
  }, [refreshToken]);

  const toggleRole = (agentId: string) => {
    setNewSwarm((current) => ({
      ...current,
      agentIds: current.agentIds.includes(agentId)
        ? current.agentIds.filter((id) => id !== agentId)
        : [...current.agentIds, agentId],
    }));
  };

  const createSwarm = async () => {
    try {
      const response = await fetch(buildSwarmRegistryUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(newSwarm),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to create project swarm.");
      setNewSwarm({ id: "", title: "", purpose: "", agentIds: [] });
      setRefreshToken((value) => value + 1);
      setErrorMessage(null);
      setNotice("Local project swarm created. No agent was launched.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to create project swarm.");
    }
  };

  const removeSwarm = async () => {
    if (!removingSwarm) return;
    setIsRemoving(true);
    setErrorMessage(null);
    try {
      const response = await fetch(buildSwarmRegistryItemUrl(removingSwarm.id), {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to remove project swarm.");
      setNotice(`${removingSwarm.title} was removed. Permanent roles remain available.`);
      setRemovingSwarm(null);
      setRefreshToken((value) => value + 1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to remove project swarm.");
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <section className="settings-panel settings-panel--swarm-directory" aria-label="Project Swarms">
      <header className="settings-panel-header settings-agent-directory-header">
        <div>
          <h2>Project Swarms</h2>
          <p>
            Main workstreams stay separate while their roles share the same durable project memory
            and approval rules.
          </p>
        </div>
        <span className="settings-agent-directory-count">{swarms.length} swarms</span>
      </header>
      {errorMessage ? <p className="settings-agentic-os-error">{errorMessage}</p> : null}
      {notice ? <p className="settings-agent-directory-notice">{notice}</p> : null}
      <form
        className="settings-swarm-create"
        onSubmit={(event) => {
          event.preventDefault();
          void createSwarm();
        }}
      >
        <h3>Create another project swarm</h3>
        <p>
          Groups existing permanent roles. It records a project lane only; it does not launch
          agents.
        </p>
        <input
          aria-label="New swarm ID"
          placeholder="example: school-project"
          value={newSwarm.id}
          onChange={(event) => setNewSwarm((current) => ({ ...current, id: event.target.value }))}
        />
        <input
          aria-label="New swarm title"
          placeholder="Project name"
          value={newSwarm.title}
          onChange={(event) =>
            setNewSwarm((current) => ({ ...current, title: event.target.value }))
          }
        />
        <textarea
          aria-label="New swarm purpose"
          placeholder="What this project lane is for"
          value={newSwarm.purpose}
          onChange={(event) =>
            setNewSwarm((current) => ({ ...current, purpose: event.target.value }))
          }
        />
        <div className="settings-swarm-role-picker" aria-label="Choose permanent roles">
          {roles.map((role) => (
            <label key={role.id}>
              <input
                checked={newSwarm.agentIds.includes(role.id)}
                onChange={() => toggleRole(role.id)}
                type="checkbox"
              />{" "}
              {role.title}
            </label>
          ))}
        </div>
        <ActionButton
          disabled={
            !newSwarm.id.trim() ||
            !newSwarm.title.trim() ||
            !newSwarm.purpose.trim() ||
            newSwarm.agentIds.length === 0
          }
          type="submit"
        >
          Create local swarm
        </ActionButton>
      </form>
      <div className="settings-swarm-grid">
        {swarms.map((swarm) => (
          <article className="settings-swarm-card" data-state={swarm.state} key={swarm.id}>
            <div className="settings-agent-directory-topline">
              <div>
                <span className="settings-agent-directory-title">{swarm.title}</span>
                <span className="settings-agent-directory-role">
                  {swarm.roleCount} permanent roles
                </span>
              </div>
              <span className="settings-agent-directory-state">{STATE_LABELS[swarm.state]}</span>
            </div>
            <p>{swarm.purpose}</p>
            <div className="settings-swarm-counts">
              <span>{swarm.workingCount} working</span>
              <span>{swarm.waitingCount} waiting</span>
              <span>{swarm.readyCount} ready</span>
              <span>{swarm.preparedCount} prepared</span>
              <span>{swarm.notLaunchedCount} not launched</span>
            </div>
            {swarm.activeRoles.length > 0 ? (
              <ul
                className="settings-swarm-activity-list"
                aria-label={`${swarm.title} live activity`}
              >
                {swarm.activeRoles.map((agent) => (
                  <li key={agent.id}>
                    <span className="settings-swarm-activity-title">{agent.title}</span>
                    <span className="settings-swarm-activity-state">
                      {STATE_LABELS[agent.state]}
                    </span>
                    <span className="settings-swarm-activity-summary">{agent.currentActivity}</span>
                    {agent.activityUpdatedAt ? (
                      <span className="settings-swarm-activity-time">
                        Last report {formatTimestamp(agent.activityUpdatedAt)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="settings-swarm-empty-activity">
                No live roles yet. Start a scoped role terminal when this swarm has work to do.
              </p>
            )}
            {swarm.isDefault ? (
              <p className="settings-swarm-protected">Default swarm: permanent project lane.</p>
            ) : !swarm.isRemovable ? (
              <p className="settings-swarm-protected">
                Release or clean up its active role terminals before removing this custom swarm.
              </p>
            ) : (
              <div className="settings-swarm-actions">
                <span>Custom swarm: safe to remove when its project is finished.</span>
                <ActionButton
                  aria-label={`Remove ${swarm.title}`}
                  onClick={() => setRemovingSwarm(swarm)}
                  size="dense"
                  type="button"
                  variant="danger"
                >
                  Remove custom swarm
                </ActionButton>
              </div>
            )}
          </article>
        ))}
      </div>
      {removingSwarm ? (
        <ConfirmationDialog
          ariaLabel={`Remove ${removingSwarm.title}`}
          confirmLabel={isRemoving ? "Removing..." : "Remove custom swarm"}
          isBusy={isRemoving}
          isConfirmDisabled={isRemoving}
          message={
            <>
              Remove the custom <strong>{removingSwarm.title}</strong> project lane. Its permanent
              roles, terminal records, role inboxes, shared memory, audit history, and default
              project swarms will remain.
            </>
          }
          onCancel={() => {
            if (!isRemoving) setRemovingSwarm(null);
          }}
          onConfirm={() => {
            void removeSwarm();
          }}
          title="Remove custom swarm"
          warning="This removes only this local custom project-lane definition. Create it again later if the project resumes."
        />
      ) : null}
    </section>
  );
};
