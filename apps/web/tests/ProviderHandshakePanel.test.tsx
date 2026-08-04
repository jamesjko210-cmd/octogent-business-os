import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProviderHandshakePanel } from "../src/components/ProviderHandshakePanel";

const response = (payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

describe("ProviderHandshakePanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs the explicit isolated check only after the operator clicks", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        response({
          provider: "codex",
          status: "not_run",
          detail: "No provider response check has been run.",
        }),
      )
      .mockResolvedValueOnce(
        response({
          provider: "codex",
          status: "succeeded",
          checkedAt: "2026-08-05T00:00:00.000Z",
          detail: "Codex returned the expected isolated read-only handshake response.",
        }),
      );

    render(<ProviderHandshakePanel codexSignedIn />);

    await waitFor(() => {
      expect(screen.getByText("No provider response check has been run.")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Run isolated Codex provider check" }));

    await waitFor(() => {
      expect(screen.getByText("Response verified")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/providers/codex/handshake",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("keeps the check disabled when local sign-in is not verified", () => {
    render(<ProviderHandshakePanel codexSignedIn={false} />);

    expect(
      screen.getByRole("button", { name: "Run isolated Codex provider check" }),
    ).toBeDisabled();
    expect(screen.getByText(/Sign in to the local Codex CLI first/)).toBeInTheDocument();
  });
});
