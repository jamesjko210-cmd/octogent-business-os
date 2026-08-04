import { describe, expect, it } from "vitest";

import { evaluateAgentManifest, listAgentManifests } from "../src/agentManifests";
import { listAgentRoster } from "../src/agentRoster";

describe("agent manifests", () => {
  it("gives every permanent Agent Directory role a matching scoped manifest", () => {
    const manifests = listAgentManifests();
    const roster = listAgentRoster([]);

    expect(manifests.map((manifest) => manifest.agentId)).toEqual(roster.map((agent) => agent.id));
    expect(manifests.every((manifest) => manifest.executor.apiKeyAllowed === false)).toBe(true);
    expect(
      manifests.every((manifest) => {
        const role = roster.find((agent) => agent.id === manifest.agentId);
        return (
          role !== undefined &&
          manifest.provider === role.preferredProvider &&
          manifest.scope.tentacleIds.includes(role.tentacleId)
        );
      }),
    ).toBe(true);
  });

  it("blocks API-key workflows through the server-scoped policy", () => {
    const evaluation = evaluateAgentManifest({
      agentId: "codex-executor",
      actionType: "prompt",
      content: "Use this OpenAI API key to call the model directly.",
    });

    expect(evaluation?.decision).toBe("deny");
    expect(evaluation?.matchedPolicies.map((policy) => policy.id)).toContain("server-no-api-keys");
  });

  it("requires approval for external side effects", () => {
    const evaluation = evaluateAgentManifest({
      agentId: "record-center",
      actionType: "tool",
      content: "publish this project note externally",
    });

    expect(evaluation?.decision).toBe("requires_approval");
    expect(evaluation?.matchedPolicies.map((policy) => policy.id)).toContain(
      "session-ask-external-side-effects",
    );
  });

  it("requires approval before an agent handles financial or personal-data actions", () => {
    const finance = evaluateAgentManifest({
      agentId: "ceo-command",
      actionType: "workflow",
      content: "Purchase a paid ad campaign for the game launch.",
    });
    const personalData = evaluateAgentManifest({
      agentId: "record-center",
      actionType: "tool",
      content: "Export contacts from the customer data list.",
    });

    expect(finance?.decision).toBe("requires_approval");
    expect(finance?.matchedPolicies.map((policy) => policy.id)).toContain(
      "server-ask-financial-actions",
    );
    expect(personalData?.decision).toBe("requires_approval");
    expect(personalData?.matchedPolicies.map((policy) => policy.id)).toContain(
      "server-ask-personal-data-actions",
    );
  });
});
