import type { RuntimePolicy, RuntimePolicyDecision, RuntimePolicyEvaluation } from "@octogent/core";

const decisionRank: Record<RuntimePolicyDecision, number> = {
  allow: 0,
  requires_approval: 1,
  deny: 2,
};

export const RUNTIME_POLICIES: RuntimePolicy[] = [
  {
    id: "deny-destructive-operations",
    title: "Deny destructive operations",
    decision: "deny",
    match: {
      actionTypes: ["command", "tool", "workflow"],
      keywords: [
        "git reset --hard",
        "git checkout --",
        "rm -rf",
        "drop database",
        "truncate table",
        "format disk",
        "destroy environment",
      ],
    },
    rationale:
      "Destructive repository, filesystem, database, or environment operations must not run autonomously.",
  },
  {
    id: "deny-api-key-workflows",
    title: "Deny API key workflows by default",
    decision: "deny",
    match: {
      actionTypes: ["command", "tool", "workflow", "prompt"],
      keywords: [
        "api key",
        "api keys",
        "apikey",
        "secret key",
        "bearer token",
        "openai_api_key",
        "anthropic_api_key",
        "google_api_key",
        "perplexity_api_key",
        "export openai",
        "export anthropic",
        "export google",
      ],
    },
    rationale:
      "The operator chose a no-API-keys workflow. Use logged-in apps, local CLIs, browser workflows, connectors, or LM Studio unless the operator explicitly overrides this policy.",
  },
  {
    id: "deny-secret-exfiltration",
    title: "Deny secret exposure and exfiltration",
    decision: "deny",
    match: {
      actionTypes: ["command", "tool", "workflow", "prompt"],
      keywords: [
        "cat .env",
        "printenv",
        "upload .env",
        "commit .env",
        "git add .env",
        "expose secret",
        "log secret",
        "return secret",
        "private key",
        "ssh key",
      ],
    },
    rationale:
      "Agents must not reveal, upload, commit, or otherwise expose local secrets or private keys. Use a reviewed secret manager only when a future production integration explicitly requires it.",
  },
  {
    id: "approval-external-side-effects",
    title: "Require approval for external side effects",
    decision: "requires_approval",
    match: {
      actionTypes: ["command", "tool", "workflow"],
      keywords: ["send email", "publish", "deploy", "purchase", "delete", "merge pull request"],
    },
    rationale: "Externally visible or hard-to-reverse actions need a human checkpoint.",
  },
  {
    id: "approval-financial-actions",
    title: "Require approval for financial actions",
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
      "Agents may analyze costs and draft recommendations, but spending, commitments, invoices, refunds, and payment actions require operator approval.",
  },
  {
    id: "approval-personal-data-actions",
    title: "Require approval for personal-data actions",
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
      "Personal-data collection, sharing, export, and processing need an explicit human decision about purpose, consent, and scope.",
  },
  {
    id: "approval-production-app-surface",
    title: "Require approval for production app integrations",
    decision: "requires_approval",
    match: {
      actionTypes: ["command", "tool", "workflow"],
      keywords: [
        "connect production database",
        "enable public file upload",
        "enable public comments",
        "create webhook endpoint",
        "configure payment webhook",
        "configure production authentication",
        "publish production website",
      ],
    },
    rationale:
      "Public app surfaces and production integrations must pass a focused security review and receive operator approval before activation.",
  },
  {
    id: "approval-shared-main-commit",
    title: "Require approval before shared main commits",
    decision: "requires_approval",
    match: {
      actionTypes: ["command"],
      keywords: ["git commit", "git push"],
    },
    rationale: "Shared-branch commits and pushes should happen after review and approval.",
  },
  {
    id: "allow-local-read-verify",
    title: "Allow local read and verification",
    decision: "allow",
    match: {
      actionTypes: ["read", "test", "search", "memory"],
      keywords: [],
    },
    rationale:
      "Local inspection, testing, search, and memory retrieval are safe autonomous actions.",
  },
];

const normalize = (value: string) => value.toLowerCase();

const policyMatches = ({
  policy,
  actionType,
  content,
}: {
  policy: RuntimePolicy;
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

export const listRuntimePolicies = () => RUNTIME_POLICIES;

export const evaluateRuntimePolicy = ({
  actionType,
  content,
}: {
  actionType: string;
  content: string;
}): RuntimePolicyEvaluation => {
  const matchedPolicies = RUNTIME_POLICIES.filter((policy) =>
    policyMatches({ policy, actionType, content }),
  );
  const decision = matchedPolicies.reduce<RuntimePolicyDecision>(
    (current, policy) =>
      decisionRank[policy.decision] > decisionRank[current] ? policy.decision : current,
    "allow",
  );
  const rationale =
    matchedPolicies.length > 0
      ? matchedPolicies.map((policy) => policy.rationale).join(" ")
      : "No restrictive policy matched.";

  return {
    decision,
    matchedPolicies,
    rationale,
  };
};

export const renderRuntimePolicySection = () =>
  [
    "## Runtime Policy Layer",
    "",
    "Before risky actions, evaluate the action against Octogent runtime policy. Treat policy as stronger than prompt preference.",
    "",
    ...RUNTIME_POLICIES.map(
      (policy) => `- ${policy.title}: ${policy.decision}. ${policy.rationale}`,
    ),
  ].join("\n");
