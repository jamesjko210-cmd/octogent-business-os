import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MemoryCenterPanel } from "../src/components/MemoryCenterPanel";

const jsonResponse = (payload: unknown) =>
  new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
  });

describe("MemoryCenterPanel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows durable entries and searches the local memory spine", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/memory") {
        return jsonResponse({
          entries: [
            {
              id: "mem-1",
              type: "decision",
              content: "Use the scoped workflow handoff.",
              summary: "Use the scoped workflow handoff.",
              tags: ["workflow"],
              source: "record-center",
              tentacleId: "game-business",
              updatedAt: "2026-08-04T00:00:00.000Z",
            },
          ],
        });
      }
      if (url === "/api/memory?query=handoff") {
        return jsonResponse({
          entries: [
            {
              id: "mem-2",
              type: "handoff",
              content: "CEO Command received verified QA evidence.",
              tags: ["handoff"],
              source: "codex-executor",
              updatedAt: "2026-08-04T00:00:00.000Z",
            },
          ],
        });
      }
      return jsonResponse({ error: `Unexpected request: ${url}` });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<MemoryCenterPanel />);

    expect(await screen.findByText("Use the scoped workflow handoff.")).toBeInTheDocument();
    expect(screen.getByText("1 entries")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search shared memory"), {
      target: { value: "handoff" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(
      await screen.findByText("CEO Command received verified QA evidence."),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/memory?query=handoff", {
        headers: { Accept: "application/json" },
      });
    });
  });
});
