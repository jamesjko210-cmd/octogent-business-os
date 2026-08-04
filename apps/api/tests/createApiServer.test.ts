import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}));

const createFakePty = (pid: number) => ({
  pid,
  write: vi.fn(),
  resize: vi.fn(),
  kill: vi.fn(),
  onData: () => ({ dispose: () => undefined }),
  onExit: () => ({ dispose: () => undefined }),
});

vi.mock("node-pty", () => ({
  spawn: spawnMock,
}));

import { createApiServer } from "../src/createApiServer";
import type { GitHubRepoSummarySnapshot } from "../src/githubRepoSummary";
import { MAX_CHILDREN_PER_PARENT } from "../src/terminalRuntime";
import type { GitClient } from "../src/terminalRuntime";
import { terminalChannelCapability } from "../src/terminalRuntime/security";
import type { PersistedTerminal } from "../src/terminalRuntime/types";

class FakeGitClient implements GitClient {
  private readonly worktreeStatusByCwd = new Map<
    string,
    {
      branchName: string;
      upstreamBranchName: string | null;
      isDirty: boolean;
      aheadCount: number;
      behindCount: number;
      insertedLineCount: number;
      deletedLineCount: number;
      hasConflicts: boolean;
      changedFiles: string[];
      defaultBaseBranchName: string | null;
    }
  >();
  private readonly commitsByCwd = new Map<string, string[]>();
  private readonly pushesByCwd = new Map<string, number>();
  private readonly syncsByCwd = new Map<string, string[]>();
  private readonly pullRequestByCwd = new Map<
    string,
    {
      number: number;
      url: string;
      title: string;
      baseRef: string;
      headRef: string;
      state: "OPEN" | "MERGED" | "CLOSED";
      isDraft: boolean;
      mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
      mergeStateStatus: string | null;
    } | null
  >();
  private readonly worktrees = new Map<
    string,
    { branchName: string; baseRef: string; cwd: string }
  >();
  private readonly branches = new Set<string>();
  private repositoryAvailable = true;
  private failRemoveWorktree = false;
  private failCommit = false;
  private failPush = false;
  private failSync = false;
  private failCreatePullRequest = false;
  private failMergePullRequest = false;

  assertAvailable(): void {}

  isRepository(): boolean {
    return this.repositoryAvailable;
  }

  addWorktree({
    cwd,
    path,
    branchName,
    baseRef,
  }: {
    cwd: string;
    path: string;
    branchName: string;
    baseRef: string;
  }): void {
    if (this.worktrees.has(path)) {
      throw new Error(`Worktree already exists: ${path}`);
    }
    mkdirSync(path, { recursive: true });
    this.branches.add(branchName);
    this.worktrees.set(path, { cwd, branchName, baseRef });
    this.worktreeStatusByCwd.set(path, {
      branchName,
      upstreamBranchName: null,
      isDirty: false,
      aheadCount: 0,
      behindCount: 0,
      insertedLineCount: 0,
      deletedLineCount: 0,
      hasConflicts: false,
      changedFiles: [],
      defaultBaseBranchName: "main",
    });
    this.pullRequestByCwd.set(path, null);
  }

  removeWorktree({ path }: { cwd: string; path: string }): void {
    if (this.failRemoveWorktree) {
      throw new Error(`Unable to remove worktree: ${path}`);
    }
    this.worktrees.delete(path);
    this.worktreeStatusByCwd.delete(path);
    this.commitsByCwd.delete(path);
    this.pushesByCwd.delete(path);
    this.syncsByCwd.delete(path);
    this.pullRequestByCwd.delete(path);
  }

  removeBranch({ branchName }: { cwd: string; branchName: string }): void {
    this.branches.delete(branchName);
  }

  setRepositoryAvailable(available: boolean): void {
    this.repositoryAvailable = available;
  }

  setFailRemoveWorktree(shouldFail: boolean): void {
    this.failRemoveWorktree = shouldFail;
  }

  setFailCommit(shouldFail: boolean): void {
    this.failCommit = shouldFail;
  }

  setFailPush(shouldFail: boolean): void {
    this.failPush = shouldFail;
  }

  setFailSync(shouldFail: boolean): void {
    this.failSync = shouldFail;
  }

  setFailCreatePullRequest(shouldFail: boolean): void {
    this.failCreatePullRequest = shouldFail;
  }

  setFailMergePullRequest(shouldFail: boolean): void {
    this.failMergePullRequest = shouldFail;
  }

  setWorktreeStatus(
    cwd: string,
    status: {
      branchName: string;
      upstreamBranchName: string | null;
      isDirty: boolean;
      aheadCount: number;
      behindCount: number;
      insertedLineCount: number;
      deletedLineCount: number;
      hasConflicts: boolean;
      changedFiles: string[];
      defaultBaseBranchName: string | null;
    },
  ): void {
    this.worktreeStatusByCwd.set(cwd, status);
  }

  readWorktreeStatus({
    cwd,
  }: {
    cwd: string;
  }): {
    branchName: string;
    upstreamBranchName: string | null;
    isDirty: boolean;
    aheadCount: number;
    behindCount: number;
    insertedLineCount: number;
    deletedLineCount: number;
    hasConflicts: boolean;
    changedFiles: string[];
    defaultBaseBranchName: string | null;
  } {
    const status = this.worktreeStatusByCwd.get(cwd);
    if (!status) {
      throw new Error(`Missing fake status for ${cwd}`);
    }
    return {
      ...status,
      changedFiles: [...status.changedFiles],
    };
  }

  commitAll({ cwd, message }: { cwd: string; message: string }): void {
    if (this.failCommit) {
      throw new Error("Simulated commit failure");
    }

    const status = this.worktreeStatusByCwd.get(cwd);
    if (!status) {
      throw new Error(`Missing fake status for ${cwd}`);
    }
    if (!status.isDirty) {
      throw new Error("No local changes to commit.");
    }

    const commits = this.commitsByCwd.get(cwd) ?? [];
    commits.push(message);
    this.commitsByCwd.set(cwd, commits);
    this.worktreeStatusByCwd.set(cwd, {
      ...status,
      isDirty: false,
      changedFiles: [],
      aheadCount: status.aheadCount + 1,
      insertedLineCount: 0,
      deletedLineCount: 0,
      hasConflicts: false,
    });
  }

  pushCurrentBranch({ cwd }: { cwd: string }): void {
    if (this.failPush) {
      throw new Error("Simulated push failure");
    }

    const status = this.worktreeStatusByCwd.get(cwd);
    if (!status) {
      throw new Error(`Missing fake status for ${cwd}`);
    }

    this.pushesByCwd.set(cwd, (this.pushesByCwd.get(cwd) ?? 0) + 1);
    this.worktreeStatusByCwd.set(cwd, {
      ...status,
      upstreamBranchName: status.upstreamBranchName ?? `origin/${status.branchName}`,
      aheadCount: 0,
    });
  }

  syncWithBase({ cwd, baseRef }: { cwd: string; baseRef: string }): void {
    if (this.failSync) {
      throw new Error("Simulated sync failure");
    }

    const status = this.worktreeStatusByCwd.get(cwd);
    if (!status) {
      throw new Error(`Missing fake status for ${cwd}`);
    }
    const syncs = this.syncsByCwd.get(cwd) ?? [];
    syncs.push(baseRef);
    this.syncsByCwd.set(cwd, syncs);
    this.worktreeStatusByCwd.set(cwd, {
      ...status,
      behindCount: 0,
      insertedLineCount: 0,
      deletedLineCount: 0,
      hasConflicts: false,
    });
  }

  setWorktreePullRequest(
    cwd: string,
    pullRequest: {
      number: number;
      url: string;
      title: string;
      baseRef: string;
      headRef: string;
      state: "OPEN" | "MERGED" | "CLOSED";
      isDraft: boolean;
      mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
      mergeStateStatus: string | null;
    } | null,
  ): void {
    this.pullRequestByCwd.set(cwd, pullRequest);
  }

  readCurrentBranchPullRequest({
    cwd,
  }: {
    cwd: string;
  }): {
    number: number;
    url: string;
    title: string;
    baseRef: string;
    headRef: string;
    state: "OPEN" | "MERGED" | "CLOSED";
    isDraft: boolean;
    mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
    mergeStateStatus: string | null;
  } | null {
    const pullRequest = this.pullRequestByCwd.get(cwd);
    if (pullRequest === undefined || pullRequest === null) {
      return null;
    }

    return {
      ...pullRequest,
    };
  }

  createPullRequest({
    cwd,
    title,
    baseRef,
    headRef,
  }: {
    cwd: string;
    title: string;
    body: string;
    baseRef: string;
    headRef: string;
  }): {
    number: number;
    url: string;
    title: string;
    baseRef: string;
    headRef: string;
    state: "OPEN" | "MERGED" | "CLOSED";
    isDraft: boolean;
    mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
    mergeStateStatus: string | null;
  } | null {
    if (this.failCreatePullRequest) {
      throw new Error("Simulated create PR failure");
    }

    const nextNumber = (this.pullRequestByCwd.get(cwd)?.number ?? 100) + 1;
    const pullRequest = {
      number: nextNumber,
      url: `https://github.com/hesamsheikh/octogent/pull/${nextNumber}`,
      title,
      baseRef,
      headRef,
      state: "OPEN" as const,
      isDraft: false,
      mergeable: "MERGEABLE" as const,
      mergeStateStatus: "CLEAN",
    };
    this.pullRequestByCwd.set(cwd, pullRequest);
    return pullRequest;
  }

  mergeCurrentBranchPullRequest({
    cwd,
  }: {
    cwd: string;
    strategy: "squash" | "merge" | "rebase";
  }): void {
    if (this.failMergePullRequest) {
      throw new Error("Simulated merge PR failure");
    }

    const pullRequest = this.pullRequestByCwd.get(cwd);
    if (!pullRequest) {
      throw new Error("No open pull request for this branch.");
    }

    this.pullRequestByCwd.set(cwd, {
      ...pullRequest,
      state: "MERGED",
      mergeable: "UNKNOWN",
      mergeStateStatus: "MERGED",
    });
  }

  getWorktree(path: string): { branchName: string; baseRef: string; cwd: string } | null {
    return this.worktrees.get(path) ?? null;
  }

  hasBranch(branchName: string): boolean {
    return this.branches.has(branchName);
  }

  getLastCommitMessage(cwd: string): string | null {
    const commits = this.commitsByCwd.get(cwd);
    if (!commits || commits.length === 0) {
      return null;
    }
    return commits[commits.length - 1] ?? null;
  }

  getPushCount(cwd: string): number {
    return this.pushesByCwd.get(cwd) ?? 0;
  }

  getSyncBaseRefs(cwd: string): string[] {
    return [...(this.syncsByCwd.get(cwd) ?? [])];
  }

  getPullRequestState(cwd: string): "OPEN" | "MERGED" | "CLOSED" | null {
    return this.pullRequestByCwd.get(cwd)?.state ?? null;
  }
}

describe("createApiServer", () => {
  let stopServer: (() => Promise<void>) | null = null;
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    if (stopServer) {
      await stopServer();
      stopServer = null;
    }

    for (const directory of temporaryDirectories) {
      rmSync(directory, { recursive: true, force: true });
    }
    temporaryDirectories.length = 0;
  });

  const startServer = async (options: Partial<Parameters<typeof createApiServer>[0]> = {}) => {
    const workspaceCwd =
      options.workspaceCwd ??
      (() => {
        const directory = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
        temporaryDirectories.push(directory);
        return directory;
      })();
    const apiServer = createApiServer({
      workspaceCwd,
      gitClient: options.gitClient ?? new FakeGitClient(),
      readGithubPublishReadiness:
        options.readGithubPublishReadiness ??
        (async () => ({
          status: "ready" as const,
          origin: "https://github.com/example/octogent-custom.git",
          message: "Test remote is explicitly approved.",
        })),
      ...options,
    });
    const address = await apiServer.start(0, "127.0.0.1");
    stopServer = () => apiServer.stop();
    return `http://${address.host}:${address.port}`;
  };

  const toWebSocketBaseUrl = (httpBaseUrl: string) =>
    httpBaseUrl.startsWith("https://")
      ? httpBaseUrl.replace("https://", "wss://")
      : httpBaseUrl.replace("http://", "ws://");

  const waitForRegistryDocument = async <TDocument>(
    workspaceCwd: string,
    predicate: (document: TDocument) => boolean,
  ): Promise<TDocument> => {
    const registryPath = join(workspaceCwd, ".octogent", "state", "tentacles.json");
    const timeoutAt = Date.now() + 2_000;

    while (Date.now() < timeoutAt) {
      if (existsSync(registryPath)) {
        try {
          const document = JSON.parse(readFileSync(registryPath, "utf8")) as TDocument;
          if (predicate(document)) {
            return document;
          }
        } catch {
          // Registry writes are async; retry if the file is briefly half-written.
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    throw new Error(`Timed out waiting for registry persistence at ${registryPath}`);
  };

  const writeConversationTranscript = (
    workspaceCwd: string,
    sessionId: string,
    events: unknown[],
  ) => {
    const transcriptDirectory = join(workspaceCwd, ".octogent", "state", "transcripts");
    mkdirSync(transcriptDirectory, { recursive: true });
    const transcriptPath = join(transcriptDirectory, `${encodeURIComponent(sessionId)}.jsonl`);
    writeFileSync(
      transcriptPath,
      `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
      "utf8",
    );
  };

  const writeClaudeTurns = (
    workspaceCwd: string,
    sessionId: string,
    turns: Array<{
      turnId: string;
      role: string;
      content: string;
      startedAt: string;
      endedAt: string;
    }>,
  ) => {
    const transcriptDirectory = join(workspaceCwd, ".octogent", "state", "transcripts");
    mkdirSync(transcriptDirectory, { recursive: true });
    const turnsPath = join(
      transcriptDirectory,
      `${encodeURIComponent(sessionId)}.claude-turns.json`,
    );
    writeFileSync(turnsPath, JSON.stringify(turns), "utf8");
  };

  it("returns snapshots for GET /api/terminal-snapshots", async () => {
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/terminal-snapshots`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
  });

  it("returns an empty verified session timeline before managed work starts", async () => {
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/sessions`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ sessions: [] });
  });

  it("returns separate Game Business and Research swarm summaries", async () => {
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/swarms`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      swarms: expect.arrayContaining([
        expect.objectContaining({ id: "game-business", roleCount: 12, activeRoles: [] }),
        expect.objectContaining({ id: "research", roleCount: 1, activeRoles: [] }),
      ]),
    });
  });

  it("removes only an operator-created swarm and preserves permanent roles", async () => {
    const baseUrl = await startServer();
    const createResponse = await fetch(`${baseUrl}/api/swarms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "school-project",
        title: "School Project",
        purpose: "Keeps school work separate.",
        agentIds: ["research-triad"],
      }),
    });
    expect(createResponse.status).toBe(201);

    const rejectedDefaultResponse = await fetch(`${baseUrl}/api/swarms/game-business`, {
      method: "DELETE",
    });
    expect(rejectedDefaultResponse.status).toBe(400);
    await expect(rejectedDefaultResponse.json()).resolves.toEqual({
      error: "Default project swarms cannot be removed.",
    });

    const removeResponse = await fetch(`${baseUrl}/api/swarms/school-project`, {
      method: "DELETE",
    });
    expect(removeResponse.status).toBe(200);
    await expect(removeResponse.json()).resolves.toEqual({ swarmId: "school-project" });

    const swarmsResponse = await fetch(`${baseUrl}/api/swarms`);
    await expect(swarmsResponse.json()).resolves.toEqual({
      swarms: expect.not.arrayContaining([expect.objectContaining({ id: "school-project" })]),
    });
    const rolesResponse = await fetch(`${baseUrl}/api/agents`);
    await expect(rolesResponse.json()).resolves.toEqual({
      agents: expect.arrayContaining([expect.objectContaining({ id: "research-triad" })]),
    });
  });

  it("redacts and bounds durable channel messages before they are stored", async () => {
    const baseUrl = await startServer();
    const terminalResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        terminalId: "channel-safety-worker",
        tentacleId: "game-business",
        name: "Channel safety worker",
        workspaceMode: "worktree",
        agentProvider: "codex",
      }),
    });
    expect(terminalResponse.status).toBe(201);

    const spoofedSenderResponse = await fetch(
      `${baseUrl}/api/channels/channel-safety-worker/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromTerminalId: "channel-safety-worker",
          content: "Pretend to be a worker without its local capability.",
        }),
      },
    );
    expect(spoofedSenderResponse.status).toBe(403);

    const oversizedResponse = await fetch(
      `${baseUrl}/api/channels/channel-safety-worker/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "x".repeat(4_001) }),
      },
    );
    expect(oversizedResponse.status).toBe(400);

    const messageResponse = await fetch(`${baseUrl}/api/channels/channel-safety-worker/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "Use api_key=secret-value for this request." }),
    });
    expect(messageResponse.status).toBe(201);
    await expect(messageResponse.json()).resolves.toEqual(
      expect.objectContaining({ content: "Use api_key=[redacted] for this request." }),
    );

    const messagesResponse = await fetch(`${baseUrl}/api/channels/channel-safety-worker/messages`);
    await expect(messagesResponse.json()).resolves.toEqual({
      terminalId: "channel-safety-worker",
      messages: [expect.objectContaining({ content: "Use api_key=[redacted] for this request." })],
    });

    const handoffsResponse = await fetch(`${baseUrl}/api/channels`);
    await expect(handoffsResponse.json()).resolves.toEqual({
      messages: [
        expect.objectContaining({
          toTerminalId: "channel-safety-worker",
          content: "Use api_key=[redacted] for this request.",
        }),
      ],
    });
  });

  it("keeps registered permanent roles prepared until a provider session is running", async () => {
    const baseUrl = await startServer();

    const initialResponse = await fetch(`${baseUrl}/api/agents`);
    expect(initialResponse.status).toBe(200);
    const initialPayload = (await initialResponse.json()) as {
      agents: Array<{
        id: string;
        state: string;
        currentActivity: string;
        executionScope: { workspaceMode: string } | null;
      }>;
    };
    expect(initialPayload.agents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "ceo-command",
          state: "not_launched",
          currentActivity: "No matching terminal is launched yet.",
        }),
        expect.objectContaining({
          id: "codex-executor",
          state: "not_launched",
          executionScope: expect.objectContaining({ workspaceMode: "worktree" }),
        }),
      ]),
    );

    const wrongScopeResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        terminalId: "wrong-scope-worker",
        agentId: "codex-executor",
        tentacleId: "game-business",
        name: "Wrong scope worker",
        workspaceMode: "shared",
        agentProvider: "claude-code",
      }),
    });
    expect(wrongScopeResponse.status).toBe(400);

    const manifestMismatchResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        terminalId: "wrong-manifest-worker",
        agentId: "codex-executor",
        tentacleId: "game-business",
        name: "Wrong manifest worker",
        workspaceMode: "shared",
        agentProvider: "codex",
      }),
    });
    expect(manifestMismatchResponse.status).toBe(400);

    const terminalResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        terminalId: "directory-codex-worker",
        agentId: "codex-executor",
        tentacleId: "game-business",
        name: "Directory Codex worker",
        workspaceMode: "worktree",
        agentProvider: "codex",
      }),
    });
    expect(terminalResponse.status).toBe(201);

    const preparedResponse = await fetch(`${baseUrl}/api/agents`);
    const preparedPayload = (await preparedResponse.json()) as {
      agents: Array<{ id: string; state: string; terminalIds: string[] }>;
    };
    expect(preparedPayload.agents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "codex-executor",
          state: "prepared",
          terminalIds: ["directory-codex-worker"],
        }),
        expect.objectContaining({
          id: "debugging-council",
          state: "not_launched",
          terminalIds: [],
        }),
      ]),
    );

    const swarmResponse = await fetch(`${baseUrl}/api/swarms`);
    await expect(swarmResponse.json()).resolves.toEqual({
      swarms: expect.arrayContaining([
        expect.objectContaining({
          id: "game-business",
          state: "prepared",
          preparedCount: 1,
        }),
      ]),
    });

    const duplicateRegistrationResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        terminalId: "duplicate-directory-codex-worker",
        agentId: "codex-executor",
        tentacleId: "game-business",
        name: "Duplicate directory Codex worker",
        workspaceMode: "worktree",
        agentProvider: "codex",
      }),
    });
    expect(duplicateRegistrationResponse.status).toBe(409);

    const rejectedActivityResponse = await fetch(`${baseUrl}/api/agents/codex-executor/activity`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        terminalId: "not-a-real-terminal",
        status: "testing",
        summary: "Trying to report an activity without the scoped worker.",
      }),
    });
    expect(rejectedActivityResponse.status).toBe(409);

    const preparedActivityResponse = await fetch(`${baseUrl}/api/agents/codex-executor/activity`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        terminalId: "directory-codex-worker",
        status: "testing",
        summary: "Running the Block Bounce regression checks.",
      }),
    });
    expect(preparedActivityResponse.status).toBe(409);
  });

  it("queues durable role messages without launching a model", async () => {
    const baseUrl = await startServer();

    const spoofedAgentResponse = await fetch(`${baseUrl}/api/agents/codex-executor/inbox`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromTerminalId: "unverified-terminal",
        content: "Pretend to be an active role agent.",
      }),
    });
    expect(spoofedAgentResponse.status).toBe(403);

    const oversizedResponse = await fetch(`${baseUrl}/api/agents/codex-executor/inbox`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "x".repeat(4_001) }),
    });
    expect(oversizedResponse.status).toBe(400);

    const messageResponse = await fetch(`${baseUrl}/api/agents/codex-executor/inbox`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "Run a safe test using api_key=secret-value." }),
    });
    expect(messageResponse.status).toBe(201);
    await expect(messageResponse.json()).resolves.toEqual(
      expect.objectContaining({
        agentId: "codex-executor",
        content: "Run a safe test using api_key=[redacted]",
        delivered: false,
      }),
    );

    const listResponse = await fetch(`${baseUrl}/api/agents/codex-executor/inbox`);
    await expect(listResponse.json()).resolves.toEqual({
      agentId: "codex-executor",
      messages: [
        expect.objectContaining({
          content: "Run a safe test using api_key=[redacted]",
          delivered: false,
        }),
      ],
    });
  });

  it("accepts a capability-checked role handoff from a live permanent-role terminal", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    const baseUrl = await startServer({ workspaceCwd });

    const terminalResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        terminalId: "role-handoff-sender",
        agentId: "codex-executor",
        tentacleId: "game-business",
        name: "Role handoff sender",
        workspaceMode: "worktree",
        agentProvider: "codex",
      }),
    });
    expect(terminalResponse.status).toBe(201);

    spawnMock.mockReturnValue(createFakePty(704));
    const startResponse = await fetch(`${baseUrl}/api/terminals/role-handoff-sender/start`, {
      method: "POST",
      headers: { Accept: "application/json" },
    });
    expect(startResponse.status).toBe(200);

    const registry = await waitForRegistryDocument<{ terminals: PersistedTerminal[] }>(
      workspaceCwd,
      (document) =>
        document.terminals.some(
          (terminal) => terminal.terminalId === "role-handoff-sender" && Boolean(terminal.security),
        ),
    );
    const sourceTerminal = registry.terminals.find(
      (terminal) => terminal.terminalId === "role-handoff-sender",
    );
    const capability = sourceTerminal ? terminalChannelCapability(sourceTerminal) : null;
    expect(capability).toEqual(expect.any(String));

    const handoffResponse = await fetch(`${baseUrl}/api/agents/ceo-command/inbox`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Octogent-Terminal-Capability": capability ?? "",
      },
      body: JSON.stringify({
        fromTerminalId: "role-handoff-sender",
        content: "The verified QA result is ready for priority review.",
      }),
    });
    expect(handoffResponse.status).toBe(201);
    await expect(handoffResponse.json()).resolves.toEqual(
      expect.objectContaining({
        agentId: "ceo-command",
        from: "agent",
        fromAgentId: "codex-executor",
        fromTerminalId: "role-handoff-sender",
        delivered: false,
      }),
    );
  });

  it("requires the matching private capability for a live role activity update", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    const baseUrl = await startServer({ workspaceCwd });

    const terminalResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        terminalId: "record-center-activity-reporter",
        agentId: "record-center",
        tentacleId: "game-business",
        name: "Record Center activity reporter",
        workspaceMode: "shared",
        agentProvider: "notion",
      }),
    });
    expect(terminalResponse.status).toBe(201);

    spawnMock.mockReturnValue(createFakePty(707));
    const startResponse = await fetch(
      `${baseUrl}/api/terminals/record-center-activity-reporter/start`,
      { method: "POST", headers: { Accept: "application/json" } },
    );
    expect(startResponse.status).toBe(200);

    const registry = await waitForRegistryDocument<{ terminals: PersistedTerminal[] }>(
      workspaceCwd,
      (document) =>
        document.terminals.some(
          (terminal) =>
            terminal.terminalId === "record-center-activity-reporter" && Boolean(terminal.security),
        ),
    );
    const persistedTerminal = registry.terminals.find(
      (terminal) => terminal.terminalId === "record-center-activity-reporter",
    );
    const capability = persistedTerminal ? terminalChannelCapability(persistedTerminal) : null;

    const rejectedResponse = await fetch(`${baseUrl}/api/agents/record-center/activity`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        terminalId: "record-center-activity-reporter",
        status: "reviewing",
        summary: "Attempting a spoofed status update.",
      }),
    });
    expect(rejectedResponse.status).toBe(403);

    const updateResponse = await fetch(`${baseUrl}/api/agents/record-center/activity`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Octogent-Terminal-Capability": capability ?? "",
      },
      body: JSON.stringify({
        terminalId: "record-center-activity-reporter",
        status: "reviewing",
        summary: "Consolidating verified notes with api_key=not-a-real-secret.",
      }),
    });
    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toEqual({
      activity: expect.objectContaining({
        agentId: "record-center",
        status: "reviewing",
        summary: "Consolidating verified notes with api_key=[redacted]",
      }),
    });

    const readResponse = await fetch(`${baseUrl}/api/agents/record-center/activity`);
    await expect(readResponse.json()).resolves.toEqual({
      activity: expect.objectContaining({
        terminalId: "record-center-activity-reporter",
        summary: "Consolidating verified notes with api_key=[redacted]",
      }),
    });
  });

  it("accepts a concise redacted operator update only from the matching live role terminal", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    const baseUrl = await startServer({ workspaceCwd });

    const terminalResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        terminalId: "record-center-operator-reporter",
        agentId: "record-center",
        tentacleId: "game-business",
        name: "Record Center operator reporter",
        workspaceMode: "shared",
        agentProvider: "notion",
      }),
    });
    expect(terminalResponse.status).toBe(201);

    spawnMock.mockReturnValue(createFakePty(708));
    const startResponse = await fetch(
      `${baseUrl}/api/terminals/record-center-operator-reporter/start`,
      { method: "POST", headers: { Accept: "application/json" } },
    );
    expect(startResponse.status).toBe(200);

    const registry = await waitForRegistryDocument<{ terminals: PersistedTerminal[] }>(
      workspaceCwd,
      (document) =>
        document.terminals.some(
          (terminal) =>
            terminal.terminalId === "record-center-operator-reporter" && Boolean(terminal.security),
        ),
    );
    const persistedTerminal = registry.terminals.find(
      (terminal) => terminal.terminalId === "record-center-operator-reporter",
    );
    const capability = persistedTerminal ? terminalChannelCapability(persistedTerminal) : null;

    const rejectedResponse = await fetch(`${baseUrl}/api/agents/record-center/operator-updates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        terminalId: "record-center-operator-reporter",
        content: "Spoofed update.",
      }),
    });
    expect(rejectedResponse.status).toBe(403);

    const updateResponse = await fetch(`${baseUrl}/api/agents/record-center/operator-updates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Octogent-Terminal-Capability": capability ?? "",
      },
      body: JSON.stringify({
        terminalId: "record-center-operator-reporter",
        content: "Verified update: keep api_key=not-a-real-secret out of Telegram.",
      }),
    });
    expect(updateResponse.status).toBe(201);
    await expect(updateResponse.json()).resolves.toEqual({
      update: expect.objectContaining({
        agentId: "record-center",
        content: "Verified update: keep api_key=[redacted] out of Telegram.",
      }),
    });

    const readResponse = await fetch(`${baseUrl}/api/agents/record-center/operator-updates`);
    await expect(readResponse.json()).resolves.toEqual({
      agentId: "record-center",
      updates: [
        expect.objectContaining({
          agentId: "record-center",
          content: "Verified update: keep api_key=[redacted] out of Telegram.",
        }),
      ],
    });

    const aggregateResponse = await fetch(`${baseUrl}/api/operator-updates`);
    await expect(aggregateResponse.json()).resolves.toEqual({
      updates: [
        expect.objectContaining({
          agentId: "record-center",
          content: "Verified update: keep api_key=[redacted] out of Telegram.",
        }),
      ],
    });
  });

  it("lets only a matching live role append a scoped Obsidian update", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    const obsidianVaultPath = mkdtempSync(join(tmpdir(), "octogent-obsidian-vault-"));
    temporaryDirectories.push(workspaceCwd, obsidianVaultPath);
    const baseUrl = await startServer({ workspaceCwd, obsidianVaultPath });

    const terminalResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        terminalId: "record-center-memory-writer",
        agentId: "record-center",
        tentacleId: "game-business",
        name: "Record Center memory writer",
        workspaceMode: "shared",
        agentProvider: "notion",
      }),
    });
    expect(terminalResponse.status).toBe(201);

    const rejectedResponse = await fetch(`${baseUrl}/api/agents/record-center/obsidian`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        terminalId: "record-center-memory-writer",
        content: "This needs an active local capability.",
      }),
    });
    expect(rejectedResponse.status).toBe(403);

    spawnMock.mockReturnValue(createFakePty(706));
    const startResponse = await fetch(
      `${baseUrl}/api/terminals/record-center-memory-writer/start`,
      { method: "POST", headers: { Accept: "application/json" } },
    );
    expect(startResponse.status).toBe(200);

    const registry = await waitForRegistryDocument<{ terminals: PersistedTerminal[] }>(
      workspaceCwd,
      (document) =>
        document.terminals.some(
          (terminal) =>
            terminal.terminalId === "record-center-memory-writer" && Boolean(terminal.security),
        ),
    );
    const terminal = registry.terminals.find(
      (item) => item.terminalId === "record-center-memory-writer",
    );
    const capability = terminal ? terminalChannelCapability(terminal) : null;

    const updateResponse = await fetch(`${baseUrl}/api/agents/record-center/obsidian`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Octogent-Terminal-Capability": capability ?? "",
      },
      body: JSON.stringify({
        terminalId: "record-center-memory-writer",
        content: "Verified decision: keep secret api_key=not-a-real-secret out of memory.",
      }),
    });
    expect(updateResponse.status).toBe(201);
    await expect(updateResponse.json()).resolves.toEqual(
      expect.objectContaining({
        relativePath: "Octogent/Agent Updates/record-center.md",
      }),
    );
    const note = readFileSync(
      join(obsidianVaultPath, "Octogent", "Agent Updates", "record-center.md"),
      "utf8",
    );
    expect(note).toContain("api_key=[redacted]");
    expect(note).not.toContain("not-a-real-secret");

    const sharedUpdateResponse = await fetch(`${baseUrl}/api/agents/record-center/obsidian`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Octogent-Terminal-Capability": capability ?? "",
      },
      body: JSON.stringify({
        terminalId: "record-center-memory-writer",
        target: "shared",
        content: "Verified team handoff: api_key=not-a-real-secret remains redacted.",
      }),
    });
    expect(sharedUpdateResponse.status).toBe(201);
    await expect(sharedUpdateResponse.json()).resolves.toEqual(
      expect.objectContaining({ relativePath: "Octogent/Shared/Agent Timeline.md" }),
    );
    const sharedTimeline = readFileSync(
      join(obsidianVaultPath, "Octogent", "Shared", "Agent Timeline.md"),
      "utf8",
    );
    expect(sharedTimeline).toContain("**Role:** record-center");
    expect(sharedTimeline).toContain("api_key=[redacted]");
    expect(sharedTimeline).not.toContain("not-a-real-secret");

    const searchResponse = await fetch(
      `${baseUrl}/api/agents/record-center/obsidian?terminalId=record-center-memory-writer&query=verified%20decision`,
      {
        headers: { "X-Octogent-Terminal-Capability": capability ?? "" },
      },
    );
    expect(searchResponse.status).toBe(200);
    await expect(searchResponse.json()).resolves.toEqual({
      results: expect.arrayContaining([
        expect.objectContaining({
          relativePath: "Octogent/Agent Updates/record-center.md",
          snippet: expect.stringContaining("api_key=[redacted]"),
        }),
        expect.objectContaining({
          relativePath: "Octogent/Shared/Agent Timeline.md",
          snippet: expect.stringContaining("api_key=[redacted]"),
        }),
      ]),
    });

    const rejectedSearchResponse = await fetch(
      `${baseUrl}/api/agents/record-center/obsidian?terminalId=record-center-memory-writer&query=verified`,
    );
    expect(rejectedSearchResponse.status).toBe(403);
  });

  it("executes only an allowlisted claimed Block Bounce QA run and records the outcome", async () => {
    const rootDirectory = mkdtempSync(join(tmpdir(), "octogent-local-execution-api-"));
    temporaryDirectories.push(rootDirectory);
    const workspaceCwd = join(rootDirectory, "octogent");
    const gameTestsDirectory = join(rootDirectory, "game", "tests");
    mkdirSync(workspaceCwd, { recursive: true });
    mkdirSync(gameTestsDirectory, { recursive: true });
    writeFileSync(join(gameTestsDirectory, "game-engine.test.mjs"), "console.log('engine ok');\n");
    writeFileSync(join(gameTestsDirectory, "rankings.test.mjs"), "console.log('ranking ok');\n");
    const baseUrl = await startServer({ workspaceCwd });

    const runResponse = await fetch(`${baseUrl}/api/workflows/workflow-game-qa-balance/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initiatedBy: "operator" }),
    });
    const run = (await runResponse.json()) as { id: string; status: string };
    expect(run.status).toBe("queued");

    const terminalResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        terminalId: "allowlisted-qa-worker",
        agentId: "codex-executor",
        tentacleId: "game-business",
        name: "Allowlisted QA worker",
        workspaceMode: "worktree",
        agentProvider: "codex",
      }),
    });
    expect(terminalResponse.status).toBe(201);

    spawnMock.mockReturnValue(createFakePty(701));
    const startResponse = await fetch(`${baseUrl}/api/terminals/allowlisted-qa-worker/start`, {
      method: "POST",
      headers: { Accept: "application/json" },
    });
    expect(startResponse.status).toBe(200);
    await expect(startResponse.json()).resolves.toEqual(
      expect.objectContaining({ lifecycleState: "running", state: "live", processId: 701 }),
    );

    const readyRosterResponse = await fetch(`${baseUrl}/api/agents`);
    const readyRosterPayload = (await readyRosterResponse.json()) as {
      agents: Array<{ id: string; providerConnection?: string }>;
    };
    expect(readyRosterPayload.agents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "codex-executor",
          providerConnection: "shell_started_unverified",
        }),
      ]),
    );

    const claimResponse = await fetch(
      `${baseUrl}/api/workflows/workflow-game-qa-balance/runs/${run.id}/claim`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terminalId: "allowlisted-qa-worker" }),
      },
    );
    expect(claimResponse.status).toBe(200);

    const wrongTerminalResponse = await fetch(
      `${baseUrl}/api/workflows/workflow-game-qa-balance/runs/${run.id}/execute-local`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terminalId: "wrong-terminal" }),
      },
    );
    expect(wrongTerminalResponse.status).toBe(409);

    const executionResponse = await fetch(
      `${baseUrl}/api/workflows/workflow-game-qa-balance/runs/${run.id}/execute-local`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terminalId: "allowlisted-qa-worker" }),
      },
    );
    expect(executionResponse.status).toBe(200);
    await expect(executionResponse.json()).resolves.toEqual(
      expect.objectContaining({
        run: expect.objectContaining({
          status: "succeeded",
          outcome: expect.objectContaining({
            summary: "2 allowlisted Block Bounce verification checks passed.",
          }),
        }),
      }),
    );

    const agentResponse = await fetch(`${baseUrl}/api/agents`);
    const agentPayload = (await agentResponse.json()) as {
      agents: Array<{ id: string; activityStatus?: string; currentActivity: string }>;
    };
    expect(agentPayload.agents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "codex-executor",
          activityStatus: "reviewing",
          currentActivity: "reviewing: 2 allowlisted Block Bounce verification checks passed.",
        }),
      ]),
    );

    const auditResponse = await fetch(`${baseUrl}/api/audit`);
    const auditPayload = (await auditResponse.json()) as { events: Array<{ eventType: string }> };
    expect(auditPayload.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: "workflow.run_local_execution_started" }),
        expect.objectContaining({ eventType: "workflow.run_local_execution_finished" }),
      ]),
    );
  });

  it("returns session summaries for GET /api/conversations", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    writeConversationTranscript(workspaceCwd, "terminal-1", [
      {
        type: "session_start",
        eventId: "terminal-1:1",
        sessionId: "terminal-1",
        tentacleId: "terminal-1",
        timestamp: "2026-03-05T10:00:00.000Z",
      },
      {
        type: "session_end",
        eventId: "terminal-1:5",
        sessionId: "terminal-1",
        tentacleId: "terminal-1",
        reason: "pty_exit",
        exitCode: 0,
        signal: 0,
        timestamp: "2026-03-05T10:00:04.000Z",
      },
    ]);
    writeClaudeTurns(workspaceCwd, "terminal-1", [
      {
        turnId: "turn-1",
        role: "user",
        content: "build export",
        startedAt: "2026-03-05T10:00:01.000Z",
        endedAt: "2026-03-05T10:00:01.000Z",
      },
      {
        turnId: "turn-2",
        role: "assistant",
        content: "implemented",
        startedAt: "2026-03-05T10:00:02.000Z",
        endedAt: "2026-03-05T10:00:03.000Z",
      },
    ]);

    const baseUrl = await startServer({
      workspaceCwd,
    });

    const response = await fetch(`${baseUrl}/api/conversations`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      {
        sessionId: "terminal-1",
        tentacleId: "terminal-1",
        startedAt: "2026-03-05T10:00:00.000Z",
        endedAt: "2026-03-05T10:00:04.000Z",
        lastEventAt: "2026-03-05T10:00:04.000Z",
        eventCount: 2,
        turnCount: 2,
        userTurnCount: 1,
        assistantTurnCount: 1,
        firstUserTurnPreview: "build export",
        lastUserTurnPreview: "build export",
        lastAssistantTurnPreview: "implemented",
      },
    ]);
  });

  it("returns assembled conversation details and export payloads", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    writeConversationTranscript(workspaceCwd, "terminal-2-agent-1", [
      {
        type: "session_start",
        eventId: "terminal-2-agent-1:1",
        sessionId: "terminal-2-agent-1",
        tentacleId: "terminal-2",
        timestamp: "2026-03-05T11:00:00.000Z",
      },
    ]);
    writeClaudeTurns(workspaceCwd, "terminal-2-agent-1", [
      {
        turnId: "turn-1",
        role: "user",
        content: "summarize",
        startedAt: "2026-03-05T11:00:01.000Z",
        endedAt: "2026-03-05T11:00:01.000Z",
      },
      {
        turnId: "turn-2",
        role: "assistant",
        content: "summary ready",
        startedAt: "2026-03-05T11:00:02.000Z",
        endedAt: "2026-03-05T11:00:03.000Z",
      },
    ]);

    const baseUrl = await startServer({
      workspaceCwd,
    });

    const detailResponse = await fetch(`${baseUrl}/api/conversations/terminal-2-agent-1`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    expect(detailResponse.status).toBe(200);
    await expect(detailResponse.json()).resolves.toMatchObject({
      sessionId: "terminal-2-agent-1",
      turnCount: 2,
      turns: [
        {
          role: "user",
          content: "summarize",
        },
        {
          role: "assistant",
          content: "summary ready",
        },
      ],
    });

    const jsonExportResponse = await fetch(
      `${baseUrl}/api/conversations/terminal-2-agent-1/export?format=json`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      },
    );
    expect(jsonExportResponse.status).toBe(200);
    await expect(jsonExportResponse.json()).resolves.toMatchObject({
      sessionId: "terminal-2-agent-1",
      turnCount: 2,
    });

    const markdownExportResponse = await fetch(
      `${baseUrl}/api/conversations/terminal-2-agent-1/export?format=md`,
      {
        method: "GET",
      },
    );
    expect(markdownExportResponse.status).toBe(200);
    expect(markdownExportResponse.headers.get("content-type")).toContain("text/markdown");
    const markdownBody = await markdownExportResponse.text();
    expect(markdownBody).toContain("## User");
    expect(markdownBody).toContain("summarize");
    expect(markdownBody).toContain("## Assistant");
    expect(markdownBody).toContain("summary ready");
  });

  it("returns 400 for unsupported conversation export format", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    writeConversationTranscript(workspaceCwd, "terminal-3-agent-1", [
      {
        type: "session_start",
        eventId: "terminal-3-agent-1:1",
        sessionId: "terminal-3-agent-1",
        tentacleId: "terminal-3",
        timestamp: "2026-03-05T12:00:00.000Z",
      },
    ]);

    const baseUrl = await startServer({
      workspaceCwd,
    });

    const response = await fetch(
      `${baseUrl}/api/conversations/terminal-3-agent-1/export?format=txt`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      },
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Unsupported conversation export format.",
    });
  });

  it("rejects non-local browser origins for HTTP endpoints", async () => {
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/terminal-snapshots`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Origin: "https://attacker.example",
      },
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    await expect(response.json()).resolves.toEqual({
      error: "Origin not allowed.",
    });
  });

  it("allows loopback browser origins and reflects CORS origin", async () => {
    const baseUrl = await startServer();
    const origin = "http://localhost:5173";

    const response = await fetch(`${baseUrl}/api/terminal-snapshots`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Origin: origin,
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    expect(response.headers.get("vary")).toBe("Origin");
  });

  it("rejects non-local CORS preflight requests", async () => {
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/terminals`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://attacker.example",
        "Access-Control-Request-Method": "POST",
      },
    });

    expect(response.status).toBe(403);
  });

  it("rejects websocket upgrades from non-local origins", async () => {
    const baseUrl = await startServer();
    const wsUrl = new URL(`${toWebSocketBaseUrl(baseUrl)}/api/terminals/terminal-1/ws`);

    const opened = await new Promise<boolean>((resolve) => {
      const socket = createConnection({
        host: wsUrl.hostname,
        port: Number.parseInt(wsUrl.port, 10),
      });
      let settled = false;
      let responseHead = "";

      const finish = (didOpen: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        socket.destroy();
        resolve(didOpen);
      };

      socket.on("connect", () => {
        socket.write(
          `GET ${wsUrl.pathname} HTTP/1.1\r\nHost: ${wsUrl.host}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nOrigin: https://attacker.example\r\n\r\n`,
        );
      });
      socket.on("data", (chunk) => {
        responseHead += chunk.toString("utf8");
        if (responseHead.includes("101 Switching Protocols")) {
          finish(true);
        }
      });
      socket.on("error", () => finish(false));
      socket.on("close", () => finish(false));
      setTimeout(() => finish(false), 1_000);
    });

    expect(opened).toBe(false);
  });

  it("returns 405 for unsupported methods on /api/terminal-snapshots", async () => {
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/terminal-snapshots`, {
      method: "POST",
    });

    expect(response.status).toBe(405);
  });

  it("sanitizes unexpected internal errors from API responses", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/terminals/%E0%A4%A`, {
      method: "DELETE",
      headers: {
        Accept: "application/json",
      },
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
    });
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });

  it("returns codex usage snapshot for GET /api/codex/usage", async () => {
    const codexSnapshot = {
      status: "ok",
      source: "oauth-api",
      fetchedAt: "2026-02-25T12:00:00.000Z",
      planType: "pro",
      primaryUsedPercent: 12,
      secondaryUsedPercent: 28,
      creditsBalance: 88.5,
      creditsUnlimited: false,
    } as const;

    const baseUrl = await startServer({
      readCodexUsageSnapshot: async () => codexSnapshot,
    });

    const response = await fetch(`${baseUrl}/api/codex/usage`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(codexSnapshot);
  });

  it("returns claude usage snapshot for GET /api/claude/usage", async () => {
    const claudeSnapshot = {
      status: "ok",
      source: "oauth-api",
      fetchedAt: "2026-03-03T12:00:00.000Z",
      planType: "pro",
      primaryUsedPercent: 11,
      primaryResetAt: "2026-03-03T15:00:00.000Z",
      secondaryUsedPercent: 27,
      secondaryResetAt: "2026-03-05T00:00:00.000Z",
      sonnetUsedPercent: 19,
      sonnetResetAt: "2026-03-05T00:00:00.000Z",
    } as const;

    const baseUrl = await startServer({
      readClaudeUsageSnapshot: async () => claudeSnapshot,
    });

    const response = await fetch(`${baseUrl}/api/claude/usage`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(claudeSnapshot);
  });

  it("returns oauth claude usage snapshot for GET /api/claude/usage/oauth", async () => {
    const claudeSnapshot = {
      status: "ok",
      source: "oauth-api",
      fetchedAt: "2026-03-03T12:00:00.000Z",
      primaryUsedPercent: 11,
      secondaryUsedPercent: 27,
    } as const;

    const baseUrl = await startServer({
      readClaudeOauthUsageSnapshot: async () => claudeSnapshot,
    });

    const response = await fetch(`${baseUrl}/api/claude/usage/oauth`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(claudeSnapshot);
  });

  it("returns cli claude usage snapshot for GET /api/claude/usage/cli", async () => {
    const claudeSnapshot = {
      status: "ok",
      source: "cli-pty",
      fetchedAt: "2026-03-03T12:00:00.000Z",
      primaryUsedPercent: 9,
      secondaryUsedPercent: 22,
      sonnetUsedPercent: 14,
    } as const;

    const baseUrl = await startServer({
      readClaudeCliUsageSnapshot: async () => claudeSnapshot,
    });

    const response = await fetch(`${baseUrl}/api/claude/usage/cli`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(claudeSnapshot);
  });

  it("returns github summary for GET /api/github/summary", async () => {
    const githubSummary: GitHubRepoSummarySnapshot = {
      status: "ok",
      fetchedAt: "2026-02-27T12:00:00.000Z",
      source: "gh-cli",
      repo: "hesamsheikh/octogent",
      stargazerCount: 42,
      openIssueCount: 7,
      openPullRequestCount: 3,
      commitsPerDay: [
        { date: "2026-02-25", count: 4 },
        { date: "2026-02-26", count: 6 },
        { date: "2026-02-27", count: 8 },
      ],
      recentCommits: [
        {
          hash: "d8f2d9b7aa9f53f8fa254d8e0f3a13270435e321",
          shortHash: "d8f2d9b",
          subject: "tighten monitor polling backoff strategy",
          authorName: "Hesam Sheikh",
          authorEmail: "hesam@example.com",
          authoredAt: "2026-02-27T10:12:00.000Z",
          body: "Reduce the backoff multiplier from 2x to 1.5x to improve\nresponsiveness when rate limits recover.",
          filesChanged: 3,
          insertions: 42,
          deletions: 7,
        },
      ],
    };

    const baseUrl = await startServer({
      readGithubRepoSummary: async () => githubSummary,
    });

    const response = await fetch(`${baseUrl}/api/github/summary`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(githubSummary);
  });

  it("reports GitHub publishing readiness without publishing", async () => {
    const baseUrl = await startServer({
      readGithubPublishReadiness: async () => ({
        status: "needs_user_remote",
        origin: "https://github.com/hesamsheikh/octogent.git",
        message: "Publishing is blocked until a user-owned remote is configured.",
      }),
    });

    const response = await fetch(`${baseUrl}/api/github/publish-readiness`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "needs_user_remote",
      origin: "https://github.com/hesamsheikh/octogent.git",
      message: "Publishing is blocked until a user-owned remote is configured.",
    });
  });

  it("returns 405 for unsupported methods on /api/codex/usage", async () => {
    const baseUrl = await startServer({
      readCodexUsageSnapshot: async () => ({
        status: "unavailable",
        source: "none",
        fetchedAt: "2026-02-25T12:00:00.000Z",
      }),
    });

    const response = await fetch(`${baseUrl}/api/codex/usage`, {
      method: "POST",
    });

    expect(response.status).toBe(405);
  });

  it("returns 405 for unsupported methods on /api/claude/usage", async () => {
    const baseUrl = await startServer({
      readClaudeUsageSnapshot: async () => ({
        status: "unavailable",
        source: "none",
        fetchedAt: "2026-03-03T12:00:00.000Z",
      }),
    });

    const response = await fetch(`${baseUrl}/api/claude/usage`, {
      method: "POST",
    });

    expect(response.status).toBe(405);
  });

  it("returns 405 for unsupported methods on /api/claude/usage/oauth", async () => {
    const baseUrl = await startServer({
      readClaudeOauthUsageSnapshot: async () => ({
        status: "unavailable",
        source: "none",
        fetchedAt: "2026-03-03T12:00:00.000Z",
      }),
    });

    const response = await fetch(`${baseUrl}/api/claude/usage/oauth`, {
      method: "POST",
    });

    expect(response.status).toBe(405);
  });

  it("returns 405 for unsupported methods on /api/claude/usage/cli", async () => {
    const baseUrl = await startServer({
      readClaudeCliUsageSnapshot: async () => ({
        status: "unavailable",
        source: "none",
        fetchedAt: "2026-03-03T12:00:00.000Z",
      }),
    });

    const response = await fetch(`${baseUrl}/api/claude/usage/cli`, {
      method: "POST",
    });

    expect(response.status).toBe(405);
  });

  it("redacts non-routing query values from API audit records", async () => {
    const baseUrl = await startServer({
      readGithubRepoSummary: async () => ({
        status: "unavailable",
        message: "No GitHub summary needed for this audit test.",
        fetchedAt: "2026-08-05T00:00:00.000Z",
        source: "none",
      }),
    });

    const response = await fetch(
      `${baseUrl}/api/github/summary?scope=project&api_key=should-not-persist&q=private-query`,
    );
    expect(response.status).toBe(200);

    const auditResponse = await fetch(`${baseUrl}/api/audit`);
    const auditPayload = (await auditResponse.json()) as {
      events: Array<{ eventType: string; payload: { path?: string; query?: string } }>;
    };
    expect(auditPayload.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "api.call",
          payload: expect.objectContaining({
            path: "/api/github/summary",
            query: "?scope=project&api_key=[redacted]&q=[redacted]",
          }),
        }),
      ]),
    );
    expect(JSON.stringify(auditPayload)).not.toContain("should-not-persist");
    expect(JSON.stringify(auditPayload)).not.toContain("private-query");
  });

  it("requires explicit confirmation before running the isolated Codex handshake", async () => {
    const successfulHandshake = {
      provider: "codex" as const,
      status: "succeeded" as const,
      checkedAt: "2026-08-05T00:00:00.000Z",
      detail: "Codex returned the expected isolated read-only handshake response.",
    };
    const runCodex = vi.fn(() => successfulHandshake);
    const baseUrl = await startServer({
      providerHandshakeRunner: {
        read: () => ({
          provider: "codex",
          status: "not_run",
          detail: "No provider response check has been run.",
        }),
        runCodex,
      },
    });

    const initialResponse = await fetch(`${baseUrl}/api/providers/codex/handshake`);
    expect(initialResponse.status).toBe(200);
    await expect(initialResponse.json()).resolves.toMatchObject({ status: "not_run" });

    const unconfirmedResponse = await fetch(`${baseUrl}/api/providers/codex/handshake`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(unconfirmedResponse.status).toBe(400);
    expect(runCodex).not.toHaveBeenCalled();

    const confirmedResponse = await fetch(`${baseUrl}/api/providers/codex/handshake`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "RUN_CODEX_READ_ONLY_HANDSHAKE" }),
    });
    expect(confirmedResponse.status).toBe(200);
    await expect(confirmedResponse.json()).resolves.toEqual(successfulHandshake);
    expect(runCodex).toHaveBeenCalledTimes(1);

    const auditResponse = await fetch(`${baseUrl}/api/audit`);
    await expect(auditResponse.json()).resolves.toEqual({
      events: expect.arrayContaining([
        expect.objectContaining({ eventType: "provider_handshake.requested" }),
        expect.objectContaining({
          eventType: "provider_handshake.completed",
          payload: { provider: "codex", status: "succeeded" },
        }),
      ]),
    });
  });

  it("POST /api/hooks/session-start invalidates claude usage cache", async () => {
    let callCount = 0;
    const readClaudeUsageSnapshot = async () => {
      callCount++;
      return {
        status: "ok" as const,
        source: "oauth-api" as const,
        fetchedAt: "2026-03-03T12:00:00.000Z",
        planType: "pro",
        primaryUsedPercent: callCount * 10,
        secondaryUsedPercent: 50,
        sonnetUsedPercent: 30,
      };
    };

    const invalidateCalls: number[] = [];
    const invalidateClaudeUsageCache = () => {
      invalidateCalls.push(Date.now());
    };

    const baseUrl = await startServer({
      readClaudeUsageSnapshot,
      invalidateClaudeUsageCache,
    });

    // First GET — callCount becomes 1
    const first = await fetch(`${baseUrl}/api/claude/usage`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { primaryUsedPercent: number };
    expect(firstBody.primaryUsedPercent).toBe(10);

    // POST hook — should invalidate and warm cache
    const hookResponse = await fetch(`${baseUrl}/api/hooks/session-start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: "test-session" }),
    });
    expect(hookResponse.status).toBe(200);
    expect(invalidateCalls.length).toBe(1);

    // Next GET triggers a fresh read (callCount incremented again)
    const second = await fetch(`${baseUrl}/api/claude/usage`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { primaryUsedPercent: number };
    // callCount > 2 confirms the warm call + this GET both invoked the reader
    expect(secondBody.primaryUsedPercent).toBeGreaterThan(10);
  });

  it("POST /api/hooks/user-prompt-submit auto-renames generated default terminal names", async () => {
    const baseUrl = await startServer();

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });
    expect(createResponse.status).toBe(201);

    const hookResponse = await fetch(
      `${baseUrl}/api/hooks/user-prompt-submit?octogent_session=terminal-1`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "Investigate flaky CI failures" }),
      },
    );
    expect(hookResponse.status).toBe(200);

    const secondHookResponse = await fetch(
      `${baseUrl}/api/hooks/user-prompt-submit?octogent_session=terminal-1`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "Something else later" }),
      },
    );
    expect(secondHookResponse.status).toBe(200);

    const listResponse = await fetch(`${baseUrl}/api/terminal-snapshots`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          terminalId: "terminal-1",
          tentacleName: "Investigate flaky CI failures",
        }),
      ]),
    );
  });

  it("assigns agent identity, scoped access, and audit records", async () => {
    const baseUrl = await startServer();

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Research Worker",
        tentacleId: "research",
        agentProvider: "gemini-cli",
      }),
    });
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as {
      terminalId: string;
      agentIdentity?: Record<string, unknown>;
      accessScope?: { tentacleId: string; allowedPaths: string[]; allowedTools: string[] };
    };
    expect(created.agentIdentity).toEqual(
      expect.objectContaining({
        algorithm: "ed25519",
        createdAt: expect.any(String),
      }),
    );
    expect(created.agentIdentity).not.toHaveProperty("fingerprint");
    expect(created.agentIdentity).not.toHaveProperty("publicKeyPem");
    expect(created.accessScope).toEqual(
      expect.objectContaining({
        tentacleId: "research",
        allowedPaths: expect.arrayContaining([".", ".octogent/tentacles/research"]),
        allowedTools: expect.arrayContaining(["provider:gemini-cli"]),
      }),
    );

    const hookResponse = await fetch(
      `${baseUrl}/api/hooks/user-prompt-submit?octogent_session=${created.terminalId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "Find current K-culture game market signals" }),
      },
    );
    expect(hookResponse.status).toBe(200);

    const toolHookResponse = await fetch(`${baseUrl}/api/hooks/pre-tool-use`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Octogent-Session": created.terminalId,
      },
      body: JSON.stringify({ tool_name: "WebSearch", query: "K-culture casual games" }),
    });
    expect(toolHookResponse.status).toBe(200);

    const auditResponse = await fetch(`${baseUrl}/api/terminals/${created.terminalId}/audit`, {
      headers: { Accept: "application/json" },
    });
    expect(auditResponse.status).toBe(200);
    const auditPayload = (await auditResponse.json()) as {
      events: Array<{
        eventType: string;
        terminalId: string;
        previousHash: string | null;
        hash: string;
        payload: Record<string, unknown>;
      }>;
    };
    expect(auditPayload.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: "terminal.created" }),
        expect.objectContaining({ eventType: "api.call" }),
        expect.objectContaining({ eventType: "query.user_prompt" }),
        expect.objectContaining({ eventType: "tool.pre_use" }),
      ]),
    );
    expect(auditPayload.events[0]).toEqual(
      expect.objectContaining({
        previousHash: null,
      }),
    );
    expect(auditPayload.events.every((event) => !("agentIdentityFingerprint" in event))).toBe(true);
    expect(auditPayload.events.every((event) => event.terminalId === created.terminalId)).toBe(
      true,
    );
    expect(auditPayload.events.every((event) => /^[a-f0-9]{64}$/.test(event.hash))).toBe(true);

    const globalAuditResponse = await fetch(`${baseUrl}/api/audit`, {
      headers: { Accept: "application/json" },
    });
    expect(globalAuditResponse.status).toBe(200);
    const globalAuditPayload = (await globalAuditResponse.json()) as {
      events: Array<{ eventType: string; terminalId?: string }>;
    };
    expect(globalAuditPayload.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: "api.call" }),
        expect.objectContaining({
          eventType: "api.call",
          terminalId: created.terminalId,
        }),
      ]),
    );
  });

  it("stores and searches durable project memory", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    const baseUrl = await startServer({ workspaceCwd });

    const createResponse = await fetch(`${baseUrl}/api/memory`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "decision",
        content: "Use Codex as the execution base and Notion as the project memory.",
        summary: "Codex executes; Notion remembers.",
        tags: ["agentic-os", "memory"],
        source: "operator",
        tentacleId: "business",
      }),
    });
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as {
      id: string;
      type: string;
      content: string;
      tags: string[];
      tentacleId: string;
    };
    expect(created).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^mem-/),
        type: "decision",
        content: expect.stringContaining("Codex"),
        tags: ["agentic-os", "memory"],
        tentacleId: "business",
      }),
    );

    const listResponse = await fetch(`${baseUrl}/api/memory`, {
      headers: { Accept: "application/json" },
    });
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual({
      entries: [expect.objectContaining({ id: created.id })],
    });

    const searchResponse = await fetch(`${baseUrl}/api/memory?query=notion&tentacleId=business`, {
      headers: { Accept: "application/json" },
    });
    expect(searchResponse.status).toBe(200);
    await expect(searchResponse.json()).resolves.toEqual({
      entries: [expect.objectContaining({ id: created.id })],
    });

    const unrelatedSearchResponse = await fetch(`${baseUrl}/api/memory?query=stitch`, {
      headers: { Accept: "application/json" },
    });
    expect(unrelatedSearchResponse.status).toBe(200);
    await expect(unrelatedSearchResponse.json()).resolves.toEqual({ entries: [] });

    expect(
      JSON.parse(readFileSync(join(workspaceCwd, ".octogent", "state", "memory.json"), "utf8")),
    ).toEqual({
      entries: [expect.objectContaining({ id: created.id })],
    });

    const auditResponse = await fetch(`${baseUrl}/api/audit`, {
      headers: { Accept: "application/json" },
    });
    expect(auditResponse.status).toBe(200);
    await expect(auditResponse.json()).resolves.toEqual({
      events: expect.arrayContaining([
        expect.objectContaining({ eventType: "memory.created" }),
        expect.objectContaining({ eventType: "memory.searched" }),
      ]),
    });
  });

  it("redacts common credentials from durable project memory", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    const baseUrl = await startServer({ workspaceCwd });

    const response = await fetch(`${baseUrl}/api/memory`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "handoff",
        content: "Continue with api_key=not-a-real-secret.",
        summary: "Bearer secret-token must not persist.",
        tags: ["access_token=not-a-real-token"],
        source: "refresh_token=not-a-real-refresh-token",
      }),
    });
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        content: "Continue with api_key=[redacted]",
        summary: "Bearer [redacted] must not persist.",
        tags: ["access_token=[redacted]"],
        source: "refresh_token=[redacted]",
      }),
    );
    expect(
      readFileSync(join(workspaceCwd, ".octogent", "state", "memory.json"), "utf8"),
    ).not.toContain("not-a-real-secret");
  });

  it("scrubs legacy credential-like memory records before returning them", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    const stateDirectory = join(workspaceCwd, ".octogent", "state");
    mkdirSync(stateDirectory, { recursive: true });
    writeFileSync(
      join(stateDirectory, "memory.json"),
      `${JSON.stringify({
        entries: [
          {
            id: "mem-legacy",
            type: "note",
            content: "Legacy bearer secret-token should be removed.",
            tags: [],
            source: "record-center",
            createdAt: "2026-08-04T00:00:00.000Z",
            updatedAt: "2026-08-04T00:00:00.000Z",
          },
        ],
      })}\n`,
      "utf8",
    );
    const baseUrl = await startServer({ workspaceCwd });

    const response = await fetch(`${baseUrl}/api/memory`);
    await expect(response.json()).resolves.toEqual({
      entries: [
        expect.objectContaining({ content: "Legacy Bearer [redacted] should be removed." }),
      ],
    });
    expect(readFileSync(join(stateDirectory, "memory.json"), "utf8")).not.toContain("secret-token");
  });

  it("exposes autonomous operating skills as always-on capabilities", async () => {
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/autonomous-skills`, {
      headers: { Accept: "application/json" },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      skills: expect.arrayContaining([
        expect.objectContaining({
          id: "memory-management",
          alwaysOn: true,
          title: "Memory Management",
        }),
        expect.objectContaining({
          id: "workflow-orchestration",
          alwaysOn: true,
        }),
        expect.objectContaining({
          id: "security-guardrails",
          alwaysOn: true,
        }),
        expect.objectContaining({
          id: "production-app-security",
          alwaysOn: true,
          title: "Production App Security",
        }),
        expect.objectContaining({
          id: "openspace-skill-evolution",
          alwaysOn: true,
          title: "OpenSpace Skill Evolution",
        }),
        expect.objectContaining({
          id: "video-backed-skill-mining",
          alwaysOn: true,
          title: "Video-backed Skill Mining",
        }),
        expect.objectContaining({
          id: "parallel-codebase-recon",
          alwaysOn: true,
        }),
        expect.objectContaining({
          id: "multi-perspective-review-council",
          alwaysOn: true,
        }),
        expect.objectContaining({
          id: "ui-ux-production-system",
          alwaysOn: true,
        }),
        expect.objectContaining({
          id: "business-automation-operator",
          alwaysOn: true,
        }),
        expect.objectContaining({
          id: "inside-out-outbound-system",
          alwaysOn: true,
          title: "Inside-out Outbound System",
        }),
        expect.objectContaining({
          id: "browser-control-harness",
          alwaysOn: true,
        }),
        expect.objectContaining({
          id: "persistent-second-brain",
          alwaysOn: true,
          instructions: expect.arrayContaining([
            expect.stringContaining("octogent agent memory search"),
          ]),
        }),
        expect.objectContaining({
          id: "content-production-pipeline",
          alwaysOn: true,
        }),
        expect.objectContaining({
          id: "prompt-operating-system",
          alwaysOn: true,
        }),
        expect.objectContaining({
          id: "cross-model-collaboration",
          alwaysOn: true,
        }),
        expect.objectContaining({
          id: "rag-research-system",
          alwaysOn: true,
        }),
        expect.objectContaining({
          id: "token-budget-control",
          alwaysOn: true,
        }),
        expect.objectContaining({
          id: "local-free-model-lab",
          alwaysOn: true,
        }),
        expect.objectContaining({
          id: "developer-tool-interop",
          alwaysOn: true,
        }),
        expect.objectContaining({
          id: "brand-voice-and-persona",
          alwaysOn: true,
        }),
        expect.objectContaining({
          id: "motion-and-web-experience",
          alwaysOn: true,
        }),
        expect.objectContaining({
          id: "startup-business-story",
          alwaysOn: true,
        }),
        expect.objectContaining({
          id: "agentic-os-architecture",
          alwaysOn: true,
        }),
      ]),
    });

    const auditResponse = await fetch(`${baseUrl}/api/audit`, {
      headers: { Accept: "application/json" },
    });
    expect(auditResponse.status).toBe(200);
    await expect(auditResponse.json()).resolves.toEqual({
      events: expect.arrayContaining([
        expect.objectContaining({ eventType: "autonomous_skills.loaded" }),
      ]),
    });
  });

  it("stores runtime goals and evaluates policy decisions", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    const baseUrl = await startServer({ workspaceCwd });

    const createGoalResponse = await fetch(`${baseUrl}/api/goals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Ship policy-driven agent runtime",
        description: "Move Octogent from prompt-only behavior to explicit runtime goals.",
        priority: "high",
        ownerAgentId: "codex-executor",
        successCriteria: ["Goals are durable", "Policies are evaluated before risky actions"],
        constraints: ["Do not expose public fingerprints"],
      }),
    });
    expect(createGoalResponse.status).toBe(201);
    const goal = (await createGoalResponse.json()) as { id: string; status: string };
    expect(goal).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^goal-/),
        status: "planned",
        ownerAgentId: "codex-executor",
        tentacleId: "game-business",
      }),
    );

    const listGoalsResponse = await fetch(`${baseUrl}/api/goals?tentacleId=game-business`, {
      headers: { Accept: "application/json" },
    });
    expect(listGoalsResponse.status).toBe(200);
    await expect(listGoalsResponse.json()).resolves.toEqual({
      goals: [expect.objectContaining({ id: goal.id })],
    });

    const updateGoalResponse = await fetch(`${baseUrl}/api/goals/${goal.id}`, {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "active" }),
    });
    expect(updateGoalResponse.status).toBe(200);
    await expect(updateGoalResponse.json()).resolves.toEqual(
      expect.objectContaining({ id: goal.id, status: "active" }),
    );

    const incompleteCompletionResponse = await fetch(`${baseUrl}/api/goals/${goal.id}`, {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "completed" }),
    });
    expect(incompleteCompletionResponse.status).toBe(400);
    await expect(incompleteCompletionResponse.json()).resolves.toEqual({
      error: "Completion requires at least one evidence item.",
    });

    const completedGoalResponse = await fetch(`${baseUrl}/api/goals/${goal.id}`, {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "completed", evidence: ["API regression passed"] }),
    });
    expect(completedGoalResponse.status).toBe(200);
    await expect(completedGoalResponse.json()).resolves.toEqual(
      expect.objectContaining({
        id: goal.id,
        status: "completed",
        evidence: ["API regression passed"],
      }),
    );

    const invalidOwnerResponse = await fetch(`${baseUrl}/api/goals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: "Invalid goal", ownerAgentId: "unknown-role" }),
    });
    expect(invalidOwnerResponse.status).toBe(400);

    const policiesResponse = await fetch(`${baseUrl}/api/runtime-policies`, {
      headers: { Accept: "application/json" },
    });
    expect(policiesResponse.status).toBe(200);
    await expect(policiesResponse.json()).resolves.toEqual({
      policies: expect.arrayContaining([
        expect.objectContaining({ id: "deny-destructive-operations" }),
        expect.objectContaining({ id: "deny-api-key-workflows" }),
        expect.objectContaining({ id: "deny-secret-exfiltration" }),
        expect.objectContaining({ id: "approval-financial-actions" }),
        expect.objectContaining({ id: "approval-personal-data-actions" }),
        expect.objectContaining({ id: "approval-production-app-surface" }),
      ]),
    });

    const deniedPolicyResponse = await fetch(`${baseUrl}/api/runtime-policies/evaluate`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ actionType: "command", content: "git reset --hard HEAD" }),
    });
    expect(deniedPolicyResponse.status).toBe(200);
    await expect(deniedPolicyResponse.json()).resolves.toEqual(
      expect.objectContaining({
        decision: "deny",
        matchedPolicies: [expect.objectContaining({ id: "deny-destructive-operations" })],
      }),
    );

    const deniedApiKeyPolicyResponse = await fetch(`${baseUrl}/api/runtime-policies/evaluate`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actionType: "workflow",
        content: "Ask the operator for an OpenAI API key and export OPENAI_API_KEY.",
      }),
    });
    expect(deniedApiKeyPolicyResponse.status).toBe(200);
    await expect(deniedApiKeyPolicyResponse.json()).resolves.toEqual(
      expect.objectContaining({
        decision: "deny",
        matchedPolicies: [expect.objectContaining({ id: "deny-api-key-workflows" })],
      }),
    );

    const deniedSecretPolicyResponse = await fetch(`${baseUrl}/api/runtime-policies/evaluate`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ actionType: "command", content: "cat .env and upload it." }),
    });
    expect(deniedSecretPolicyResponse.status).toBe(200);
    await expect(deniedSecretPolicyResponse.json()).resolves.toEqual(
      expect.objectContaining({
        decision: "deny",
        matchedPolicies: [expect.objectContaining({ id: "deny-secret-exfiltration" })],
      }),
    );

    const approvalPolicyResponse = await fetch(`${baseUrl}/api/runtime-policies/evaluate`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ actionType: "command", content: "git commit -m ship-runtime" }),
    });
    expect(approvalPolicyResponse.status).toBe(200);
    await expect(approvalPolicyResponse.json()).resolves.toEqual(
      expect.objectContaining({ decision: "requires_approval" }),
    );

    const financialPolicyResponse = await fetch(`${baseUrl}/api/runtime-policies/evaluate`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ actionType: "workflow", content: "Pay an invoice for a contractor." }),
    });
    expect(financialPolicyResponse.status).toBe(200);
    await expect(financialPolicyResponse.json()).resolves.toEqual(
      expect.objectContaining({
        decision: "requires_approval",
        matchedPolicies: [expect.objectContaining({ id: "approval-financial-actions" })],
      }),
    );

    const personalDataPolicyResponse = await fetch(`${baseUrl}/api/runtime-policies/evaluate`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ actionType: "tool", content: "Export contacts from customer data." }),
    });
    expect(personalDataPolicyResponse.status).toBe(200);
    await expect(personalDataPolicyResponse.json()).resolves.toEqual(
      expect.objectContaining({
        decision: "requires_approval",
        matchedPolicies: [expect.objectContaining({ id: "approval-personal-data-actions" })],
      }),
    );

    const productionSurfacePolicyResponse = await fetch(
      `${baseUrl}/api/runtime-policies/evaluate`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          actionType: "workflow",
          content: "Enable public file uploads for the production app.",
        }),
      },
    );
    expect(productionSurfacePolicyResponse.status).toBe(200);
    await expect(productionSurfacePolicyResponse.json()).resolves.toEqual(
      expect.objectContaining({
        decision: "requires_approval",
        matchedPolicies: [expect.objectContaining({ id: "approval-production-app-surface" })],
      }),
    );

    const auditResponse = await fetch(`${baseUrl}/api/audit`, {
      headers: { Accept: "application/json" },
    });
    expect(auditResponse.status).toBe(200);
    await expect(auditResponse.json()).resolves.toEqual({
      events: expect.arrayContaining([
        expect.objectContaining({ eventType: "goal.created" }),
        expect.objectContaining({ eventType: "goal.status_changed" }),
        expect.objectContaining({ eventType: "runtime_policies.loaded" }),
        expect.objectContaining({ eventType: "runtime_policy.evaluated" }),
      ]),
    });
  });

  it("registers policy-aware workflow runs and preserves approval decisions", async () => {
    const baseUrl = await startServer();

    const listResponse = await fetch(`${baseUrl}/api/workflows`, {
      headers: { Accept: "application/json" },
    });
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual({
      workflows: expect.arrayContaining([
        expect.objectContaining({
          id: "workflow-game-qa-balance",
          automationLevel: "autonomous",
          status: "active",
        }),
      ]),
      runs: [],
    });

    const safeRunResponse = await fetch(`${baseUrl}/api/workflows/workflow-game-qa-balance/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initiatedBy: "operator" }),
    });
    expect(safeRunResponse.status).toBe(201);
    await expect(safeRunResponse.json()).resolves.toEqual(
      expect.objectContaining({
        status: "queued",
        policy: expect.objectContaining({ decision: "allow" }),
      }),
    );

    const createResponse = await fetch(`${baseUrl}/api/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Purchase a campaign",
        ownerAgentId: "marketing-council",
        automationLevel: "autonomous",
        actionType: "workflow",
        actionContent: "Purchase paid advertising for the game.",
      }),
    });
    expect(createResponse.status).toBe(201);
    const protectedWorkflow = (await createResponse.json()) as { id: string; status: string };
    expect(protectedWorkflow.status).toBe("draft");

    const activateResponse = await fetch(`${baseUrl}/api/workflows/${protectedWorkflow.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });
    expect(activateResponse.status).toBe(200);

    const protectedRunResponse = await fetch(
      `${baseUrl}/api/workflows/${protectedWorkflow.id}/runs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initiatedBy: "operator" }),
      },
    );
    expect(protectedRunResponse.status).toBe(201);
    const protectedRun = (await protectedRunResponse.json()) as { id: string; status: string };
    expect(protectedRun.status).toBe("awaiting_approval");

    const publicUploadWorkflowResponse = await fetch(`${baseUrl}/api/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Enable public file uploads",
        ownerAgentId: "codex-executor",
        automationLevel: "autonomous",
        actionType: "workflow",
        actionContent: "Enable public file uploads for the production app.",
      }),
    });
    expect(publicUploadWorkflowResponse.status).toBe(201);
    const publicUploadWorkflow = (await publicUploadWorkflowResponse.json()) as { id: string };
    await fetch(`${baseUrl}/api/workflows/${publicUploadWorkflow.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });
    const publicUploadRunResponse = await fetch(
      `${baseUrl}/api/workflows/${publicUploadWorkflow.id}/runs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initiatedBy: "operator" }),
      },
    );
    expect(publicUploadRunResponse.status).toBe(201);
    await expect(publicUploadRunResponse.json()).resolves.toEqual(
      expect.objectContaining({
        status: "awaiting_approval",
        policy: expect.objectContaining({
          decision: "requires_approval",
          matchedGlobalPolicyIds: expect.arrayContaining(["approval-production-app-surface"]),
        }),
      }),
    );

    const approveResponse = await fetch(
      `${baseUrl}/api/workflows/${protectedWorkflow.id}/runs/${protectedRun.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approved", note: "Approved for a defined test." }),
      },
    );
    expect(approveResponse.status).toBe(200);
    await expect(approveResponse.json()).resolves.toEqual(
      expect.objectContaining({
        status: "queued",
        approval: expect.objectContaining({ decision: "approved" }),
      }),
    );

    const deniedWorkflowResponse = await fetch(`${baseUrl}/api/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Unsafe cleanup",
        ownerAgentId: "codex-executor",
        automationLevel: "autonomous",
        actionType: "workflow",
        actionContent: "Run rm -rf on the project directory.",
      }),
    });
    const deniedWorkflow = (await deniedWorkflowResponse.json()) as { id: string };
    await fetch(`${baseUrl}/api/workflows/${deniedWorkflow.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });
    const deniedRunResponse = await fetch(`${baseUrl}/api/workflows/${deniedWorkflow.id}/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initiatedBy: "operator" }),
    });
    expect(deniedRunResponse.status).toBe(201);
    await expect(deniedRunResponse.json()).resolves.toEqual(
      expect.objectContaining({
        status: "denied",
        policy: expect.objectContaining({ decision: "deny" }),
      }),
    );
  });

  it("links a goal to compatible workflow runs and prevents duplicate unfinished work", async () => {
    const baseUrl = await startServer();
    const goalResponse = await fetch(`${baseUrl}/api/goals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Verify the current Block Bounce build",
        ownerAgentId: "codex-executor",
        successCriteria: ["Approved checks are recorded"],
      }),
    });
    const goal = (await goalResponse.json()) as { id: string };
    expect(goalResponse.status).toBe(201);

    const workflowResponse = await fetch(`${baseUrl}/api/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Goal-linked QA",
        ownerAgentId: "codex-executor",
        actionType: "test",
        actionContent: "Run the approved local game checks.",
        goalId: goal.id,
      }),
    });
    expect(workflowResponse.status).toBe(201);
    const workflow = (await workflowResponse.json()) as { id: string; goalId?: string };
    expect(workflow.goalId).toBe(goal.id);

    const activateResponse = await fetch(`${baseUrl}/api/workflows/${workflow.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });
    expect(activateResponse.status).toBe(200);

    const queueResponse = await fetch(`${baseUrl}/api/workflows/${workflow.id}/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initiatedBy: "operator", goalId: goal.id }),
    });
    expect(queueResponse.status).toBe(201);
    await expect(queueResponse.json()).resolves.toEqual(
      expect.objectContaining({ workflowId: workflow.id, goalId: goal.id, status: "queued" }),
    );

    const duplicateQueueResponse = await fetch(`${baseUrl}/api/workflows/${workflow.id}/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initiatedBy: "operator", goalId: goal.id }),
    });
    expect(duplicateQueueResponse.status).toBe(409);
    await expect(duplicateQueueResponse.json()).resolves.toEqual({
      error: "This goal already has an unfinished workflow run.",
    });

    const invalidLinkResponse = await fetch(`${baseUrl}/api/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Invalid linked workflow",
        ownerAgentId: "codex-executor",
        actionType: "test",
        actionContent: "Run checks.",
        goalId: "goal-missing",
      }),
    });
    expect(invalidLinkResponse.status).toBe(400);
  });

  it("claims a queued run when exactly one manifest-scoped worker is eligible", async () => {
    const baseUrl = await startServer();

    const runResponse = await fetch(`${baseUrl}/api/workflows/workflow-game-qa-balance/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initiatedBy: "operator" }),
    });
    const run = (await runResponse.json()) as { id: string; status: string };
    expect(run.status).toBe("queued");

    const unrelatedTerminalResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        terminalId: "unrelated-claude-worker",
        tentacleId: "game-business",
        name: "Unrelated Claude worker",
        workspaceMode: "worktree",
        agentProvider: "claude-code",
      }),
    });
    expect(unrelatedTerminalResponse.status).toBe(201);

    const eligibleTerminalResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        terminalId: "single-codex-worker",
        agentId: "codex-executor",
        tentacleId: "game-business",
        name: "Single Codex worker",
        workspaceMode: "worktree",
        agentProvider: "codex",
      }),
    });
    expect(eligibleTerminalResponse.status).toBe(201);

    spawnMock.mockReturnValue(createFakePty(702));
    const startResponse = await fetch(`${baseUrl}/api/terminals/single-codex-worker/start`, {
      method: "POST",
      headers: { Accept: "application/json" },
    });
    expect(startResponse.status).toBe(200);

    const claimResponse = await fetch(
      `${baseUrl}/api/workflows/workflow-game-qa-balance/runs/${run.id}/claim`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectSingleEligibleWorker: true }),
      },
    );
    expect(claimResponse.status).toBe(200);
    await expect(claimResponse.json()).resolves.toEqual(
      expect.objectContaining({
        status: "running",
        execution: expect.objectContaining({ terminalId: "single-codex-worker" }),
      }),
    );
  });

  it("does not select a prepared role terminal before its provider shell has started", async () => {
    const baseUrl = await startServer();

    const runResponse = await fetch(`${baseUrl}/api/workflows/workflow-game-qa-balance/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initiatedBy: "operator" }),
    });
    const run = (await runResponse.json()) as { id: string; status: string };

    const terminalResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        terminalId: "prepared-codex-worker",
        agentId: "codex-executor",
        tentacleId: "game-business",
        name: "Prepared Codex worker",
        workspaceMode: "worktree",
        agentProvider: "codex",
      }),
    });
    expect(terminalResponse.status).toBe(201);

    const claimResponse = await fetch(
      `${baseUrl}/api/workflows/workflow-game-qa-balance/runs/${run.id}/claim`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectSingleEligibleWorker: true }),
      },
    );
    expect(claimResponse.status).toBe(409);
    await expect(claimResponse.json()).resolves.toEqual(
      expect.objectContaining({
        error: "No eligible worker is available to claim this workflow run.",
      }),
    );
  });

  it("claims queued workflow runs only through a matching manifest-scoped terminal", async () => {
    const baseUrl = await startServer();

    const runResponse = await fetch(`${baseUrl}/api/workflows/workflow-game-qa-balance/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initiatedBy: "scheduler" }),
    });
    expect(runResponse.status).toBe(201);
    const run = (await runResponse.json()) as { id: string; status: string };
    expect(run.status).toBe("queued");

    const wrongTerminalResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        terminalId: "wrong-workflow-worker",
        tentacleId: "game-business",
        name: "Wrong provider worker",
        workspaceMode: "worktree",
        agentProvider: "claude-code",
      }),
    });
    expect(wrongTerminalResponse.status).toBe(201);

    const rejectedClaimResponse = await fetch(
      `${baseUrl}/api/workflows/workflow-game-qa-balance/runs/${run.id}/claim`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terminalId: "wrong-workflow-worker" }),
      },
    );
    expect(rejectedClaimResponse.status).toBe(409);

    const impersonatingTerminalResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        terminalId: "unbound-codex-worker",
        tentacleId: "game-business",
        name: "Unbound Codex worker",
        workspaceMode: "worktree",
        agentProvider: "codex",
      }),
    });
    expect(impersonatingTerminalResponse.status).toBe(201);

    const impersonatingClaimResponse = await fetch(
      `${baseUrl}/api/workflows/workflow-game-qa-balance/runs/${run.id}/claim`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terminalId: "unbound-codex-worker" }),
      },
    );
    expect(impersonatingClaimResponse.status).toBe(409);
    await expect(impersonatingClaimResponse.json()).resolves.toEqual({
      error: "Terminal identity does not match the workflow owner role.",
    });

    const workerResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        terminalId: "game-qa-worker",
        agentId: "codex-executor",
        tentacleId: "game-business",
        name: "Game QA worker",
        workspaceMode: "worktree",
        agentProvider: "codex",
      }),
    });
    expect(workerResponse.status).toBe(201);

    spawnMock.mockReturnValue(createFakePty(703));
    const startResponse = await fetch(`${baseUrl}/api/terminals/game-qa-worker/start`, {
      method: "POST",
      headers: { Accept: "application/json" },
    });
    expect(startResponse.status).toBe(200);

    const claimResponse = await fetch(
      `${baseUrl}/api/workflows/workflow-game-qa-balance/runs/${run.id}/claim`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terminalId: "game-qa-worker" }),
      },
    );
    expect(claimResponse.status).toBe(200);
    await expect(claimResponse.json()).resolves.toEqual(
      expect.objectContaining({
        status: "running",
        execution: expect.objectContaining({
          terminalId: "game-qa-worker",
          agentId: "codex-executor",
          claimedBy: "runtime-worker",
        }),
      }),
    );

    const duplicateClaimResponse = await fetch(
      `${baseUrl}/api/workflows/workflow-game-qa-balance/runs/${run.id}/claim`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terminalId: "game-qa-worker" }),
      },
    );
    expect(duplicateClaimResponse.status).toBe(409);

    const outcomeResponse = await fetch(
      `${baseUrl}/api/workflows/workflow-game-qa-balance/runs/${run.id}/outcome`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "succeeded",
          summary: "Local QA completed with an api_key=not-for-record value in a raw command log.",
          evidence: [
            {
              kind: "test",
              summary: "13 engine tests passed.",
              occurredAt: "2026-08-03T00:00:00.000Z",
            },
          ],
        }),
      },
    );
    expect(outcomeResponse.status).toBe(200);
    await expect(outcomeResponse.json()).resolves.toEqual(
      expect.objectContaining({
        status: "succeeded",
        outcome: expect.objectContaining({
          summary: expect.stringContaining("api_key=[redacted]"),
          evidence: [expect.objectContaining({ kind: "test", summary: "13 engine tests passed." })],
        }),
      }),
    );

    const duplicateOutcomeResponse = await fetch(
      `${baseUrl}/api/workflows/workflow-game-qa-balance/runs/${run.id}/outcome`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "failed", summary: "Should not overwrite a finished run." }),
      },
    );
    expect(duplicateOutcomeResponse.status).toBe(409);

    const auditResponse = await fetch(`${baseUrl}/api/audit`);
    expect(auditResponse.status).toBe(200);
    await expect(auditResponse.json()).resolves.toEqual({
      events: expect.arrayContaining([
        expect.objectContaining({
          eventType: "workflow.run_claimed",
          terminalId: "game-qa-worker",
        }),
        expect.objectContaining({ eventType: "workflow.run_claim_rejected" }),
        expect.objectContaining({
          eventType: "workflow.run_outcome_recorded",
          terminalId: "game-qa-worker",
        }),
        expect.objectContaining({ eventType: "workflow.run_outcome_rejected" }),
      ]),
    });
  });

  it("POST /api/hooks/user-prompt-submit preserves explicit terminal names", async () => {
    const baseUrl = await startServer();

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "reviewer" }),
    });
    expect(createResponse.status).toBe(201);

    const hookResponse = await fetch(
      `${baseUrl}/api/hooks/user-prompt-submit?octogent_session=terminal-1`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "Investigate flaky CI failures" }),
      },
    );
    expect(hookResponse.status).toBe(200);

    const listResponse = await fetch(`${baseUrl}/api/terminal-snapshots`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          terminalId: "terminal-1",
          tentacleName: "reviewer",
        }),
      ]),
    );
  });

  it("infers generated terminal names from older registry entries", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    const registryPath = join(workspaceCwd, ".octogent", "state", "tentacles.json");
    mkdirSync(join(workspaceCwd, ".octogent", "state"), { recursive: true });
    writeFileSync(
      registryPath,
      `${JSON.stringify(
        {
          version: 3,
          terminals: [
            {
              terminalId: "terminal-1",
              tentacleId: "terminal-1",
              tentacleName: "Octogent Terminal 1",
              createdAt: "2026-04-10T10:00:00.000Z",
              workspaceMode: "shared",
            },
          ],
          uiState: {},
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const baseUrl = await startServer({ workspaceCwd });

    const hookResponse = await fetch(
      `${baseUrl}/api/hooks/user-prompt-submit?octogent_session=terminal-1`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "Investigate flaky CI failures" }),
      },
    );
    expect(hookResponse.status).toBe(200);

    const listResponse = await fetch(`${baseUrl}/api/terminal-snapshots`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          terminalId: "terminal-1",
          tentacleName: "Investigate flaky CI failures",
        }),
      ]),
    );
  });

  it("returns 405 for unsupported methods on /api/github/summary", async () => {
    const baseUrl = await startServer({
      readGithubRepoSummary: async () => ({
        status: "unavailable",
        fetchedAt: "2026-02-27T12:00:00.000Z",
        source: "none",
        message: "GitHub CLI not available.",
      }),
    });

    const response = await fetch(`${baseUrl}/api/github/summary`, {
      method: "POST",
    });

    expect(response.status).toBe(405);
  });

  it("returns 405 for unsupported methods on /api/ui-state", async () => {
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/ui-state`, {
      method: "POST",
    });

    expect(response.status).toBe(405);
  });

  it("reports file-backed workspace setup status and updates it through setup actions", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    const baseUrl = await startServer({ workspaceCwd });

    const initialResponse = await fetch(`${baseUrl}/api/setup`, {
      headers: { Accept: "application/json" },
    });
    expect(initialResponse.status).toBe(200);
    const initialPayload = (await initialResponse.json()) as {
      isFirstRun: boolean;
      shouldShowSetupCard: boolean;
      hasAnyTentacles: boolean;
      steps: Array<{ id: string; complete: boolean }>;
      agenticOs: {
        brains: Array<{ id: string; label: string; role: string; command: string; status: string }>;
      };
    };
    expect(existsSync(join(workspaceCwd, ".octogent"))).toBe(false);
    expect(existsSync(join(workspaceCwd, ".gitignore"))).toBe(false);
    expect(initialPayload.isFirstRun).toBe(true);
    expect(initialPayload.shouldShowSetupCard).toBe(true);
    expect(initialPayload.hasAnyTentacles).toBe(false);
    expect(initialPayload.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "initialize-workspace", complete: false }),
        expect.objectContaining({ id: "ensure-gitignore", complete: false }),
        expect.objectContaining({ id: "create-tentacles", complete: false }),
      ]),
    );
    expect(initialPayload.agenticOs.brains).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "codex",
          label: "Codex",
          role: expect.stringContaining("Execution engine"),
          command: "codex",
        }),
        expect.objectContaining({
          id: "notion",
          label: "Notion",
          command: "OCTOGENT_NOTION_COMMAND",
        }),
        expect.objectContaining({
          id: "stitch",
          label: "Google Stitch",
          command: "OCTOGENT_STITCH_COMMAND",
        }),
      ]),
    );

    const initializeResponse = await fetch(`${baseUrl}/api/setup/steps/initialize-workspace`, {
      method: "POST",
      headers: { Accept: "application/json" },
    });
    expect(initializeResponse.status).toBe(200);
    expect(existsSync(join(workspaceCwd, ".octogent", "project.json"))).toBe(true);
    expect(existsSync(join(workspaceCwd, ".octogent", "tentacles"))).toBe(true);
    expect(existsSync(join(workspaceCwd, ".octogent", "worktrees"))).toBe(true);

    const gitignoreResponse = await fetch(`${baseUrl}/api/setup/steps/ensure-gitignore`, {
      method: "POST",
      headers: { Accept: "application/json" },
    });
    expect(gitignoreResponse.status).toBe(200);
    expect(readFileSync(join(workspaceCwd, ".gitignore"), "utf8")).toContain(".octogent");

    const createTentacleResponse = await fetch(`${baseUrl}/api/deck/tentacles`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "docs",
        description: "Docs and guides",
      }),
    });
    expect(createTentacleResponse.status).toBe(201);

    const finalResponse = await fetch(`${baseUrl}/api/setup`, {
      headers: { Accept: "application/json" },
    });
    expect(finalResponse.status).toBe(200);
    const finalPayload = (await finalResponse.json()) as {
      isFirstRun: boolean;
      hasAnyTentacles: boolean;
      tentacleCount: number;
      steps: Array<{ id: string; complete: boolean }>;
    };
    expect(finalPayload.isFirstRun).toBe(false);
    expect(finalPayload.hasAnyTentacles).toBe(true);
    expect(finalPayload.tentacleCount).toBe(1);
    expect(finalPayload.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "initialize-workspace", complete: true }),
        expect.objectContaining({ id: "ensure-gitignore", complete: true }),
        expect.objectContaining({ id: "create-tentacles", complete: true }),
      ]),
    );
  }, 15_000);

  it("returns 413 when create tentacle body exceeds size limit", async () => {
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "x".repeat(1024 * 1024 + 1),
      }),
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "Request body too large.",
    });
  });

  it("returns 413 when ui-state patch body exceeds size limit", async () => {
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/ui-state`, {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        minimizedTerminalIds: ["terminal-1"],
        blob: "x".repeat(1024 * 1024 + 1),
      }),
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "Request body too large.",
    });
  });

  it("lists Claude skills from the project skills folder", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    const projectSkillDir = join(workspaceCwd, ".claude", "skills", "docs-writer");
    mkdirSync(projectSkillDir, { recursive: true });
    writeFileSync(
      join(projectSkillDir, "SKILL.md"),
      [
        "---",
        "name: docs-writer",
        "description: Helps keep docs aligned with product changes.",
        "---",
        "",
        "# Docs Writer",
        "",
        "Writes and updates docs.",
        "",
      ].join("\n"),
      "utf8",
    );

    const baseUrl = await startServer({ workspaceCwd });
    const response = await fetch(`${baseUrl}/api/deck/skills`, {
      headers: { Accept: "application/json" },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "docs-writer",
          description: "Helps keep docs aligned with product changes.",
          source: "project",
        }),
      ]),
    );
  });

  it("ignores a root project skills SKILL.md file and only lists folder-based skills", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    const skillsDir = join(workspaceCwd, ".claude", "skills");
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(
      join(skillsDir, "SKILL.md"),
      [
        "---",
        "name: not-a-real-skill",
        "description: Should not be listed.",
        "---",
        "",
        "# Root Marker",
        "",
      ].join("\n"),
      "utf8",
    );
    mkdirSync(join(skillsDir, "docs-writer"), { recursive: true });
    writeFileSync(
      join(skillsDir, "docs-writer", "SKILL.md"),
      [
        "---",
        "name: docs-writer",
        "description: Helps keep docs aligned with product changes.",
        "---",
        "",
      ].join("\n"),
      "utf8",
    );

    const baseUrl = await startServer({ workspaceCwd });
    const response = await fetch(`${baseUrl}/api/deck/skills`, {
      headers: { Accept: "application/json" },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      {
        name: "docs-writer",
        description: "Helps keep docs aligned with product changes.",
        source: "project",
      },
    ]);
  });

  it("creates tentacles with suggested skills and appends the managed context block", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    const baseUrl = await startServer({ workspaceCwd });

    const response = await fetch(`${baseUrl}/api/deck/tentacles`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "docs",
        description: "Docs and guides",
        suggestedSkills: ["release-helper", "docs-writer"],
      }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        tentacleId: "docs",
        suggestedSkills: ["docs-writer", "release-helper"],
      }),
    );

    const context = readFileSync(
      join(workspaceCwd, ".octogent", "tentacles", "docs", "CONTEXT.md"),
      "utf8",
    );
    expect(context).toContain("## Suggested Skills");
    expect(context).toContain("You can use these skills if you need to.");
    expect(context).toContain("- `docs-writer`");
    expect(context).toContain("- `release-helper`");

    const listResponse = await fetch(`${baseUrl}/api/deck/tentacles`, {
      headers: { Accept: "application/json" },
    });
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tentacleId: "docs",
          suggestedSkills: ["docs-writer", "release-helper"],
        }),
      ]),
    );
  });

  it("updates tentacle suggested skills and removes the managed context block when cleared", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    const baseUrl = await startServer({ workspaceCwd });

    const createResponse = await fetch(`${baseUrl}/api/deck/tentacles`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "docs",
        description: "Docs and guides",
      }),
    });
    expect(createResponse.status).toBe(201);

    const updateResponse = await fetch(`${baseUrl}/api/deck/tentacles/docs/skills`, {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        suggestedSkills: ["code-review-specialist"],
      }),
    });

    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toEqual(
      expect.objectContaining({
        tentacleId: "docs",
        suggestedSkills: ["code-review-specialist"],
      }),
    );

    const contextPath = join(workspaceCwd, ".octogent", "tentacles", "docs", "CONTEXT.md");
    expect(readFileSync(contextPath, "utf8")).toContain("- `code-review-specialist`");

    const clearResponse = await fetch(`${baseUrl}/api/deck/tentacles/docs/skills`, {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        suggestedSkills: [],
      }),
    });

    expect(clearResponse.status).toBe(200);
    await expect(clearResponse.json()).resolves.toEqual(
      expect.objectContaining({
        tentacleId: "docs",
        suggestedSkills: [],
      }),
    );
    expect(readFileSync(contextPath, "utf8")).not.toContain("## Suggested Skills");
    expect(readFileSync(contextPath, "utf8")).not.toContain("octogent:suggested-skills:start");
  });

  it("returns 400 for unsupported tentacle completion sound values", async () => {
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/ui-state`, {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        terminalCompletionSound: "laser-zap",
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "terminalCompletionSound must be one of the supported sound identifiers.",
    });
  });

  it("restores ui state across API restarts using persisted registry", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);

    const firstBaseUrl = await startServer({
      workspaceCwd,
    });

    const createResponse = await fetch(`${firstBaseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });
    expect(createResponse.status).toBe(201);

    const patchResponse = await fetch(`${firstBaseUrl}/api/ui-state`, {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        isAgentsSidebarVisible: false,
        sidebarWidth: 380,
        isActiveAgentsSectionExpanded: false,
        isRuntimeStatusStripVisible: false,
        isMonitorVisible: false,
        isBottomTelemetryVisible: false,
        isCodexUsageVisible: false,
        isClaudeUsageVisible: false,
        isClaudeUsageSectionExpanded: false,
        isCodexUsageSectionExpanded: false,
        terminalCompletionSound: "double-beep",
        minimizedTerminalIds: ["terminal-1"],
        terminalWidths: {
          "terminal-1": 420,
        },
      }),
    });
    expect(patchResponse.status).toBe(200);
    await expect(patchResponse.json()).resolves.toEqual({
      isAgentsSidebarVisible: false,
      sidebarWidth: 380,
      isActiveAgentsSectionExpanded: false,
      isRuntimeStatusStripVisible: false,
      isMonitorVisible: false,
      isBottomTelemetryVisible: false,
      isCodexUsageVisible: false,
      isClaudeUsageVisible: false,
      isClaudeUsageSectionExpanded: false,
      isCodexUsageSectionExpanded: false,
      terminalCompletionSound: "double-beep",
      minimizedTerminalIds: ["terminal-1"],
      terminalWidths: {
        "terminal-1": 420,
      },
    });

    if (stopServer) {
      await stopServer();
      stopServer = null;
    }

    const secondBaseUrl = await startServer({
      workspaceCwd,
    });

    const getResponse = await fetch(`${secondBaseUrl}/api/ui-state`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toEqual({
      isAgentsSidebarVisible: false,
      sidebarWidth: 380,
      isActiveAgentsSectionExpanded: false,
      isRuntimeStatusStripVisible: false,
      isMonitorVisible: false,
      isBottomTelemetryVisible: false,
      isCodexUsageVisible: false,
      isClaudeUsageVisible: false,
      isClaudeUsageSectionExpanded: false,
      isCodexUsageSectionExpanded: false,
      terminalCompletionSound: "double-beep",
      minimizedTerminalIds: ["terminal-1"],
      terminalWidths: {
        "terminal-1": 420,
      },
    });
  });

  it("creates new tentacles with unique incremental ids", async () => {
    const baseUrl = await startServer();

    const createFirstResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "planner" }),
    });

    expect(createFirstResponse.status).toBe(201);
    await expect(createFirstResponse.json()).resolves.toEqual(
      expect.objectContaining({
        terminalId: "terminal-1",
        label: "terminal-1",
        state: "idle",
        tentacleId: "terminal-1",
        tentacleName: "planner",
        workspaceMode: "shared",
      }),
    );

    const createSecondResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });

    expect(createSecondResponse.status).toBe(201);
    await expect(createSecondResponse.json()).resolves.toEqual(
      expect.objectContaining({
        terminalId: "terminal-2",
        label: "terminal-2",
        state: "idle",
        tentacleId: "terminal-2",
        tentacleName: "Octogent Terminal 1",
        workspaceMode: "shared",
      }),
    );

    const renameResponse = await fetch(`${baseUrl}/api/terminals/terminal-2`, {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "reviewer" }),
    });

    expect(renameResponse.status).toBe(200);
    await expect(renameResponse.json()).resolves.toEqual(
      expect.objectContaining({
        tentacleId: "terminal-2",
        tentacleName: "reviewer",
      }),
    );

    const listResponse = await fetch(`${baseUrl}/api/terminal-snapshots`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          terminalId: "terminal-1",
          tentacleId: "terminal-1",
          tentacleName: "planner",
          workspaceMode: "shared",
        }),
        expect.objectContaining({
          terminalId: "terminal-2",
          tentacleId: "terminal-2",
          tentacleName: "reviewer",
          workspaceMode: "shared",
        }),
      ]),
    );
  });

  it("reuses the minimum available tentacle number after deletions", async () => {
    const baseUrl = await startServer();

    const createFirstResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });
    expect(createFirstResponse.status).toBe(201);

    const createSecondResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });
    expect(createSecondResponse.status).toBe(201);

    const deleteFirstResponse = await fetch(`${baseUrl}/api/terminals/terminal-1`, {
      method: "DELETE",
      headers: {
        Accept: "application/json",
      },
    });
    expect(deleteFirstResponse.status).toBe(204);

    const createThirdResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });
    expect(createThirdResponse.status).toBe(201);
    await expect(createThirdResponse.json()).resolves.toEqual(
      expect.objectContaining({
        tentacleId: "terminal-1",
      }),
    );
  });

  it("ignores stale persisted nextTentacleNumber values and starts from the minimum available id", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    const registryPath = join(workspaceCwd, ".octogent", "state", "tentacles.json");
    mkdirSync(join(workspaceCwd, ".octogent", "state"), { recursive: true });
    writeFileSync(
      registryPath,
      `${JSON.stringify(
        {
          version: 2,
          nextTentacleNumber: 19,
          tentacles: [],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const baseUrl = await startServer({
      workspaceCwd,
    });

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });
    expect(createResponse.status).toBe(201);
    await expect(createResponse.json()).resolves.toEqual(
      expect.objectContaining({
        tentacleId: "terminal-1",
      }),
    );
  });

  it("skips tentacle ids that already have an existing worktree directory", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    mkdirSync(join(workspaceCwd, ".octogent", "worktrees", "terminal-1"), {
      recursive: true,
    });

    const baseUrl = await startServer({
      workspaceCwd,
    });

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });
    expect(createResponse.status).toBe(201);
    await expect(createResponse.json()).resolves.toEqual(
      expect.objectContaining({
        tentacleId: "terminal-2",
      }),
    );
  });

  it("persists tentacle metadata without runtime bootstrap flags", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    const baseUrl = await startServer({
      workspaceCwd,
    });

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "planner" }),
    });
    expect(createResponse.status).toBe(201);

    const registryDocument = await waitForRegistryDocument<{
      terminals: Array<{
        terminalId: string;
        tentacleId: string;
        workspaceMode: "shared" | "worktree";
      }>;
    }>(workspaceCwd, (document) =>
      document.terminals.some(
        (terminal) =>
          terminal.terminalId === "terminal-1" &&
          terminal.tentacleId === "terminal-1" &&
          terminal.workspaceMode === "shared",
      ),
    );
    expect(registryDocument.terminals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          terminalId: "terminal-1",
          tentacleId: "terminal-1",
          workspaceMode: "shared",
        }),
      ]),
    );
  });

  it("marks auto-started prompted terminals as active immediately", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    const baseUrl = await startServer({
      workspaceCwd,
    });

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "planner", initialPrompt: "Start working." }),
    });
    expect(createResponse.status).toBe(201);

    const snapshotsResponse = await fetch(`${baseUrl}/api/terminal-snapshots`, {
      headers: { Accept: "application/json" },
    });
    expect(snapshotsResponse.status).toBe(200);
    await expect(snapshotsResponse.json()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          terminalId: "terminal-1",
          hasUserPrompt: true,
        }),
      ]),
    );
  });

  it("injects a default tentacle context prompt for tentacle terminals", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    const tentacleDir = join(workspaceCwd, ".octogent", "tentacles", "docs");
    const relativeTentacleDir = ".octogent/tentacles/docs";
    const promptsDir = join(process.cwd(), "..", "..", "prompts");
    mkdirSync(tentacleDir, { recursive: true });
    writeFileSync(join(tentacleDir, "CONTEXT.md"), "# Docs\n\nDocumentation team.\n", "utf8");
    writeFileSync(join(tentacleDir, "todo.md"), "# Todo\n", "utf8");
    const baseUrl = await startServer({
      workspaceCwd,
      promptsDir,
    });

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tentacleId: "docs", workspaceMode: "shared" }),
    });
    expect(createResponse.status).toBe(201);
    await expect(createResponse.json()).resolves.toEqual(
      expect.objectContaining({
        terminalId: "terminal-1",
        tentacleId: "docs",
      }),
    );

    const registryDocument = await waitForRegistryDocument<{
      terminals: Array<{
        terminalId: string;
        initialInputDraft?: string;
      }>;
    }>(workspaceCwd, (document) =>
      document.terminals.some(
        (terminal) =>
          terminal.terminalId === "terminal-1" &&
          terminal.initialInputDraft?.includes(
            `You are working on the Docs section. For tool-list items, context, and docs, check ${relativeTentacleDir}.`,
          ) &&
          terminal.initialInputDraft.includes("## Autonomous Operating Skills") &&
          terminal.initialInputDraft.includes("Memory Management") &&
          terminal.initialInputDraft.includes("## Runtime Goals") &&
          terminal.initialInputDraft.includes("## Runtime Policy Layer"),
      ),
    );
    expect(registryDocument.terminals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          terminalId: "terminal-1",
          initialInputDraft: expect.stringContaining("## Runtime Policy Layer"),
        }),
      ]),
    );

    const snapshotsResponse = await fetch(`${baseUrl}/api/terminal-snapshots`, {
      headers: { Accept: "application/json" },
    });
    expect(snapshotsResponse.status).toBe(200);
    await expect(snapshotsResponse.json()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          terminalId: "terminal-1",
          hasUserPrompt: false,
        }),
      ]),
    );
  });

  it("creates isolated worktree terminals with dedicated cwd", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    const gitClient = new FakeGitClient();
    const baseUrl = await startServer({
      workspaceCwd,
      gitClient,
    });

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "planner",
        workspaceMode: "worktree",
      }),
    });
    expect(createResponse.status).toBe(201);
    await expect(createResponse.json()).resolves.toEqual(
      expect.objectContaining({
        tentacleId: "terminal-1",
        tentacleName: "planner",
        workspaceMode: "worktree",
        lifecycleState: "registered",
        state: "idle",
      }),
    );

    const expectedWorktreePath = join(workspaceCwd, ".octogent", "worktrees", "terminal-1");
    expect(gitClient.getWorktree(expectedWorktreePath)).toEqual(
      expect.objectContaining({
        cwd: workspaceCwd,
        branchName: "octogent/terminal-1",
        baseRef: "HEAD",
      }),
    );

    const registryDocument = await waitForRegistryDocument<{
      terminals: Array<{
        terminalId: string;
        tentacleId: string;
        workspaceMode: "shared" | "worktree";
      }>;
    }>(workspaceCwd, (document) =>
      document.terminals.some(
        (terminal) =>
          terminal.terminalId === "terminal-1" &&
          terminal.tentacleId === "terminal-1" &&
          terminal.workspaceMode === "worktree",
      ),
    );
    expect(registryDocument.terminals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          terminalId: "terminal-1",
          tentacleId: "terminal-1",
          workspaceMode: "worktree",
        }),
      ]),
    );
  });

  it("rejects worktree identifiers that escape the worktree root", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    const gitClient = new FakeGitClient();
    const baseUrl = await startServer({
      workspaceCwd,
      gitClient,
    });

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceMode: "worktree",
        worktreeId: "../../../../tmp/octogent-escape-poc",
      }),
    });

    expect(createResponse.status).toBe(400);
    await expect(createResponse.json()).resolves.toEqual({
      error: "Invalid worktree identifier: ../../../../tmp/octogent-escape-poc",
    });
  });

  it("returns git status for worktree tentacles", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    const gitClient = new FakeGitClient();
    const baseUrl = await startServer({
      workspaceCwd,
      gitClient,
    });

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceMode: "worktree",
      }),
    });
    expect(createResponse.status).toBe(201);

    const worktreePath = join(workspaceCwd, ".octogent", "worktrees", "terminal-1");
    gitClient.setWorktreeStatus(worktreePath, {
      branchName: "octogent/terminal-1",
      upstreamBranchName: "origin/octogent/terminal-1",
      isDirty: true,
      aheadCount: 2,
      behindCount: 1,
      insertedLineCount: 0,
      deletedLineCount: 0,
      hasConflicts: false,
      changedFiles: ["apps/web/src/App.tsx", "README.md"],
      defaultBaseBranchName: "main",
    });

    const statusResponse = await fetch(`${baseUrl}/api/tentacles/terminal-1/git/status`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    expect(statusResponse.status).toBe(200);
    await expect(statusResponse.json()).resolves.toEqual({
      tentacleId: "terminal-1",
      workspaceMode: "worktree",
      branchName: "octogent/terminal-1",
      upstreamBranchName: "origin/octogent/terminal-1",
      isDirty: true,
      aheadCount: 2,
      behindCount: 1,
      insertedLineCount: 0,
      deletedLineCount: 0,
      hasConflicts: false,
      changedFiles: ["apps/web/src/App.tsx", "README.md"],
      defaultBaseBranchName: "main",
    });
  });

  it("returns 409 for git status on shared tentacles", async () => {
    const baseUrl = await startServer();

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });
    expect(createResponse.status).toBe(201);

    const statusResponse = await fetch(`${baseUrl}/api/tentacles/terminal-1/git/status`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    expect(statusResponse.status).toBe(409);
    await expect(statusResponse.json()).resolves.toEqual({
      error: "Git lifecycle actions are only available for worktree terminals.",
    });
  });

  it("commits pending worktree changes with a required message", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    const gitClient = new FakeGitClient();
    const baseUrl = await startServer({
      workspaceCwd,
      gitClient,
    });

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceMode: "worktree",
      }),
    });
    expect(createResponse.status).toBe(201);

    const worktreePath = join(workspaceCwd, ".octogent", "worktrees", "terminal-1");
    gitClient.setWorktreeStatus(worktreePath, {
      branchName: "octogent/terminal-1",
      upstreamBranchName: "origin/octogent/terminal-1",
      isDirty: true,
      aheadCount: 0,
      behindCount: 0,
      insertedLineCount: 0,
      deletedLineCount: 0,
      hasConflicts: false,
      changedFiles: ["apps/web/src/App.tsx"],
      defaultBaseBranchName: "main",
    });

    const commitResponse = await fetch(`${baseUrl}/api/tentacles/terminal-1/git/commit`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "feat: add worktree git actions",
      }),
    });
    expect(commitResponse.status).toBe(200);
    expect(gitClient.getLastCommitMessage(worktreePath)).toBe("feat: add worktree git actions");
    await expect(commitResponse.json()).resolves.toEqual({
      tentacleId: "terminal-1",
      workspaceMode: "worktree",
      branchName: "octogent/terminal-1",
      upstreamBranchName: "origin/octogent/terminal-1",
      isDirty: false,
      aheadCount: 1,
      behindCount: 0,
      insertedLineCount: 0,
      deletedLineCount: 0,
      hasConflicts: false,
      changedFiles: [],
      defaultBaseBranchName: "main",
    });
  });

  it("returns 400 for commit when message is empty", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    const gitClient = new FakeGitClient();
    const baseUrl = await startServer({
      workspaceCwd,
      gitClient,
    });

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceMode: "worktree",
      }),
    });
    expect(createResponse.status).toBe(201);

    const worktreePath = join(workspaceCwd, ".octogent", "worktrees", "terminal-1");
    const commitResponse = await fetch(`${baseUrl}/api/tentacles/terminal-1/git/commit`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "   ",
      }),
    });
    expect(commitResponse.status).toBe(400);
    expect(gitClient.getLastCommitMessage(worktreePath)).toBeNull();
    await expect(commitResponse.json()).resolves.toEqual({
      error: "Commit message cannot be empty.",
    });
  });

  it("pushes worktree branch and updates ahead count", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    const gitClient = new FakeGitClient();
    const baseUrl = await startServer({
      workspaceCwd,
      gitClient,
    });

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceMode: "worktree",
      }),
    });
    expect(createResponse.status).toBe(201);

    const worktreePath = join(workspaceCwd, ".octogent", "worktrees", "terminal-1");
    gitClient.setWorktreeStatus(worktreePath, {
      branchName: "octogent/terminal-1",
      upstreamBranchName: null,
      isDirty: false,
      aheadCount: 3,
      behindCount: 0,
      insertedLineCount: 0,
      deletedLineCount: 0,
      hasConflicts: false,
      changedFiles: [],
      defaultBaseBranchName: "main",
    });

    const pushResponse = await fetch(`${baseUrl}/api/tentacles/terminal-1/git/push`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });
    expect(pushResponse.status).toBe(200);
    expect(gitClient.getPushCount(worktreePath)).toBe(1);
    await expect(pushResponse.json()).resolves.toEqual({
      tentacleId: "terminal-1",
      workspaceMode: "worktree",
      branchName: "octogent/terminal-1",
      upstreamBranchName: "origin/octogent/terminal-1",
      isDirty: false,
      aheadCount: 0,
      behindCount: 0,
      insertedLineCount: 0,
      deletedLineCount: 0,
      hasConflicts: false,
      changedFiles: [],
      defaultBaseBranchName: "main",
    });
  });

  it("blocks remote Git actions when the configured remote is not approved", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    const gitClient = new FakeGitClient();
    const baseUrl = await startServer({
      workspaceCwd,
      gitClient,
      readGithubPublishReadiness: async () => ({
        status: "needs_user_remote",
        origin: "https://github.com/hesamsheikh/octogent.git",
        message: "Origin points to the upstream Octogent repository. Publishing is blocked.",
      }),
    });

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ workspaceMode: "worktree" }),
    });
    expect(createResponse.status).toBe(201);

    const worktreePath = join(workspaceCwd, ".octogent", "worktrees", "terminal-1");
    const pushResponse = await fetch(`${baseUrl}/api/tentacles/terminal-1/git/push`, {
      method: "POST",
      headers: { Accept: "application/json" },
    });
    const syncResponse = await fetch(`${baseUrl}/api/tentacles/terminal-1/git/sync`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const createPrResponse = await fetch(`${baseUrl}/api/tentacles/terminal-1/git/pr`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Blocked remote action" }),
    });
    const mergePrResponse = await fetch(`${baseUrl}/api/tentacles/terminal-1/git/pr/merge`, {
      method: "POST",
      headers: { Accept: "application/json" },
    });

    expect(pushResponse.status).toBe(403);
    expect(syncResponse.status).toBe(403);
    expect(createPrResponse.status).toBe(403);
    expect(mergePrResponse.status).toBe(403);
    expect(gitClient.getPushCount(worktreePath)).toBe(0);
    await expect(pushResponse.json()).resolves.toEqual({
      error: "Origin points to the upstream Octogent repository. Publishing is blocked.",
    });
  });

  it("syncs worktree branch with base ref", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    const gitClient = new FakeGitClient();
    const baseUrl = await startServer({
      workspaceCwd,
      gitClient,
    });

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceMode: "worktree",
      }),
    });
    expect(createResponse.status).toBe(201);

    const worktreePath = join(workspaceCwd, ".octogent", "worktrees", "terminal-1");
    gitClient.setWorktreeStatus(worktreePath, {
      branchName: "octogent/terminal-1",
      upstreamBranchName: "origin/octogent/terminal-1",
      isDirty: false,
      aheadCount: 0,
      behindCount: 4,
      insertedLineCount: 0,
      deletedLineCount: 0,
      hasConflicts: false,
      changedFiles: [],
      defaultBaseBranchName: "main",
    });

    const syncResponse = await fetch(`${baseUrl}/api/tentacles/terminal-1/git/sync`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        baseRef: "main",
      }),
    });
    expect(syncResponse.status).toBe(200);
    expect(gitClient.getSyncBaseRefs(worktreePath)).toEqual(["main"]);
    await expect(syncResponse.json()).resolves.toEqual({
      tentacleId: "terminal-1",
      workspaceMode: "worktree",
      branchName: "octogent/terminal-1",
      upstreamBranchName: "origin/octogent/terminal-1",
      isDirty: false,
      aheadCount: 0,
      behindCount: 0,
      insertedLineCount: 0,
      deletedLineCount: 0,
      hasConflicts: false,
      changedFiles: [],
      defaultBaseBranchName: "main",
    });
  });

  it("returns PR status for worktree tentacles", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    const gitClient = new FakeGitClient();
    const baseUrl = await startServer({
      workspaceCwd,
      gitClient,
    });

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceMode: "worktree",
      }),
    });
    expect(createResponse.status).toBe(201);

    const worktreePath = join(workspaceCwd, ".octogent", "worktrees", "terminal-1");
    gitClient.setWorktreePullRequest(worktreePath, {
      number: 142,
      url: "https://github.com/hesamsheikh/octogent/pull/142",
      title: "feat: worktree git lifecycle menu",
      baseRef: "main",
      headRef: "octogent/terminal-1",
      state: "OPEN",
      isDraft: false,
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
    });

    const prStatusResponse = await fetch(`${baseUrl}/api/tentacles/terminal-1/git/pr`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    expect(prStatusResponse.status).toBe(200);
    await expect(prStatusResponse.json()).resolves.toEqual({
      tentacleId: "terminal-1",
      workspaceMode: "worktree",
      status: "open",
      number: 142,
      url: "https://github.com/hesamsheikh/octogent/pull/142",
      title: "feat: worktree git lifecycle menu",
      baseRef: "main",
      headRef: "octogent/terminal-1",
      isDraft: false,
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
    });
  });

  it("creates PR for worktree tentacles and returns PR snapshot", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    const gitClient = new FakeGitClient();
    const baseUrl = await startServer({
      workspaceCwd,
      gitClient,
    });

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceMode: "worktree",
      }),
    });
    expect(createResponse.status).toBe(201);

    const worktreePath = join(workspaceCwd, ".octogent", "worktrees", "terminal-1");
    gitClient.setWorktreeStatus(worktreePath, {
      branchName: "octogent/terminal-1",
      upstreamBranchName: "origin/octogent/terminal-1",
      isDirty: false,
      aheadCount: 0,
      behindCount: 0,
      insertedLineCount: 0,
      deletedLineCount: 0,
      hasConflicts: false,
      changedFiles: [],
      defaultBaseBranchName: "main",
    });

    const createPrResponse = await fetch(`${baseUrl}/api/tentacles/terminal-1/git/pr`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "feat: expose worktree lifecycle actions",
        body: "Adds PR controls in the tentacle header.",
        baseRef: "main",
      }),
    });
    expect(createPrResponse.status).toBe(200);
    await expect(createPrResponse.json()).resolves.toEqual({
      tentacleId: "terminal-1",
      workspaceMode: "worktree",
      status: "open",
      number: 101,
      url: "https://github.com/hesamsheikh/octogent/pull/101",
      title: "feat: expose worktree lifecycle actions",
      baseRef: "main",
      headRef: "octogent/terminal-1",
      isDraft: false,
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
    });
  });

  it("returns 409 when creating a PR and an open PR already exists for the branch", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    const gitClient = new FakeGitClient();
    const baseUrl = await startServer({
      workspaceCwd,
      gitClient,
    });

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceMode: "worktree",
      }),
    });
    expect(createResponse.status).toBe(201);

    const worktreePath = join(workspaceCwd, ".octogent", "worktrees", "terminal-1");
    gitClient.setWorktreeStatus(worktreePath, {
      branchName: "octogent/terminal-1",
      upstreamBranchName: "origin/octogent/terminal-1",
      isDirty: false,
      aheadCount: 0,
      behindCount: 0,
      insertedLineCount: 0,
      deletedLineCount: 0,
      hasConflicts: false,
      changedFiles: [],
      defaultBaseBranchName: "main",
    });
    gitClient.setWorktreePullRequest(worktreePath, {
      number: 142,
      url: "https://github.com/hesamsheikh/octogent/pull/142",
      title: "feat: existing worktree lifecycle PR",
      baseRef: "main",
      headRef: "octogent/terminal-1",
      state: "OPEN",
      isDraft: false,
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
    });

    const createPrResponse = await fetch(`${baseUrl}/api/tentacles/terminal-1/git/pr`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "feat: should not create duplicate PR",
        body: "Should fail because the branch already has an open PR.",
        baseRef: "main",
      }),
    });
    expect(createPrResponse.status).toBe(409);
    await expect(createPrResponse.json()).resolves.toEqual({
      error: "An open pull request already exists for this branch.",
    });

    expect(gitClient.getPullRequestState(worktreePath)).toBe("OPEN");
  });

  it("merges the current branch PR for worktree tentacles", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    const gitClient = new FakeGitClient();
    const baseUrl = await startServer({
      workspaceCwd,
      gitClient,
    });

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceMode: "worktree",
      }),
    });
    expect(createResponse.status).toBe(201);

    const worktreePath = join(workspaceCwd, ".octogent", "worktrees", "terminal-1");
    gitClient.setWorktreePullRequest(worktreePath, {
      number: 190,
      url: "https://github.com/hesamsheikh/octogent/pull/190",
      title: "feat: ship worktree lifecycle",
      baseRef: "main",
      headRef: "octogent/terminal-1",
      state: "OPEN",
      isDraft: false,
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
    });

    const mergeResponse = await fetch(`${baseUrl}/api/tentacles/terminal-1/git/pr/merge`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });
    expect(mergeResponse.status).toBe(200);
    expect(gitClient.getPullRequestState(worktreePath)).toBe("MERGED");
    await expect(mergeResponse.json()).resolves.toEqual({
      tentacleId: "terminal-1",
      workspaceMode: "worktree",
      status: "merged",
      number: 190,
      url: "https://github.com/hesamsheikh/octogent/pull/190",
      title: "feat: ship worktree lifecycle",
      baseRef: "main",
      headRef: "octogent/terminal-1",
      isDraft: false,
      mergeable: "UNKNOWN",
      mergeStateStatus: "MERGED",
    });
  });

  it("returns 409 for PR actions on shared tentacles", async () => {
    const baseUrl = await startServer();

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });
    expect(createResponse.status).toBe(201);

    const prStatusResponse = await fetch(`${baseUrl}/api/tentacles/terminal-1/git/pr`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    expect(prStatusResponse.status).toBe(409);
    await expect(prStatusResponse.json()).resolves.toEqual({
      error: "Git lifecycle actions are only available for worktree terminals.",
    });
  });

  it("removes isolated worktree metadata when deleting a worktree tentacle", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    const gitClient = new FakeGitClient();
    const baseUrl = await startServer({
      workspaceCwd,
      gitClient,
    });

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceMode: "worktree",
      }),
    });
    expect(createResponse.status).toBe(201);

    const expectedWorktreePath = join(workspaceCwd, ".octogent", "worktrees", "terminal-1");
    expect(gitClient.getWorktree(expectedWorktreePath)).toEqual(
      expect.objectContaining({
        cwd: workspaceCwd,
        branchName: "octogent/terminal-1",
      }),
    );

    const deleteResponse = await fetch(`${baseUrl}/api/terminals/terminal-1`, {
      method: "DELETE",
      headers: {
        Accept: "application/json",
      },
    });
    expect(deleteResponse.status).toBe(204);
    expect(gitClient.getWorktree(expectedWorktreePath)).toBeNull();
    expect(gitClient.hasBranch("octogent/terminal-1")).toBe(false);
  });

  it("returns 409 and keeps tentacle state when worktree deletion fails", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    const gitClient = new FakeGitClient();
    const baseUrl = await startServer({
      workspaceCwd,
      gitClient,
    });

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceMode: "worktree",
      }),
    });
    expect(createResponse.status).toBe(201);

    const expectedWorktreePath = join(workspaceCwd, ".octogent", "worktrees", "terminal-1");
    gitClient.setFailRemoveWorktree(true);

    const deleteResponse = await fetch(`${baseUrl}/api/terminals/terminal-1`, {
      method: "DELETE",
      headers: {
        Accept: "application/json",
      },
    });
    expect(deleteResponse.status).toBe(409);
    await expect(deleteResponse.json()).resolves.toEqual({
      error: expect.stringContaining("Unable to remove worktree for terminal-1"),
    });
    expect(gitClient.getWorktree(expectedWorktreePath)).toEqual(
      expect.objectContaining({
        cwd: workspaceCwd,
        branchName: "octogent/terminal-1",
      }),
    );

    const listResponse = await fetch(`${baseUrl}/api/terminal-snapshots`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          terminalId: "terminal-1",
          tentacleId: "terminal-1",
        }),
      ]),
    );
  });

  it("returns 400 when workspace mode is invalid", async () => {
    const baseUrl = await startServer();

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceMode: "invalid-mode",
      }),
    });

    expect(createResponse.status).toBe(400);
    await expect(createResponse.json()).resolves.toEqual({
      error: "Terminal workspace mode must be either 'shared' or 'worktree'.",
    });
  });

  it("refreshes builtin prompts from promptsDir on server start", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    const projectStateDir = mkdtempSync(join(tmpdir(), "octogent-state-test-"));
    const promptsDir = mkdtempSync(join(tmpdir(), "octogent-prompts-test-"));
    temporaryDirectories.push(workspaceCwd, projectStateDir, promptsDir);

    mkdirSync(join(projectStateDir, "prompts", "core"), { recursive: true });
    writeFileSync(
      join(projectStateDir, "prompts", "core", "swarm-parent.md"),
      "stale prompt with {{workerBranches}}\n",
      "utf8",
    );
    writeFileSync(
      join(promptsDir, "swarm-parent.md"),
      "fresh prompt with {{workerSpawnCommands}}\n",
      "utf8",
    );

    const baseUrl = await startServer({
      workspaceCwd,
      projectStateDir,
      promptsDir,
    });

    const response = await fetch(`${baseUrl}/api/prompts/swarm-parent`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      name: "swarm-parent",
      source: "builtin",
      content: "fresh prompt with {{workerSpawnCommands}}",
    });
  });

  it("exposes the research triad workflow prompt template", async () => {
    const baseUrl = await startServer({
      promptsDir: join(process.cwd(), "..", "..", "prompts"),
    });

    const response = await fetch(`${baseUrl}/api/prompts/research-triad-workflow`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      name: string;
      source: string;
      content: string;
    };
    expect(payload).toEqual(
      expect.objectContaining({
        name: "research-triad-workflow",
        source: "builtin",
      }),
    );
    expect(payload.content).toContain("Stage 1 — Perplexity Scout");
    expect(payload.content).toContain("Stage 2 — NotebookLM Source Room");
    expect(payload.content).toContain("Stage 3 — Notion Research Memory");
    expect(payload.content).toContain("Stage 4 — Claude Strategy");
    expect(payload.content).toContain("Stage 5 — Codex Tasks");
  });

  it("exposes the Notion research brief prompt template", async () => {
    const baseUrl = await startServer({
      promptsDir: join(process.cwd(), "..", "..", "prompts"),
    });

    const response = await fetch(`${baseUrl}/api/prompts/notion-research-brief`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      name: string;
      source: string;
      content: string;
    };
    expect(payload).toEqual(
      expect.objectContaining({
        name: "notion-research-brief",
        source: "builtin",
      }),
    );
    expect(payload.content).toContain("## Source Index");
    expect(payload.content).toContain("## Claims Table");
    expect(payload.content).toContain("## NotebookLM Source Room Notes");
    expect(payload.content).toContain("## BMC / Strategy Notes");
    expect(payload.content).toContain("## Codex Execution Tasks");
  });

  it("exposes the inside-out outbound prompt template", async () => {
    const baseUrl = await startServer({
      promptsDir: join(process.cwd(), "..", "..", "prompts"),
    });

    const response = await fetch(`${baseUrl}/api/prompts/inside-out-outbound`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      name: string;
      source: string;
      content: string;
    };
    expect(payload).toEqual(
      expect.objectContaining({
        name: "inside-out-outbound",
        source: "builtin",
      }),
    );
    expect(payload.content).toContain("Internal proof to retrieve");
    expect(payload.content).toContain("Best-fit scoring rubric");
    expect(payload.content).toContain("Warm-intro map");
    expect(payload.content).toContain("Escalation rules");
    expect(payload.content).toContain("Default to no API keys");
  });

  it("reads builtin prompts from the live promptsDir after server start", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    const projectStateDir = mkdtempSync(join(tmpdir(), "octogent-state-test-"));
    const promptsDir = mkdtempSync(join(tmpdir(), "octogent-prompts-test-"));
    temporaryDirectories.push(workspaceCwd, projectStateDir, promptsDir);

    writeFileSync(join(promptsDir, "tentacle-update-tentacle.md"), "version one\n", "utf8");

    const baseUrl = await startServer({
      workspaceCwd,
      projectStateDir,
      promptsDir,
    });

    writeFileSync(join(promptsDir, "tentacle-update-tentacle.md"), "version two\n", "utf8");

    const response = await fetch(`${baseUrl}/api/prompts/tentacle-update-tentacle`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      name: "tentacle-update-tentacle",
      source: "builtin",
      content: "version two",
    });
  });

  it("returns 400 when creating worktree tentacle outside a git repository", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    const gitClient = new FakeGitClient();
    gitClient.setRepositoryAvailable(false);
    const baseUrl = await startServer({
      workspaceCwd,
      gitClient,
    });

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceMode: "worktree",
      }),
    });
    expect(createResponse.status).toBe(400);
    await expect(createResponse.json()).resolves.toEqual({
      error: "Worktree terminals require a git repository at the workspace root.",
    });

    const listResponse = await fetch(`${baseUrl}/api/terminal-snapshots`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual([]);
  });

  it("returns 400 when tentacle name is empty after trimming", async () => {
    const baseUrl = await startServer();

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: " " }),
    });

    expect(createResponse.status).toBe(400);

    const validCreateResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });
    expect(validCreateResponse.status).toBe(201);

    const renameResponse = await fetch(`${baseUrl}/api/terminals/terminal-1`, {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: " " }),
    });

    expect(renameResponse.status).toBe(400);
  });

  it("spawns a shared-workspace todo agent for an individual item", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    mkdirSync(join(workspaceCwd, ".octogent", "tentacles", "docs-knowledge"), {
      recursive: true,
    });
    writeFileSync(
      join(workspaceCwd, ".octogent", "tentacles", "docs-knowledge", "CONTEXT.md"),
      "# Docs & Knowledge\n",
      "utf8",
    );
    writeFileSync(
      join(workspaceCwd, ".octogent", "tentacles", "docs-knowledge", "todo.md"),
      "# Todo\n\n- [ ] Audit docs\n- [ ] Consolidate principles\n",
      "utf8",
    );

    const baseUrl = await startServer({ workspaceCwd });

    const solveResponse = await fetch(`${baseUrl}/api/deck/tentacles/docs-knowledge/todo/solve`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ itemIndex: 0 }),
    });

    expect(solveResponse.status).toBe(201);
    await expect(solveResponse.json()).resolves.toEqual({
      terminalId: "docs-knowledge-todo-0",
      tentacleId: "docs-knowledge",
      itemIndex: 0,
      workspaceMode: "shared",
    });

    const listResponse = await fetch(`${baseUrl}/api/terminal-snapshots`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual([
      expect.objectContaining({
        terminalId: "docs-knowledge-todo-0",
        tentacleId: "docs-knowledge",
        tentacleName: "Docs & Knowledge",
        workspaceMode: "shared",
      }),
    ]);
  });

  it("preserves multiline todo text when adding and reading items", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    mkdirSync(join(workspaceCwd, ".octogent", "tentacles", "business"), {
      recursive: true,
    });
    writeFileSync(
      join(workspaceCwd, ".octogent", "tentacles", "business", "CONTEXT.md"),
      "# Business\n\nOperations lane.\n",
      "utf8",
    );
    writeFileSync(join(workspaceCwd, ".octogent", "tentacles", "business", "todo.md"), "# Todo\n");

    const baseUrl = await startServer({ workspaceCwd });
    const multilineText = "Draft launch positioning\nInclude audience and core offer";
    const addResponse = await fetch(`${baseUrl}/api/deck/tentacles/business/todo`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: multilineText }),
    });

    expect(addResponse.status).toBe(201);
    await expect(addResponse.json()).resolves.toEqual({
      total: 1,
      done: 0,
      items: [{ text: multilineText, done: false }],
    });
    expect(
      readFileSync(join(workspaceCwd, ".octogent", "tentacles", "business", "todo.md"), "utf8"),
    ).toBe("# Todo\n- [ ] Draft launch positioning\n  Include audience and core offer\n");

    const listResponse = await fetch(`${baseUrl}/api/deck/tentacles`, {
      headers: { Accept: "application/json" },
    });
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual([
      expect.objectContaining({
        tentacleId: "business",
        todoItems: [{ text: multilineText, done: false }],
      }),
    ]);
  });

  it("auto-renames todo agents from the todo item context on first prompt submit", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    mkdirSync(join(workspaceCwd, ".octogent", "tentacles", "docs-knowledge"), {
      recursive: true,
    });
    writeFileSync(
      join(workspaceCwd, ".octogent", "tentacles", "docs-knowledge", "CONTEXT.md"),
      "# Docs & Knowledge\n",
      "utf8",
    );
    writeFileSync(
      join(workspaceCwd, ".octogent", "tentacles", "docs-knowledge", "todo.md"),
      "# Todo\n\n- [ ] Audit docs\n- [ ] Consolidate principles\n",
      "utf8",
    );

    const baseUrl = await startServer({ workspaceCwd });

    const solveResponse = await fetch(`${baseUrl}/api/deck/tentacles/docs-knowledge/todo/solve`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ itemIndex: 0 }),
    });
    expect(solveResponse.status).toBe(201);

    const hookResponse = await fetch(
      `${baseUrl}/api/hooks/user-prompt-submit?octogent_session=docs-knowledge-todo-0`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "Generic worker prompt body" }),
      },
    );
    expect(hookResponse.status).toBe(200);

    const listResponse = await fetch(`${baseUrl}/api/terminal-snapshots`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual([
      expect.objectContaining({
        terminalId: "docs-knowledge-todo-0",
        tentacleId: "docs-knowledge",
        tentacleName: "Audit docs",
        workspaceMode: "shared",
      }),
    ]);
  });

  it("limits swarm prompts to the top-priority items that fit under the child cap", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    mkdirSync(join(workspaceCwd, ".octogent", "tentacles", "docs-knowledge"), {
      recursive: true,
    });
    writeFileSync(
      join(workspaceCwd, ".octogent", "tentacles", "docs-knowledge", "CONTEXT.md"),
      "# Docs & Knowledge\n",
      "utf8",
    );
    const todoItems = Array.from(
      { length: MAX_CHILDREN_PER_PARENT + 4 },
      (_, index) => `- [ ] item ${index}`,
    ).join("\n");
    writeFileSync(
      join(workspaceCwd, ".octogent", "tentacles", "docs-knowledge", "todo.md"),
      `# Todo\n\n${todoItems}\n`,
      "utf8",
    );

    const baseUrl = await startServer({ workspaceCwd });

    const swarmResponse = await fetch(`${baseUrl}/api/deck/tentacles/docs-knowledge/swarm`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    expect(swarmResponse.status).toBe(201);
    await expect(swarmResponse.json()).resolves.toEqual({
      tentacleId: "docs-knowledge",
      parentTerminalId: "docs-knowledge-swarm-parent",
      workers: Array.from({ length: MAX_CHILDREN_PER_PARENT }, (_, index) => ({
        terminalId: `docs-knowledge-swarm-${index}`,
        todoIndex: index,
        todoText: `item ${index}`,
      })),
    });

    const promptTemplate = readFileSync(
      join(process.cwd(), "..", "..", "prompts", "swarm-parent.md"),
      "utf8",
    );
    expect(promptTemplate).toContain(
      "Treat the listed workers as the highest-priority items and proceed without asking the user whether to batch, reprioritize, or raise the limit.",
    );
  });

  it("allows multiple named swarms to run for the same tentacle", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    mkdirSync(join(workspaceCwd, ".octogent", "tentacles", "ops"), {
      recursive: true,
    });
    writeFileSync(join(workspaceCwd, ".octogent", "tentacles", "ops", "CONTEXT.md"), "# Ops\n");
    writeFileSync(
      join(workspaceCwd, ".octogent", "tentacles", "ops", "todo.md"),
      "# Todo\n\n- [ ] Write business plan\n- [ ] Research competitors\n",
      "utf8",
    );

    const baseUrl = await startServer({ workspaceCwd });

    const createSwarm = async (swarmId: string) =>
      await fetch(`${baseUrl}/api/deck/tentacles/ops/swarm`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ swarmId, workspaceMode: "shared", agentProvider: "codex" }),
      });

    const businessResponse = await createSwarm("business");
    expect(businessResponse.status).toBe(201);
    await expect(businessResponse.json()).resolves.toEqual({
      tentacleId: "ops",
      swarmId: "business",
      parentTerminalId: "ops-swarm-business-parent",
      workers: [
        {
          terminalId: "ops-swarm-business-0",
          todoIndex: 0,
          todoText: "Write business plan",
        },
        {
          terminalId: "ops-swarm-business-1",
          todoIndex: 1,
          todoText: "Research competitors",
        },
      ],
    });

    const researchResponse = await createSwarm("research");
    expect(researchResponse.status).toBe(201);
    await expect(researchResponse.json()).resolves.toEqual({
      tentacleId: "ops",
      swarmId: "research",
      parentTerminalId: "ops-swarm-research-parent",
      workers: [
        {
          terminalId: "ops-swarm-research-0",
          todoIndex: 0,
          todoText: "Write business plan",
        },
        {
          terminalId: "ops-swarm-research-1",
          todoIndex: 1,
          todoText: "Research competitors",
        },
      ],
    });

    const duplicateBusinessResponse = await createSwarm("business");
    expect(duplicateBusinessResponse.status).toBe(409);
    await expect(duplicateBusinessResponse.json()).resolves.toEqual({
      error: "A business swarm is already active for this tentacle.",
      existingSwarmIds: ["ops-swarm-business-parent"],
    });

    const listResponse = await fetch(`${baseUrl}/api/terminal-snapshots`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    expect(listResponse.status).toBe(200);
    const terminals = (await listResponse.json()) as Array<Record<string, unknown>>;
    expect(terminals.map((terminal) => terminal.terminalId).sort()).toEqual([
      "ops-swarm-business-parent",
      "ops-swarm-research-parent",
    ]);
  });

  it("routes research swarms to the research triad and synthesis providers by prompt intent", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    mkdirSync(join(workspaceCwd, ".octogent", "tentacles", "research"), {
      recursive: true,
    });
    writeFileSync(
      join(workspaceCwd, ".octogent", "tentacles", "research", "CONTEXT.md"),
      "# Research\n\nMarket research lane.\n",
    );
    writeFileSync(
      join(workspaceCwd, ".octogent", "tentacles", "research", "todo.md"),
      [
        "# Todo",
        "",
        "- [ ] Find latest competitor pricing with cited sources",
        "- [ ] Review selected sources in NotebookLM and answer open questions with source-grounded comparison",
        "- [ ] Store the final research brief, source index, decisions, and next tasks in Notion",
        "- [ ] Research Google SEO keyword opportunities from YouTube and Search Console",
        "- [ ] Synthesize a positioning strategy and recommendation from the findings",
        "",
      ].join("\n"),
      "utf8",
    );

    const baseUrl = await startServer({ workspaceCwd });

    const createResearchSwarm = async (swarmId: string, todoItemIndices: number[]) =>
      await fetch(`${baseUrl}/api/deck/tentacles/research/swarm`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ swarmId, workspaceMode: "shared", todoItemIndices }),
      });

    const perplexityResponse = await createResearchSwarm("research-perplexity", [0]);
    expect(perplexityResponse.status).toBe(201);
    const notebookLmResponse = await createResearchSwarm("research-notebooklm", [1]);
    expect(notebookLmResponse.status).toBe(201);
    const notionResponse = await createResearchSwarm("research-notion", [2]);
    expect(notionResponse.status).toBe(201);
    const geminiResponse = await createResearchSwarm("research-gemini", [3]);
    expect(geminiResponse.status).toBe(201);
    const claudeResponse = await createResearchSwarm("research-claude", [4]);
    expect(claudeResponse.status).toBe(201);

    const registryDocument = await waitForRegistryDocument<{
      terminals: Array<{
        terminalId: string;
        agentProvider?: string;
      }>;
    }>(
      workspaceCwd,
      (document) =>
        document.terminals.some(
          (terminal) =>
            terminal.terminalId === "research-swarm-research-perplexity-0" &&
            terminal.agentProvider === "perplexity",
        ) &&
        document.terminals.some(
          (terminal) =>
            terminal.terminalId === "research-swarm-research-notebooklm-1" &&
            terminal.agentProvider === "notebooklm",
        ) &&
        document.terminals.some(
          (terminal) =>
            terminal.terminalId === "research-swarm-research-notion-2" &&
            terminal.agentProvider === "notion",
        ) &&
        document.terminals.some(
          (terminal) =>
            terminal.terminalId === "research-swarm-research-gemini-3" &&
            terminal.agentProvider === "gemini-cli",
        ) &&
        document.terminals.some(
          (terminal) =>
            terminal.terminalId === "research-swarm-research-claude-4" &&
            terminal.agentProvider === "claude-code",
        ),
    );
    expect(registryDocument.terminals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          terminalId: "research-swarm-research-perplexity-0",
          agentProvider: "perplexity",
        }),
        expect.objectContaining({
          terminalId: "research-swarm-research-notebooklm-1",
          agentProvider: "notebooklm",
        }),
        expect.objectContaining({
          terminalId: "research-swarm-research-notion-2",
          agentProvider: "notion",
        }),
        expect.objectContaining({
          terminalId: "research-swarm-research-gemini-3",
          agentProvider: "gemini-cli",
        }),
        expect.objectContaining({
          terminalId: "research-swarm-research-claude-4",
          agentProvider: "claude-code",
        }),
      ]),
    );
  });

  it("returns research workflow stage status for research tentacles", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    mkdirSync(join(workspaceCwd, ".octogent", "tentacles", "research"), {
      recursive: true,
    });
    writeFileSync(
      join(workspaceCwd, ".octogent", "tentacles", "research", "CONTEXT.md"),
      "# Game Research\n\nResearch lane.\n",
      "utf8",
    );
    writeFileSync(
      join(workspaceCwd, ".octogent", "tentacles", "research", "todo.md"),
      [
        "# Todo",
        "",
        "- [x] Perplexity scout current sources and citations",
        "- [ ] NotebookLM review selected sources with source-grounded comparison",
        "- [ ] Notion store final research brief and source index",
        "- [ ] Claude synthesize strategy and BMC implications",
        "- [ ] Codex execute next prototype tasks",
        "",
      ].join("\n"),
      "utf8",
    );

    const baseUrl = await startServer({ workspaceCwd });
    const response = await fetch(`${baseUrl}/api/deck/tentacles`, {
      headers: { Accept: "application/json" },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({
        tentacleId: "research",
        researchWorkflow: {
          stage: "source-review",
          stages: [
            { id: "scout", label: "Scout", done: true, active: false },
            { id: "source-review", label: "Source Review", done: false, active: true },
            { id: "memory", label: "Memory", done: false, active: true },
            { id: "strategy", label: "Strategy", done: false, active: true },
            { id: "execution", label: "Execution", done: false, active: true },
          ],
        },
      }),
    ]);
  });

  it("deletes a tentacle and removes it from snapshots", async () => {
    const baseUrl = await startServer();

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });
    expect(createResponse.status).toBe(201);

    const deleteResponse = await fetch(`${baseUrl}/api/terminals/terminal-1`, {
      method: "DELETE",
      headers: {
        Accept: "application/json",
      },
    });
    expect(deleteResponse.status).toBe(204);

    const listResponse = await fetch(`${baseUrl}/api/terminal-snapshots`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual([]);

    const missingResponse = await fetch(`${baseUrl}/api/terminals/terminal-1`, {
      method: "DELETE",
      headers: {
        Accept: "application/json",
      },
    });
    expect(missingResponse.status).toBe(204);
  });

  it("deletes descendant terminals when deleting a parent terminal", async () => {
    const baseUrl = await startServer();

    const createParentResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ terminalId: "parent-terminal" }),
    });
    expect(createParentResponse.status).toBe(201);

    const createChildResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        terminalId: "child-terminal",
        parentTerminalId: "parent-terminal",
      }),
    });
    expect(createChildResponse.status).toBe(201);

    const createGrandchildResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        terminalId: "grandchild-terminal",
        parentTerminalId: "child-terminal",
      }),
    });
    expect(createGrandchildResponse.status).toBe(201);

    const createSiblingResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ terminalId: "unrelated-terminal" }),
    });
    expect(createSiblingResponse.status).toBe(201);

    const deleteResponse = await fetch(`${baseUrl}/api/terminals/parent-terminal`, {
      method: "DELETE",
      headers: {
        Accept: "application/json",
      },
    });
    expect(deleteResponse.status).toBe(204);

    const listResponse = await fetch(`${baseUrl}/api/terminal-snapshots`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual([
      expect.objectContaining({ terminalId: "unrelated-terminal" }),
    ]);
  });

  it("restores tentacles across API restarts using persisted registry", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);

    const firstBaseUrl = await startServer({
      workspaceCwd,
    });

    const createResponse = await fetch(`${firstBaseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "planner" }),
    });
    expect(createResponse.status).toBe(201);

    if (stopServer) {
      await stopServer();
      stopServer = null;
    }

    const secondBaseUrl = await startServer({
      workspaceCwd,
    });

    const listResponse = await fetch(`${secondBaseUrl}/api/terminal-snapshots`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          terminalId: "terminal-1",
          tentacleId: "terminal-1",
          tentacleName: "planner",
        }),
      ]),
    );
  });

  it("marks persisted running terminals as stale when the API starts without their session", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    const registryPath = join(workspaceCwd, ".octogent", "state", "tentacles.json");
    mkdirSync(join(workspaceCwd, ".octogent", "state"), { recursive: true });
    writeFileSync(
      registryPath,
      `${JSON.stringify(
        {
          version: 3,
          terminals: [
            {
              terminalId: "terminal-1",
              tentacleId: "terminal-1",
              tentacleName: "planner",
              createdAt: "2026-04-09T10:00:00.000Z",
              workspaceMode: "shared",
              lifecycleState: "running",
              processId: 99999999,
              lifecycleUpdatedAt: "2026-04-09T10:01:00.000Z",
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const baseUrl = await startServer({ workspaceCwd });

    const listResponse = await fetch(`${baseUrl}/api/terminal-snapshots`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual([
      expect.objectContaining({
        terminalId: "terminal-1",
        state: "stale",
        lifecycleState: "stale",
        lifecycleReason: "missing_process",
        processId: 99999999,
      }),
    ]);
  });

  it("stops and prunes stale terminal records through lifecycle endpoints", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-api-test-"));
    temporaryDirectories.push(workspaceCwd);
    const registryPath = join(workspaceCwd, ".octogent", "state", "tentacles.json");
    mkdirSync(join(workspaceCwd, ".octogent", "state"), { recursive: true });
    writeFileSync(
      registryPath,
      `${JSON.stringify(
        {
          version: 3,
          terminals: [
            {
              terminalId: "terminal-1",
              tentacleId: "terminal-1",
              tentacleName: "planner",
              createdAt: "2026-04-09T10:00:00.000Z",
              workspaceMode: "shared",
              lifecycleState: "running",
              processId: 99999999,
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const baseUrl = await startServer({ workspaceCwd });

    const stopResponse = await fetch(`${baseUrl}/api/terminals/terminal-1/stop`, {
      method: "POST",
      headers: { Accept: "application/json" },
    });
    expect(stopResponse.status).toBe(200);
    await expect(stopResponse.json()).resolves.toEqual(
      expect.objectContaining({
        terminalId: "terminal-1",
        lifecycleState: "stopped",
        lifecycleReason: "operator_stop",
      }),
    );

    const pruneResponse = await fetch(`${baseUrl}/api/terminals/prune`, {
      method: "POST",
      headers: { Accept: "application/json" },
    });
    expect(pruneResponse.status).toBe(200);
    await expect(pruneResponse.json()).resolves.toEqual({
      prunedTerminalIds: ["terminal-1"],
    });

    const listResponse = await fetch(`${baseUrl}/api/terminal-snapshots`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual([]);
  });

  it("reports Telegram bridge status without exposing external configuration", async () => {
    const telegramBridge = {
      getStatus: vi.fn(() => ({
        state: "not_configured" as const,
        mode: "long_polling" as const,
        allowedChatCount: 0,
        commands: ["/help", "/roles", "/agent <role-id> <message>"],
        detail: "Add a bot token and a trusted chat ID to enable the local bridge.",
      })),
      start: vi.fn(),
      stop: vi.fn(),
      pollOnce: vi.fn(async () => 0),
    };
    const baseUrl = await startServer({ telegramBridge });

    const response = await fetch(`${baseUrl}/api/telegram/status`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        state: "not_configured",
        allowedChatCount: 0,
        commands: expect.arrayContaining(["/agent <role-id> <message>"]),
      }),
    );
    expect(telegramBridge.start).toHaveBeenCalledTimes(1);
  });
});
