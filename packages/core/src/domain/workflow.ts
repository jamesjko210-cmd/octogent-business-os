import type { RuntimePolicyDecision } from "./runtimePolicy";

export type WorkflowAutomationLevel = "human_led" | "human_assisted" | "autonomous";
export type WorkflowStatus = "draft" | "active" | "paused" | "archived";
export type WorkflowRunStatus =
  | "queued"
  | "running"
  | "awaiting_approval"
  | "blocked"
  | "succeeded"
  | "failed"
  | "denied"
  | "cancelled";

export type Workflow = {
  id: string;
  title: string;
  description: string;
  status: WorkflowStatus;
  automationLevel: WorkflowAutomationLevel;
  ownerAgentId: string;
  tentacleId?: string;
  goalId?: string;
  actionType: string;
  actionContent: string;
  sop: string[];
  successCriteria: string[];
  allowedTools: string[];
  createdAt: string;
  updatedAt: string;
};

export type WorkflowPolicyCheck = {
  decision: RuntimePolicyDecision;
  rationale: string;
  matchedGlobalPolicyIds: string[];
  matchedAgentPolicyIds: string[];
};

export type WorkflowRunEvidence = {
  kind: "test" | "tool" | "note";
  summary: string;
  occurredAt: string;
};

export type WorkflowRunOutcome = {
  status: "succeeded" | "blocked" | "failed";
  summary: string;
  completedAt: string;
  evidence: WorkflowRunEvidence[];
};

export type WorkflowRun = {
  id: string;
  workflowId: string;
  goalId?: string;
  status: WorkflowRunStatus;
  initiatedBy: "operator" | "agent" | "scheduler";
  policy: WorkflowPolicyCheck;
  summary: string;
  createdAt: string;
  updatedAt: string;
  approval?: {
    decision: "approved" | "rejected";
    decidedBy: "operator";
    note: string;
    decidedAt: string;
  };
  execution?: {
    terminalId: string;
    agentId: string;
    claimedAt: string;
    claimedBy: "runtime-worker";
  };
  outcome?: WorkflowRunOutcome;
};

export type WorkflowSnapshot = {
  workflows: Workflow[];
  runs: WorkflowRun[];
};
