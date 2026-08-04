import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AgentDirectoryPanel } from "../src/components/AgentDirectoryPanel";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AgentDirectoryPanel", () => {
  it("explains a permanent role and displays its runtime-backed status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            agents: [
              {
                id: "codex-executor",
                title: "Codex Executor",
                role: "Scoped implementation and testing",
                preferredProvider: "codex",
                operatingModel: "GPT Terra (Executor)",
                purpose: "Builds and tests a scoped change.",
                spawnReason: "Launch this for a defined coding task.",
                memoryAccess: "shared-project-memory",
                state: "working",
                providerConnection: "shell_started_unverified",
                activityStatus: "testing",
                currentActivity: "testing: Running the Block Bounce regression checks.",
                terminalIds: ["game-qa-worker"],
                executionScope: { workspaceMode: "worktree", allowedTools: ["terminal"] },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    render(<AgentDirectoryPanel />);

    expect(await screen.findByText("Codex Executor")).toBeInTheDocument();
    expect(screen.getByText("GPT Terra (Executor)")).toBeInTheDocument();
    expect(screen.getByText("Launch this for a defined coding task.")).toBeInTheDocument();
    expect(
      screen.getByText("testing: Running the Block Bounce regression checks."),
    ).toBeInTheDocument();
    expect(screen.getByText("Working")).toBeInTheDocument();
    expect(screen.getByText("Shell started; provider unverified")).toBeInTheDocument();
  });

  it("lets the operator queue a message for a permanent role", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            agents: [
              {
                id: "codex-executor",
                title: "Codex Executor",
                role: "Scoped implementation and testing",
                preferredProvider: "codex",
                purpose: "Builds and tests a scoped change.",
                spawnReason: "Launch this for a defined coding task.",
                memoryAccess: "shared-project-memory",
                state: "not_launched",
                currentActivity: "No matching terminal is launched yet.",
                terminalIds: [],
                executionScope: { workspaceMode: "worktree", allowedTools: ["terminal"] },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ messages: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ messageId: "agent-msg-1" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            messages: [
              {
                messageId: "agent-msg-1",
                content: "Run the regression suite.",
                timestamp: "2026-08-04T00:00:00.000Z",
                delivered: false,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<AgentDirectoryPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Message role" }));
    expect(await screen.findByText("No role messages yet.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Message Codex Executor"), {
      target: { value: "Run the regression suite." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Queue message" }));

    expect(await screen.findByText("Run the regression suite.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/agents/codex-executor/inbox",
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
  });

  it("registers a role terminal using the role's manifest workspace scope", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            agents: [
              {
                id: "codex-executor",
                title: "Codex Executor",
                role: "Scoped implementation and testing",
                tentacleId: "game-business",
                preferredProvider: "codex",
                purpose: "Builds and tests a scoped change.",
                spawnReason: "Launch this for a defined coding task.",
                memoryAccess: "shared-project-memory",
                state: "not_launched",
                currentActivity: "No matching terminal is launched yet.",
                terminalIds: [],
                executionScope: { workspaceMode: "worktree", allowedTools: ["terminal"] },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ terminalId: "codex-role-terminal" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<AgentDirectoryPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Register role terminal" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/terminals",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            agentId: "codex-executor",
            tentacleId: "game-business",
            name: "Codex Executor",
            workspaceMode: "worktree",
            agentProvider: "codex",
          }),
        }),
      );
    });
  });

  it("lets the operator release a ready role terminal without removing the permanent role", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            agents: [
              {
                id: "codex-executor",
                title: "Codex Executor",
                role: "Scoped implementation and testing",
                tentacleId: "game-business",
                preferredProvider: "codex",
                purpose: "Builds and tests a scoped change.",
                spawnReason: "Launch this for a defined coding task.",
                memoryAccess: "shared-project-memory",
                state: "ready",
                currentActivity: "Ready to receive a scoped task.",
                terminalIds: ["codex-role-terminal"],
                executionScope: { workspaceMode: "worktree", allowedTools: ["terminal"] },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<AgentDirectoryPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Release idle terminal" }));

    expect(await screen.findByText("Release role terminal")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm release role terminal" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/terminals/codex-role-terminal",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
    expect(await screen.findByText("No matching terminal is launched yet.")).toBeInTheDocument();
    expect(screen.getByText("Codex Executor")).toBeInTheDocument();
  });

  it("releases an inactive terminal before offering a replacement for its permanent role", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            agents: [
              {
                id: "codex-executor",
                title: "Codex Executor",
                role: "Scoped implementation and testing",
                tentacleId: "game-business",
                preferredProvider: "codex",
                purpose: "Builds and tests a scoped change.",
                spawnReason: "Launch this for a defined coding task.",
                memoryAccess: "shared-project-memory",
                state: "not_launched",
                currentActivity: "No matching terminal is launched yet.",
                terminalIds: ["stale-codex-role-terminal"],
                executionScope: { workspaceMode: "worktree", allowedTools: ["terminal"] },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<AgentDirectoryPanel />);

    expect(
      screen.queryByRole("button", { name: "Register role terminal" }),
    ).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Release inactive terminal" }));
    expect(await screen.findByText(/Release 1 inactive terminal/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm release role terminal" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/terminals/stale-codex-role-terminal",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
    expect(
      await screen.findByRole("button", { name: "Register role terminal" }),
    ).toBeInTheDocument();
  });

  it("cleans up ended terminals without removing permanent roles", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            agents: [
              {
                id: "codex-executor",
                title: "Codex Executor",
                role: "Scoped implementation and testing",
                tentacleId: "game-business",
                preferredProvider: "codex",
                purpose: "Builds and tests a scoped change.",
                spawnReason: "Launch this for a defined coding task.",
                memoryAccess: "shared-project-memory",
                state: "not_launched",
                currentActivity: "No matching terminal is launched yet.",
                terminalIds: ["stale-codex-role-terminal"],
                executionScope: { workspaceMode: "worktree", allowedTools: ["terminal"] },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ prunedTerminalIds: ["stale-codex-role-terminal"] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<AgentDirectoryPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Clean up ended agents" }));
    expect(
      await screen.findByRole("heading", { name: "Clean up ended agents" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm clean up ended agents" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/terminals/prune",
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(await screen.findByText("Released 1 ended terminal.")).toBeInTheDocument();
    expect(screen.getByText("Codex Executor")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Register role terminal" }),
    ).toBeInTheDocument();
  });

  it("shows a prepared role without implying that its provider has started", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            agents: [
              {
                id: "codex-executor",
                title: "Codex Executor",
                role: "Scoped implementation and testing",
                tentacleId: "game-business",
                preferredProvider: "codex",
                purpose: "Builds and tests a scoped change.",
                spawnReason: "Launch this for a defined coding task.",
                memoryAccess: "shared-project-memory",
                state: "prepared",
                providerConnection: "not_started",
                currentActivity: "Prepared to start a scoped task; no provider session is running.",
                terminalIds: ["codex-role-terminal"],
                executionScope: { workspaceMode: "worktree", allowedTools: ["terminal"] },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<AgentDirectoryPanel />);

    expect(await screen.findByText("Prepared")).toBeInTheDocument();
    expect(
      screen.getByText("Prepared to start a scoped task; no provider session is running."),
    ).toBeInTheDocument();
    expect(screen.getByText("Not started")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Register role terminal" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Release prepared terminal" }));
    expect(await screen.findByText(/Release 1 prepared terminal/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm release role terminal" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/terminals/codex-role-terminal",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  it("starts a prepared role through its explicit terminal action", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            agents: [
              {
                id: "codex-executor",
                title: "Codex Executor",
                role: "Scoped implementation and testing",
                tentacleId: "game-business",
                preferredProvider: "codex",
                purpose: "Builds and tests a scoped change.",
                spawnReason: "Launch this for a defined coding task.",
                memoryAccess: "shared-project-memory",
                state: "prepared",
                providerConnection: "not_started",
                currentActivity: "Prepared to start a scoped task; no provider session is running.",
                terminalIds: ["codex-role-terminal"],
                executionScope: { workspaceMode: "worktree", allowedTools: ["terminal"] },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ lifecycleState: "running", state: "live" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<AgentDirectoryPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Start role terminal" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/terminals/codex-role-terminal/start",
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(await screen.findByText("Ready")).toBeInTheDocument();
    expect(
      screen.getByText("Ready to receive a scoped task. Provider connection unverified."),
    ).toBeInTheDocument();
  });
});
