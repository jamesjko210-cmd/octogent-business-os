import type { TerminalAgentProvider } from "./agentRuntime";
import type { RuntimePolicyDecision } from "./runtimePolicy";
import type { TentacleWorkspaceMode } from "./terminal";

export type AgentManifestAuthMode =
  | "subscription-cli"
  | "connector"
  | "local-runtime"
  | "manual"
  | "api-key"
  | "gateway";

export type AgentManifestHarness =
  | "codex"
  | "claude-code"
  | "gemini-cli"
  | "perplexity"
  | "notebooklm"
  | "lm-studio"
  | "notion"
  | "stitch"
  | "antigravity"
  | "custom";

export type AgentManifestToolAccess = "read" | "write" | "external" | "terminal";

export type AgentManifestPolicyScope = "session" | "agent" | "server";

export type AgentManifestPolicy = {
  id: string;
  title: string;
  scope: AgentManifestPolicyScope;
  decision: RuntimePolicyDecision;
  match: {
    actionTypes: string[];
    keywords: string[];
  };
  rationale: string;
};

export type AgentManifestTool = {
  id: string;
  type: AgentManifestToolAccess;
  description: string;
  requiresApproval?: boolean;
};

export type AgentManifestSubagent = {
  id: string;
  title: string;
  purpose: "implement" | "review" | "research" | "operate" | "custom";
  preferredProvider: TerminalAgentProvider;
  maxSessions?: number;
};

export type AgentManifest = {
  specVersion: 1;
  agentId: string;
  displayName: string;
  description: string;
  role: "coordinator" | "executor" | "researcher" | "designer" | "operator" | "memory" | "custom";
  provider: TerminalAgentProvider;
  executor: {
    harness: AgentManifestHarness;
    authMode: AgentManifestAuthMode;
    model?: string;
    apiKeyAllowed: boolean;
  };
  scope: {
    workspaceMode: TentacleWorkspaceMode;
    tentacleIds: string[];
    allowedPaths: string[];
    allowedTools: string[];
  };
  tools: AgentManifestTool[];
  subagents: AgentManifestSubagent[];
  policies: AgentManifestPolicy[];
  memory: {
    read: boolean;
    write: boolean;
    tags: string[];
  };
};

export type AgentManifestEvaluation = {
  decision: RuntimePolicyDecision;
  matchedPolicies: AgentManifestPolicy[];
  rationale: string;
};

const decisionRank: Record<RuntimePolicyDecision, number> = {
  allow: 0,
  requires_approval: 1,
  deny: 2,
};

const scopeRank: Record<AgentManifestPolicyScope, number> = {
  session: 0,
  agent: 1,
  server: 2,
};

const normalize = (value: string) => value.toLowerCase();

const policyMatches = ({
  policy,
  actionType,
  content,
}: {
  policy: AgentManifestPolicy;
  actionType: string;
  content: string;
}) => {
  const normalizedActionType = normalize(actionType);
  const normalizedContent = normalize(content);
  const actionMatches =
    policy.match.actionTypes.length === 0 ||
    policy.match.actionTypes.some((type) => normalize(type) === normalizedActionType);
  const keywordMatches =
    policy.match.keywords.length === 0 ||
    policy.match.keywords.some((keyword) => normalizedContent.includes(normalize(keyword)));
  return actionMatches && keywordMatches;
};

export const evaluateAgentManifestPolicies = ({
  manifest,
  actionType,
  content,
}: {
  manifest: AgentManifest;
  actionType: string;
  content: string;
}): AgentManifestEvaluation => {
  const matchedPolicies = manifest.policies
    .filter((policy) => policyMatches({ policy, actionType, content }))
    .sort((left, right) => scopeRank[left.scope] - scopeRank[right.scope]);
  const decision = matchedPolicies.reduce<RuntimePolicyDecision>(
    (current, policy) =>
      decisionRank[policy.decision] > decisionRank[current] ? policy.decision : current,
    "allow",
  );
  const rationale =
    matchedPolicies.length > 0
      ? matchedPolicies.map((policy) => `${policy.scope}: ${policy.rationale}`).join(" ")
      : "No manifest policy matched.";

  return {
    decision,
    matchedPolicies,
    rationale,
  };
};

export const createDefaultAgentManifest = ({
  agentId,
  displayName,
  description,
  role,
  provider,
  workspaceMode = "shared",
  tentacleIds = [],
  allowedPaths = [],
  allowedTools = [],
  policies = [],
}: {
  agentId: string;
  displayName: string;
  description: string;
  role: AgentManifest["role"];
  provider: TerminalAgentProvider;
  workspaceMode?: TentacleWorkspaceMode;
  tentacleIds?: string[];
  allowedPaths?: string[];
  allowedTools?: string[];
  policies?: AgentManifestPolicy[];
}): AgentManifest => ({
  specVersion: 1,
  agentId,
  displayName,
  description,
  role,
  provider,
  executor: {
    harness: provider,
    authMode:
      provider === "codex" || provider === "claude-code" || provider === "gemini-cli"
        ? "subscription-cli"
        : provider === "lm-studio"
          ? "local-runtime"
          : provider === "notion" || provider === "stitch"
            ? "connector"
            : "manual",
    apiKeyAllowed: false,
  },
  scope: {
    workspaceMode,
    tentacleIds,
    allowedPaths,
    allowedTools,
  },
  tools: allowedTools.map((tool) => ({
    id: tool,
    type: tool.includes("terminal") || tool.includes("shell") ? "terminal" : "read",
    description: `Scoped access to ${tool}.`,
  })),
  subagents: [],
  policies,
  memory: {
    read: true,
    write: role === "coordinator" || role === "memory" || role === "researcher",
    tags: [agentId, role, provider],
  },
});
