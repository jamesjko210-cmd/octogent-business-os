import type { AgentRuntimeState, TerminalAgentProvider } from "./agentRuntime";

export type AgentState = "live" | "idle" | "queued" | "blocked" | "stopped" | "exited" | "stale";
export type TerminalLifecycleState = "registered" | "running" | "stopped" | "exited" | "stale";
export type TentacleWorkspaceMode = "shared" | "worktree";

export type AgentIdentity = {
  algorithm: "ed25519";
  createdAt: string;
};

export type TerminalAccessScope = {
  workspaceMode: TentacleWorkspaceMode;
  tentacleId: string;
  worktreeId?: string;
  allowedPaths: string[];
  allowedTools: string[];
};

export type TerminalSnapshot = {
  terminalId: string;
  agentId?: string;
  label: string;
  state: AgentState;
  tentacleId: string;
  tentacleName?: string;
  workspaceMode?: TentacleWorkspaceMode;
  agentProvider?: TerminalAgentProvider;
  createdAt: string;
  hasUserPrompt?: boolean;
  parentTerminalId?: string;
  agentRuntimeState?: AgentRuntimeState;
  lifecycleState?: TerminalLifecycleState;
  lifecycleReason?: string;
  lifecycleUpdatedAt?: string;
  processId?: number;
  startedAt?: string;
  endedAt?: string;
  exitCode?: number;
  exitSignal?: number | string;
  agentIdentity?: AgentIdentity;
  accessScope?: TerminalAccessScope;
};
