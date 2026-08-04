import {
  type AgentManifest,
  type AgentManifestEvaluation,
  type AgentManifestPolicy,
  createDefaultAgentManifest,
  evaluateAgentManifestPolicies,
} from "@octogent/core";

const noApiKeysPolicy: AgentManifestPolicy = {
  id: "server-no-api-keys",
  title: "No API keys by default",
  scope: "server",
  decision: "deny",
  match: {
    actionTypes: ["command", "tool", "workflow", "prompt"],
    keywords: ["api key", "api keys", "bearer token", "openai_api_key", "anthropic_api_key"],
  },
  rationale:
    "The operator chose subscription, connector, browser, and local-runtime workflows before API-key workflows.",
};

const externalSideEffectPolicy: AgentManifestPolicy = {
  id: "session-ask-external-side-effects",
  title: "Ask before external side effects",
  scope: "session",
  decision: "requires_approval",
  match: {
    actionTypes: ["command", "tool", "workflow"],
    keywords: ["send", "publish", "deploy", "purchase", "delete", "merge"],
  },
  rationale: "Externally visible or hard-to-reverse actions require operator approval.",
};

const financialActionPolicy: AgentManifestPolicy = {
  id: "server-ask-financial-actions",
  title: "Ask before financial actions",
  scope: "server",
  decision: "requires_approval",
  match: {
    actionTypes: ["command", "tool", "workflow", "prompt"],
    keywords: [
      "purchase",
      "payment",
      "pay ",
      "transfer funds",
      "invoice",
      "refund",
      "subscription",
      "paid ad",
      "advertising spend",
      "budget approval",
    ],
  },
  rationale:
    "Agents may prepare financial analysis, but spending, commitments, invoices, refunds, and payment actions require operator approval.",
};

const personalDataPolicy: AgentManifestPolicy = {
  id: "server-ask-personal-data-actions",
  title: "Ask before personal-data actions",
  scope: "server",
  decision: "requires_approval",
  match: {
    actionTypes: ["command", "tool", "workflow", "prompt"],
    keywords: [
      "personal data",
      "personally identifiable",
      "pii",
      "customer data",
      "user data",
      "export contacts",
      "upload contacts",
      "share email addresses",
      "collect email addresses",
      "collect phone numbers",
    ],
  },
  rationale:
    "Personal-data collection, sharing, export, and processing require an explicit operator decision about purpose, consent, and scope.",
};

const codeWritePolicy: AgentManifestPolicy = {
  id: "agent-code-write-scope",
  title: "Keep code writes scoped",
  scope: "agent",
  decision: "requires_approval",
  match: {
    actionTypes: ["write", "command", "tool"],
    keywords: ["shared main", "git push", "git commit", "outside scope"],
  },
  rationale: "Coding agents should stay inside their assigned tentacle/worktree scope.",
};

const sharedPolicies = [
  noApiKeysPolicy,
  externalSideEffectPolicy,
  financialActionPolicy,
  personalDataPolicy,
];

const codingPolicies = [...sharedPolicies, codeWritePolicy];

export const DEFAULT_AGENT_MANIFESTS: AgentManifest[] = [
  createDefaultAgentManifest({
    agentId: "ceo-command",
    displayName: "CEO Command",
    description:
      "Sets strategy, priority order, and escalation decisions for the Game Business swarm.",
    role: "coordinator",
    provider: "claude-code",
    tentacleIds: ["ceo-command"],
    allowedPaths: [".octogent/tentacles/ceo-command", "docs", "prompts"],
    allowedTools: ["channel-messaging", "deck", "memory", "decision-log"],
    policies: sharedPolicies,
  }),
  createDefaultAgentManifest({
    agentId: "chief-of-staff",
    displayName: "Chief of Staff",
    description: "Maintains briefs, decisions, follow-ups, and clear handoffs for the operator.",
    role: "coordinator",
    provider: "claude-code",
    tentacleIds: ["chief-of-staff"],
    allowedPaths: [".octogent/tentacles/chief-of-staff", "docs"],
    allowedTools: ["channel-messaging", "deck", "memory", "briefs"],
    policies: sharedPolicies,
  }),
  createDefaultAgentManifest({
    agentId: "execution-ops",
    displayName: "Execution Ops",
    description:
      "Coordinates progress checks, blockers, and quality-ready handoffs across active work.",
    role: "operator",
    provider: "claude-code",
    tentacleIds: ["execution-ops"],
    allowedPaths: [".octogent/tentacles/execution-ops", "docs"],
    allowedTools: ["channel-messaging", "deck", "memory", "status-review"],
    policies: sharedPolicies,
  }),
  createDefaultAgentManifest({
    agentId: "codex-executor",
    displayName: "Codex Executor",
    description: "Executes scoped implementation, tests, debugging, and repository changes.",
    role: "executor",
    provider: "codex",
    workspaceMode: "worktree",
    tentacleIds: ["game-business"],
    allowedPaths: ["workspace", ".octogent/worktrees"],
    allowedTools: ["terminal", "filesystem", "tests", "git-status"],
    policies: codingPolicies,
  }),
  createDefaultAgentManifest({
    agentId: "debugging-council",
    displayName: "Debugging Council",
    description: "Investigates failures, scopes fixes, verifies regressions, and records lessons.",
    role: "executor",
    provider: "codex",
    workspaceMode: "worktree",
    tentacleIds: ["game-business"],
    allowedPaths: ["workspace", ".octogent/worktrees", "apps", "packages"],
    allowedTools: ["terminal", "filesystem", "tests", "git-status", "failure-analysis"],
    policies: codingPolicies,
  }),
  createDefaultAgentManifest({
    agentId: "marketing-council",
    displayName: "Marketing Council",
    description: "Prepares ethical audience learning, campaign drafts, and content hypotheses.",
    role: "researcher",
    provider: "claude-code",
    tentacleIds: ["marketing-growth"],
    allowedPaths: [".octogent/tentacles/marketing-growth", "docs"],
    allowedTools: ["research-notes", "campaign-drafts", "memory"],
    policies: sharedPolicies,
  }),
  createDefaultAgentManifest({
    agentId: "service-council",
    displayName: "Service Council",
    description:
      "Reviews consented player feedback and turns it into privacy-aware service improvements.",
    role: "operator",
    provider: "claude-code",
    tentacleIds: ["game-business"],
    allowedPaths: [".octogent/tentacles/game-business", "docs"],
    allowedTools: ["feedback-themes", "response-drafts", "memory"],
    policies: sharedPolicies,
  }),
  createDefaultAgentManifest({
    agentId: "automation-council",
    displayName: "Automation Council",
    description: "Designs and verifies small local workflows with approval-gated external effects.",
    role: "executor",
    provider: "codex",
    tentacleIds: ["game-business"],
    allowedPaths: ["workspace", ".octogent/tentacles/game-business", "scripts"],
    allowedTools: ["terminal", "filesystem", "tests", "workflow-registry"],
    policies: codingPolicies,
  }),
  createDefaultAgentManifest({
    agentId: "finance-accounting",
    displayName: "Finance and Accounting",
    description:
      "Prepares cost scenarios and records assumptions without spending or committing funds.",
    role: "operator",
    provider: "claude-code",
    tentacleIds: ["monetization"],
    allowedPaths: [".octogent/tentacles/monetization", "docs"],
    allowedTools: ["scenario-analysis", "decision-log", "memory"],
    policies: sharedPolicies,
  }),
  createDefaultAgentManifest({
    agentId: "market-analysis",
    displayName: "Market Analysis",
    description: "Finds current cited evidence, competitors, and market signals for decisions.",
    role: "researcher",
    provider: "perplexity",
    tentacleIds: ["market-research"],
    allowedPaths: [".octogent/tentacles/market-research", "docs/research"],
    allowedTools: ["live-research", "citations", "research-notes", "memory"],
    policies: sharedPolicies,
  }),
  createDefaultAgentManifest({
    agentId: "research-triad",
    displayName: "Research Triad",
    description: "Combines Google-grounded research, source review, and reusable project briefs.",
    role: "researcher",
    provider: "gemini-cli",
    tentacleIds: ["research"],
    allowedPaths: [".octogent/tentacles/research", "docs/research"],
    allowedTools: ["research-notes", "google-family", "memory"],
    policies: sharedPolicies,
  }),
  createDefaultAgentManifest({
    agentId: "record-center",
    displayName: "Record Center",
    description: "Captures verified decisions, research summaries, tests, and durable context.",
    role: "memory",
    provider: "notion",
    tentacleIds: ["game-business"],
    allowedPaths: [".octogent/tentacles/game-business", "docs"],
    allowedTools: ["notion-capture", "memory", "tasks"],
    policies: sharedPolicies,
  }),
  createDefaultAgentManifest({
    agentId: "stitch-ui-production",
    displayName: "Stitch UI Production",
    description: "Produces UI/UX concepts and screen direction for implementation handoff.",
    role: "designer",
    provider: "stitch",
    tentacleIds: ["product-development"],
    allowedPaths: ["docs", "apps/web/public/prototypes"],
    allowedTools: ["ui-brief", "design-export", "prototype-notes"],
    policies: sharedPolicies,
  }),
];

export const listAgentManifests = (): AgentManifest[] => DEFAULT_AGENT_MANIFESTS;

export const findAgentManifest = (agentId: string): AgentManifest | null =>
  DEFAULT_AGENT_MANIFESTS.find((manifest) => manifest.agentId === agentId) ?? null;

export const evaluateAgentManifest = ({
  agentId,
  actionType,
  content,
}: {
  agentId: string;
  actionType: string;
  content: string;
}): (AgentManifestEvaluation & { agentId: string }) | null => {
  const manifest = findAgentManifest(agentId);
  if (!manifest) {
    return null;
  }

  return {
    agentId,
    ...evaluateAgentManifestPolicies({ manifest, actionType, content }),
  };
};
