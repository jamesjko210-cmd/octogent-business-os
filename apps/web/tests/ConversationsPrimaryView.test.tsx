import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/app/hooks/useConversationsRuntime", () => ({
  useConversationsRuntime: () => ({
    sessions: [],
    selectedSessionId: null,
    selectedSession: null,
    isLoadingSessions: false,
    isLoadingSelectedSession: false,
    isExporting: false,
    isClearing: false,
    isSearching: false,
    searchQuery: "",
    searchHits: [],
    highlightedTurnId: null,
    errorMessage: null,
    selectSession: vi.fn(),
    refreshSessions: vi.fn(),
    clearAllSessions: vi.fn(async () => undefined),
    deleteSession: vi.fn(async () => undefined),
    exportSession: vi.fn(async () => null),
    searchConversations: vi.fn(async () => undefined),
    clearSearch: vi.fn(),
    navigateToSearchHit: vi.fn(),
  }),
}));

import { ConversationsPrimaryView } from "../src/components/ConversationsPrimaryView";

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const roles = [
  {
    id: "codex-executor",
    title: "Codex Executor",
    role: "Scoped implementation and testing",
    tentacleId: "game-business",
    purpose: "Builds and tests a scoped change.",
    state: "not_launched",
    currentActivity: "No matching terminal is launched yet.",
    terminalIds: ["codex-executor-shell"],
  },
  {
    id: "ceo-command",
    title: "CEO Command",
    role: "Strategy and escalation",
    tentacleId: "business",
    purpose: "Owns strategy and decisions.",
    state: "working",
    currentActivity: "Planning the weekly brief.",
    terminalIds: ["ceo-shell"],
  },
  {
    id: "research-triad",
    title: "Research Triad",
    role: "Google-grounded research and synthesis",
    tentacleId: "research",
    purpose: "Prepares source-grounded briefs.",
    state: "working",
    currentActivity: "Researching the approved question.",
    terminalIds: ["research-agent"],
  },
];

describe("ConversationsPrimaryView", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lets the operator queue a durable message for an unlaunched permanent role", async () => {
    let queued = false;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/agents") return jsonResponse({ agents: roles });
      if (url === "/api/agents/codex-executor/inbox" && init?.method === "POST") {
        queued = true;
        return jsonResponse({ messageId: "role-message-1" }, 201);
      }
      if (url === "/api/agents/codex-executor/inbox") {
        return jsonResponse({
          messages: queued
            ? [
                {
                  messageId: "role-message-1",
                  content: "Run the approved checks.",
                  timestamp: "2026-08-04T00:00:00.000Z",
                  delivered: false,
                },
              ]
            : [],
        });
      }
      return jsonResponse({ error: `Unexpected request: ${url}` }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ConversationsPrimaryView columns={[]} enabled />);

    expect(await screen.findByText("Codex Executor")).toBeInTheDocument();
    expect(screen.getByText("CEO Command")).toBeInTheDocument();
    expect(screen.getByText("not launched")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Message selected agent"), {
      target: { value: "Run the approved checks." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Queue for role" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/agents/codex-executor/inbox",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ content: "Run the approved checks." }),
        }),
      );
    });
    expect(await screen.findByText("Run the approved checks.")).toBeInTheDocument();
    expect(screen.getByText("queued")).toBeInTheDocument();
  });

  it("keeps role messaging durable and shows the exact terminal that received it", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/agents") return jsonResponse({ agents: roles });
      if (url === "/api/agents/ceo-command/inbox") {
        return jsonResponse({
          messages: [
            {
              messageId: "role-message-2",
              content: "Review the weekly brief.",
              timestamp: "2026-08-04T00:00:00.000Z",
              delivered: true,
              deliveredAt: "2026-08-04T00:01:00.000Z",
              deliveredToTerminalId: "ceo-shell",
            },
          ],
        });
      }
      if (url === "/api/agents/codex-executor/inbox") return jsonResponse({ messages: [] });
      return jsonResponse({ error: `Unexpected request: ${url}` }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ConversationsPrimaryView columns={[]} enabled />);
    fireEvent.click(await screen.findByRole("button", { name: /CEO Command/ }));

    expect(await screen.findByText("Review the weekly brief.")).toBeInTheDocument();
    expect(screen.getByText(/Delivered to ceo-shell/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/agents/ceo-command/inbox", {
      headers: { Accept: "application/json" },
    });
  });

  it("shows recent durable agent-to-agent handoffs separately from the selected role inbox", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/agents") return jsonResponse({ agents: roles });
      if (url === "/api/channels") {
        return jsonResponse({
          messages: [
            {
              messageId: "msg-9",
              fromTerminalId: "research-agent",
              toTerminalId: "codex-executor-shell",
              content: "Evidence is ready for the approved implementation task.",
              timestamp: "2026-08-04T00:00:00.000Z",
              delivered: true,
            },
          ],
        });
      }
      if (url === "/api/agents/codex-executor/inbox") return jsonResponse({ messages: [] });
      return jsonResponse({ error: `Unexpected request: ${url}` }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ConversationsPrimaryView columns={[]} enabled />);

    expect(await screen.findByText("Recent coordination")).toBeInTheDocument();
    expect(
      await screen.findByText("Evidence is ready for the approved implementation task."),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Research Triad").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Codex Executor").length).toBeGreaterThan(1);
    expect(screen.getByText("research-agent")).toBeInTheDocument();
    expect(screen.getByText("codex-executor-shell")).toBeInTheDocument();
  });

  it("cleans only orphaned queued handoffs after an explicit confirmation", async () => {
    let handoffs = [
      {
        messageId: "msg-9",
        fromTerminalId: "research-agent",
        toTerminalId: "deleted-terminal",
        content: "This queued handoff cannot reach its removed target.",
        timestamp: "2026-08-04T00:00:00.000Z",
        delivered: false,
      },
    ];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/agents") return jsonResponse({ agents: roles });
      if (url === "/api/channels") return jsonResponse({ messages: handoffs });
      if (url === "/api/channels/prune" && init?.method === "POST") {
        handoffs = [];
        return jsonResponse({ prunedMessageIds: ["msg-9"] });
      }
      if (url === "/api/agents/codex-executor/inbox") return jsonResponse({ messages: [] });
      return jsonResponse({ error: `Unexpected request: ${url}` }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ConversationsPrimaryView columns={[]} enabled />);

    expect(
      await screen.findByText("This queued handoff cannot reach its removed target."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clean orphaned handoffs" }));
    expect(
      await screen.findByLabelText("Clean orphaned handoffs confirmation"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm clean orphaned handoffs" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/channels/prune", { method: "POST" });
    });
    expect(await screen.findByText("Removed 1 orphaned queued handoff.")).toBeInTheDocument();
    expect(
      screen.queryByText("This queued handoff cannot reach its removed target."),
    ).not.toBeInTheDocument();
  });
});
