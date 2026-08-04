import type { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { createProviderHandshakeRunner } from "../src/providerHandshake";

describe("provider handshake runner", () => {
  it("uses one fixed isolated Codex command and stores no response text", () => {
    const exec = vi.fn((_: string, args: readonly string[]) => {
      const outputPath = args[8];
      if (typeof outputPath !== "string") throw new Error("Missing output path.");
      writeFileSync(outputPath, "OCTOGENT_PROVIDER_HANDSHAKE_OK");
      return "";
    });
    const runner = createProviderHandshakeRunner({
      now: () => new Date("2026-08-05T00:00:00.000Z"),
      execFileSyncImpl: exec as unknown as typeof execFileSync,
      isCodexAvailable: () => true,
    });

    expect(runner.runCodex()).toEqual({
      provider: "codex",
      status: "succeeded",
      checkedAt: "2026-08-05T00:00:00.000Z",
      detail: "Codex returned the expected isolated read-only handshake response.",
    });
    expect(exec).toHaveBeenCalledWith(
      "codex",
      expect.arrayContaining([
        "exec",
        "--ephemeral",
        "--ignore-rules",
        "--ignore-user-config",
        "--sandbox",
        "read-only",
      ]),
      expect.objectContaining({ timeout: 45_000 }),
    );
  });

  it("refuses repeated checks for five minutes", () => {
    let now = new Date("2026-08-05T00:00:00.000Z");
    const runner = createProviderHandshakeRunner({
      now: () => now,
      execFileSyncImpl: (() => {
        throw new Error("simulated failure");
      }) as unknown as typeof execFileSync,
      isCodexAvailable: () => true,
    });

    expect(runner.runCodex().status).toBe("failed");
    now = new Date("2026-08-05T00:01:00.000Z");
    expect(runner.runCodex()).toMatchObject({
      status: "rate_limited",
      retryAt: "2026-08-05T00:05:00.000Z",
    });
  });

  it("reports unavailable when Codex is absent", () => {
    const runner = createProviderHandshakeRunner({
      now: () => new Date("2026-08-05T00:00:00.000Z"),
      isCodexAvailable: () => false,
    });

    expect(runner.runCodex()).toMatchObject({
      status: "unavailable",
      detail: "Codex CLI is unavailable on this Mac.",
    });
  });
});
