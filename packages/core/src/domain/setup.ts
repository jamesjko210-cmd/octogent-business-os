export type WorkspaceSetupStepId =
  | "initialize-workspace"
  | "ensure-gitignore"
  | "check-claude"
  | "check-git"
  | "check-curl"
  | "check-numbat"
  | "create-tentacles";

export type WorkspaceSetupStep = {
  id: WorkspaceSetupStepId;
  title: string;
  description: string;
  complete: boolean;
  required: boolean;
  actionLabel: string | null;
  statusText: string;
  guidance: string | null;
  command: string | null;
};

export type AgenticOsBrainId =
  | "claude"
  | "notion"
  | "gemini"
  | "codex"
  | "stitch"
  | "perplexity"
  | "notebooklm"
  | "qwen";

export type AgenticOsBrainStatus = "authenticated_local" | "available_local" | "needs_setup";

export type AgenticOsBrain = {
  id: AgenticOsBrainId;
  label: string;
  role: string;
  status: AgenticOsBrainStatus;
  command: string;
  guidance: string;
  workflowUrl: string;
};

export type WorkspaceSetupSnapshot = {
  isFirstRun: boolean;
  shouldShowSetupCard: boolean;
  hasAnyTentacles: boolean;
  tentacleCount: number;
  steps: WorkspaceSetupStep[];
  agenticOs: {
    brains: AgenticOsBrain[];
  };
};
