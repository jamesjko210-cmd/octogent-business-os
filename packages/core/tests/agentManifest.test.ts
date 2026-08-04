import { describe, expect, it } from "vitest";

import {
  type AgentManifestPolicy,
  createDefaultAgentManifest,
  evaluateAgentManifestPolicies,
} from "../src";

const sessionApprovalPolicy: AgentManifestPolicy = {
  id: "ask-before-send",
  title: "Ask before sending",
  scope: "session",
  decision: "requires_approval",
  match: {
    actionTypes: ["tool"],
    keywords: ["send"],
  },
  rationale: "Sending needs approval.",
};

const serverDenyPolicy: AgentManifestPolicy = {
  id: "deny-api-key",
  title: "Deny API keys",
  scope: "server",
  decision: "deny",
  match: {
    actionTypes: ["tool", "prompt"],
    keywords: ["api key"],
  },
  rationale: "API keys are disabled.",
};

describe("agent manifests", () => {
  it("creates subscription-first no-key defaults for CLI coding agents", () => {
    const manifest = createDefaultAgentManifest({
      agentId: "codex-executor",
      displayName: "Codex Executor",
      description: "Executes implementation tasks.",
      role: "executor",
      provider: "codex",
    });

    expect(manifest.executor).toMatchObject({
      harness: "codex",
      authMode: "subscription-cli",
      apiKeyAllowed: false,
    });
    expect(manifest.memory.write).toBe(false);
  });

  it("evaluates policies with deny stronger than approval", () => {
    const manifest = createDefaultAgentManifest({
      agentId: "researcher",
      displayName: "Researcher",
      description: "Researches with guardrails.",
      role: "researcher",
      provider: "perplexity",
      policies: [sessionApprovalPolicy, serverDenyPolicy],
    });

    const evaluation = evaluateAgentManifestPolicies({
      manifest,
      actionType: "tool",
      content: "send a request using this API key",
    });

    expect(evaluation.decision).toBe("deny");
    expect(evaluation.matchedPolicies.map((policy) => policy.id)).toEqual([
      "ask-before-send",
      "deny-api-key",
    ]);
  });

  it("allows unmatched actions", () => {
    const manifest = createDefaultAgentManifest({
      agentId: "notion-record-center",
      displayName: "Notion Record Center",
      description: "Records durable context.",
      role: "memory",
      provider: "notion",
      policies: [serverDenyPolicy],
    });

    const evaluation = evaluateAgentManifestPolicies({
      manifest,
      actionType: "read",
      content: "summarize current project notes",
    });

    expect(evaluation.decision).toBe("allow");
    expect(evaluation.matchedPolicies).toEqual([]);
    expect(manifest.memory.write).toBe(true);
  });
});
