import { describe, expect, it } from "vitest";

import {
  buildAgentRosterUrl,
  buildAllChannelMessagesUrl,
  buildChannelMessagesUrl,
  buildChannelPruneUrl,
  buildClaudeUsageUrl,
  buildCodexUsageUrl,
  buildConversationExportUrl,
  buildConversationSessionUrl,
  buildConversationsUrl,
  buildGithubSummaryUrl,
  buildMemoryUrl,
  buildMonitorConfigUrl,
  buildMonitorFeedUrl,
  buildMonitorRefreshUrl,
  buildOperatorUpdatesUrl,
  buildSwarmRegistryItemUrl,
  buildTelegramStatusUrl,
  buildTentacleGitCommitUrl,
  buildTentacleGitPullRequestMergeUrl,
  buildTentacleGitPullRequestUrl,
  buildTentacleGitPushUrl,
  buildTentacleGitStatusUrl,
  buildTentacleGitSyncUrl,
  buildTentacleRenameUrl,
  buildTerminalEventsSocketUrl,
  buildTerminalPruneUrl,
  buildTerminalSnapshotsUrl,
  buildTerminalSocketUrl,
  buildTerminalsUrl,
  buildUiStateUrl,
  buildWorkflowRunClaimUrl,
  buildWorkflowRunLocalExecutionUrl,
  buildWorkspaceSetupStepUrl,
  buildWorkspaceSetupUrl,
} from "../src/runtime/runtimeEndpoints";

describe("runtimeEndpoints", () => {
  it("builds the workflow claim URL", () => {
    expect(buildWorkflowRunClaimUrl("workflow-game-qa-balance", "run-1")).toBe(
      "/api/workflows/workflow-game-qa-balance/runs/run-1/claim",
    );
    expect(
      buildWorkflowRunClaimUrl("workflow-game-qa-balance", "run-1", "https://runtime.example.com"),
    ).toBe("https://runtime.example.com/api/workflows/workflow-game-qa-balance/runs/run-1/claim");
  });

  it("builds the fixed local workflow execution URL", () => {
    expect(buildWorkflowRunLocalExecutionUrl("workflow-game-qa-balance", "run-1")).toBe(
      "/api/workflows/workflow-game-qa-balance/runs/run-1/execute-local",
    );
    expect(
      buildWorkflowRunLocalExecutionUrl(
        "workflow-game-qa-balance",
        "run-1",
        "https://runtime.example.com",
      ),
    ).toBe(
      "https://runtime.example.com/api/workflows/workflow-game-qa-balance/runs/run-1/execute-local",
    );
  });

  it("builds agent roster URL on same origin and configured runtime origins", () => {
    expect(buildAgentRosterUrl()).toBe("/api/agents");
    expect(buildAgentRosterUrl("https://runtime.example.com")).toBe(
      "https://runtime.example.com/api/agents",
    );
  });

  it("returns same-origin API path when runtime base URL is not configured", () => {
    expect(buildTerminalSnapshotsUrl()).toBe("/api/terminal-snapshots");
  });

  it("builds absolute API URL when runtime base URL is configured", () => {
    expect(buildTerminalSnapshotsUrl("https://runtime.example.com")).toBe(
      "https://runtime.example.com/api/terminal-snapshots",
    );
  });

  it("builds terminal creation URL on same origin by default", () => {
    expect(buildTerminalsUrl()).toBe("/api/terminals");
  });

  it("builds a custom swarm item URL on same origin and configured runtime origins", () => {
    expect(buildSwarmRegistryItemUrl("school-project")).toBe("/api/swarms/school-project");
    expect(buildSwarmRegistryItemUrl("school project", "https://runtime.example.com")).toBe(
      "https://runtime.example.com/api/swarms/school%20project",
    );
  });

  it("builds safe terminal cleanup URL on same origin and configured runtime origins", () => {
    expect(buildTerminalPruneUrl()).toBe("/api/terminals/prune");
    expect(buildTerminalPruneUrl("https://runtime.example.com")).toBe(
      "https://runtime.example.com/api/terminals/prune",
    );
  });

  it("builds absolute terminal creation URL when runtime base URL is configured", () => {
    expect(buildTerminalsUrl("https://runtime.example.com")).toBe(
      "https://runtime.example.com/api/terminals",
    );
  });

  it("builds codex usage URL on same origin by default", () => {
    expect(buildCodexUsageUrl()).toBe("/api/codex/usage");
  });

  it("builds absolute codex usage URL when runtime base URL is configured", () => {
    expect(buildCodexUsageUrl("https://runtime.example.com")).toBe(
      "https://runtime.example.com/api/codex/usage",
    );
  });

  it("builds claude usage URL on same origin by default", () => {
    expect(buildClaudeUsageUrl()).toBe("/api/claude/usage");
  });

  it("builds absolute claude usage URL when runtime base URL is configured", () => {
    expect(buildClaudeUsageUrl("https://runtime.example.com")).toBe(
      "https://runtime.example.com/api/claude/usage",
    );
  });

  it("builds github summary URL on same origin by default", () => {
    expect(buildGithubSummaryUrl()).toBe("/api/github/summary");
  });

  it("builds absolute github summary URL when runtime base URL is configured", () => {
    expect(buildGithubSummaryUrl("https://runtime.example.com")).toBe(
      "https://runtime.example.com/api/github/summary",
    );
  });

  it("builds monitor config URL on same origin by default", () => {
    expect(buildMonitorConfigUrl()).toBe("/api/monitor/config");
  });

  it("builds monitor feed URL on same origin by default", () => {
    expect(buildMonitorFeedUrl()).toBe("/api/monitor/feed");
  });

  it("builds monitor refresh URL on same origin by default", () => {
    expect(buildMonitorRefreshUrl()).toBe("/api/monitor/refresh");
  });

  it("builds conversations URLs on same origin by default", () => {
    expect(buildConversationsUrl()).toBe("/api/conversations");
    expect(buildAllChannelMessagesUrl()).toBe("/api/channels");
    expect(buildChannelPruneUrl()).toBe("/api/channels/prune");
    expect(buildTelegramStatusUrl()).toBe("/api/telegram/status");
    expect(buildOperatorUpdatesUrl()).toBe("/api/operator-updates");
    expect(buildChannelMessagesUrl("terminal-1")).toBe("/api/channels/terminal-1/messages");
    expect(buildConversationSessionUrl("tentacle-1-root")).toBe(
      "/api/conversations/tentacle-1-root",
    );
    expect(buildConversationExportUrl("tentacle-1-root", "json")).toBe(
      "/api/conversations/tentacle-1-root/export?format=json",
    );
    expect(buildConversationExportUrl("tentacle-1-root", "md")).toBe(
      "/api/conversations/tentacle-1-root/export?format=md",
    );
  });

  it("builds memory URLs with optional local search filters", () => {
    expect(buildMemoryUrl()).toBe("/api/memory");
    expect(buildMemoryUrl({ query: "role handoff", tentacleId: "game-business" })).toBe(
      "/api/memory?query=role+handoff&tentacleId=game-business",
    );
    expect(buildMemoryUrl({ query: "research" }, "https://runtime.example.com")).toBe(
      "https://runtime.example.com/api/memory?query=research",
    );
  });

  it("builds absolute conversations URLs when runtime base URL is configured", () => {
    expect(buildConversationsUrl("https://runtime.example.com")).toBe(
      "https://runtime.example.com/api/conversations",
    );
    expect(buildChannelMessagesUrl("terminal-1", "https://runtime.example.com")).toBe(
      "https://runtime.example.com/api/channels/terminal-1/messages",
    );
    expect(buildAllChannelMessagesUrl("https://runtime.example.com")).toBe(
      "https://runtime.example.com/api/channels",
    );
    expect(buildChannelPruneUrl("https://runtime.example.com")).toBe(
      "https://runtime.example.com/api/channels/prune",
    );
    expect(buildTelegramStatusUrl("https://runtime.example.com")).toBe(
      "https://runtime.example.com/api/telegram/status",
    );
    expect(buildOperatorUpdatesUrl("https://runtime.example.com")).toBe(
      "https://runtime.example.com/api/operator-updates",
    );
    expect(buildConversationSessionUrl("tentacle-1-root", "https://runtime.example.com")).toBe(
      "https://runtime.example.com/api/conversations/tentacle-1-root",
    );
    expect(
      buildConversationExportUrl("tentacle-1-root", "json", "https://runtime.example.com"),
    ).toBe("https://runtime.example.com/api/conversations/tentacle-1-root/export?format=json");
  });

  it("builds absolute monitor URLs when runtime base URL is configured", () => {
    expect(buildMonitorConfigUrl("https://runtime.example.com")).toBe(
      "https://runtime.example.com/api/monitor/config",
    );
    expect(buildMonitorFeedUrl("https://runtime.example.com")).toBe(
      "https://runtime.example.com/api/monitor/feed",
    );
    expect(buildMonitorRefreshUrl("https://runtime.example.com")).toBe(
      "https://runtime.example.com/api/monitor/refresh",
    );
  });

  it("builds ui state URL on same origin by default", () => {
    expect(buildUiStateUrl()).toBe("/api/ui-state");
  });

  it("builds absolute ui state URL when runtime base URL is configured", () => {
    expect(buildUiStateUrl("https://runtime.example.com")).toBe(
      "https://runtime.example.com/api/ui-state",
    );
  });

  it("builds workspace setup URLs on same origin by default", () => {
    expect(buildWorkspaceSetupUrl()).toBe("/api/setup");
    expect(buildWorkspaceSetupStepUrl("ensure-gitignore")).toBe(
      "/api/setup/steps/ensure-gitignore",
    );
  });

  it("builds absolute workspace setup URLs when runtime base URL is configured", () => {
    expect(buildWorkspaceSetupUrl("https://runtime.example.com")).toBe(
      "https://runtime.example.com/api/setup",
    );
    expect(buildWorkspaceSetupStepUrl("ensure-gitignore", "https://runtime.example.com")).toBe(
      "https://runtime.example.com/api/setup/steps/ensure-gitignore",
    );
  });

  it("builds tentacle rename URL on same origin by default", () => {
    expect(buildTentacleRenameUrl("tentacle-main")).toBe("/api/tentacles/tentacle-main");
  });

  it("builds absolute tentacle rename URL when runtime base URL is configured", () => {
    expect(buildTentacleRenameUrl("tentacle-main", "https://runtime.example.com")).toBe(
      "https://runtime.example.com/api/tentacles/tentacle-main",
    );
  });

  it("builds tentacle git lifecycle URLs on same origin by default", () => {
    expect(buildTentacleGitStatusUrl("tentacle-main")).toBe(
      "/api/tentacles/tentacle-main/git/status",
    );
    expect(buildTentacleGitCommitUrl("tentacle-main")).toBe(
      "/api/tentacles/tentacle-main/git/commit",
    );
    expect(buildTentacleGitPushUrl("tentacle-main")).toBe("/api/tentacles/tentacle-main/git/push");
    expect(buildTentacleGitSyncUrl("tentacle-main")).toBe("/api/tentacles/tentacle-main/git/sync");
    expect(buildTentacleGitPullRequestUrl("tentacle-main")).toBe(
      "/api/tentacles/tentacle-main/git/pr",
    );
    expect(buildTentacleGitPullRequestMergeUrl("tentacle-main")).toBe(
      "/api/tentacles/tentacle-main/git/pr/merge",
    );
  });

  it("builds absolute tentacle git lifecycle URLs when runtime base URL is configured", () => {
    expect(buildTentacleGitStatusUrl("tentacle-main", "https://runtime.example.com")).toBe(
      "https://runtime.example.com/api/tentacles/tentacle-main/git/status",
    );
    expect(buildTentacleGitCommitUrl("tentacle-main", "https://runtime.example.com")).toBe(
      "https://runtime.example.com/api/tentacles/tentacle-main/git/commit",
    );
    expect(buildTentacleGitPushUrl("tentacle-main", "https://runtime.example.com")).toBe(
      "https://runtime.example.com/api/tentacles/tentacle-main/git/push",
    );
    expect(buildTentacleGitSyncUrl("tentacle-main", "https://runtime.example.com")).toBe(
      "https://runtime.example.com/api/tentacles/tentacle-main/git/sync",
    );
    expect(buildTentacleGitPullRequestUrl("tentacle-main", "https://runtime.example.com")).toBe(
      "https://runtime.example.com/api/tentacles/tentacle-main/git/pr",
    );
    expect(
      buildTentacleGitPullRequestMergeUrl("tentacle-main", "https://runtime.example.com"),
    ).toBe("https://runtime.example.com/api/tentacles/tentacle-main/git/pr/merge");
  });

  it("builds same-origin websocket URL by default", () => {
    expect(
      buildTerminalSocketUrl(
        "tentacle-main",
        undefined,
        new URL("https://workspace.example.com/dashboard") as unknown as Location,
      ),
    ).toBe("wss://workspace.example.com/api/terminals/tentacle-main/ws");
  });

  it("builds websocket URL from configured runtime base URL", () => {
    expect(
      buildTerminalSocketUrl(
        "tentacle-main",
        "http://127.0.0.1:8787",
        new URL("https://workspace.example.com/dashboard") as unknown as Location,
      ),
    ).toBe("ws://127.0.0.1:8787/api/terminals/tentacle-main/ws");
  });

  it("builds same-origin terminal events websocket URL by default", () => {
    expect(
      buildTerminalEventsSocketUrl(
        undefined,
        new URL("https://workspace.example.com/dashboard") as unknown as Location,
      ),
    ).toBe("wss://workspace.example.com/api/terminal-events/ws");
  });

  it("builds terminal events websocket URL from configured runtime base URL", () => {
    expect(
      buildTerminalEventsSocketUrl(
        "http://127.0.0.1:8787",
        new URL("https://workspace.example.com/dashboard") as unknown as Location,
      ),
    ).toBe("ws://127.0.0.1:8787/api/terminal-events/ws");
  });
});
