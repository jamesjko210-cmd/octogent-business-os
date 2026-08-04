import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TelegramBridgePanel } from "../src/components/TelegramBridgePanel";

const jsonResponse = (payload: unknown) =>
  new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } });

describe("TelegramBridgePanel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows local safe reports alongside the Telegram bridge status", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/telegram/status") {
        return jsonResponse({
          state: "running",
          mode: "long_polling",
          allowedChatCount: 1,
          commands: ["/help", "/agent <role-id> <message>", "/updates [role-id]"],
          detail: "Trusted chat only.",
        });
      }
      if (url === "/api/operator-updates") {
        return jsonResponse({
          updates: [
            {
              updateId: "operator-update-1",
              agentId: "codex-executor",
              content: "Focused checks passed with api_key=[redacted].",
            },
          ],
        });
      }
      return jsonResponse({ error: `Unexpected request: ${url}` });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TelegramBridgePanel />);

    expect(await screen.findByText("Recent agent reports")).toBeInTheDocument();
    expect(screen.getByText("codex-executor")).toBeInTheDocument();
    expect(screen.getByText("Focused checks passed with api_key=[redacted].")).toBeInTheDocument();
    expect(screen.getByText(/Telegram sends them only when you request/)).toBeInTheDocument();
  });
});
