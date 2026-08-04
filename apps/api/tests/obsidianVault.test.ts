import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  appendObsidianRoleUpdate,
  appendObsidianSharedTimelineUpdate,
  resolveObsidianVaultPath,
  searchObsidianSharedNotes,
} from "../src/obsidianVault";

describe("Obsidian role updates", () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories) {
      rmSync(directory, { recursive: true, force: true });
    }
    temporaryDirectories.length = 0;
  });

  it("uses a configured vault path without exposing it in the returned record", () => {
    const vaultPath = mkdtempSync(join(tmpdir(), "octogent-obsidian-vault-"));
    temporaryDirectories.push(vaultPath);

    const update = appendObsidianRoleUpdate({
      vaultPath,
      agentId: "codex-executor",
      content: "Focused test passed with api_key=not-a-real-secret.",
      timestamp: "2026-08-04T12:00:00.000Z",
    });

    expect(update).toEqual({
      relativePath: "Octogent/Agent Updates/codex-executor.md",
      contentLength: "Focused test passed with api_key=[redacted]".length,
      timestamp: "2026-08-04T12:00:00.000Z",
    });
    const content = readFileSync(join(vaultPath, update.relativePath), "utf8");
    expect(content).toContain("Focused test passed with api_key=[redacted]");
    expect(content).not.toContain("not-a-real-secret");
    expect(JSON.stringify(update)).not.toContain(vaultPath);
  });

  it("rejects path-like role IDs and unavailable vaults", () => {
    const vaultPath = mkdtempSync(join(tmpdir(), "octogent-obsidian-vault-"));
    temporaryDirectories.push(vaultPath);

    expect(() =>
      appendObsidianRoleUpdate({ vaultPath, agentId: "../record-center", content: "Unsafe." }),
    ).toThrow("Role ID is invalid");
    expect(() =>
      appendObsidianRoleUpdate({
        vaultPath: join(vaultPath, "missing"),
        agentId: "record-center",
        content: "Unavailable.",
      }),
    ).toThrow("vault is unavailable");
  });

  it("lets permanent roles contribute to one fixed shared timeline", () => {
    const vaultPath = mkdtempSync(join(tmpdir(), "octogent-obsidian-vault-"));
    temporaryDirectories.push(vaultPath);

    const update = appendObsidianSharedTimelineUpdate({
      vaultPath,
      agentId: "debugging-council",
      content: "Regression cause verified with api_key=not-a-real-secret.",
      timestamp: "2026-08-05T12:00:00.000Z",
    });

    expect(update).toEqual({
      relativePath: "Octogent/Shared/Agent Timeline.md",
      contentLength: "Regression cause verified with api_key=[redacted]".length,
      timestamp: "2026-08-05T12:00:00.000Z",
    });
    const content = readFileSync(join(vaultPath, update.relativePath), "utf8");
    expect(content).toContain("**Role:** debugging-council");
    expect(content).toContain("api_key=[redacted]");
    expect(content).not.toContain("not-a-real-secret");
  });

  it("uses the named vault environment variable when present", () => {
    expect(
      resolveObsidianVaultPath({ OCTOGENT_OBSIDIAN_VAULT_PATH: "/tmp/octogent-test-vault" }),
    ).toBe("/tmp/octogent-test-vault");
  });

  it("searches only shared project notes and redacts result snippets", () => {
    const vaultPath = mkdtempSync(join(tmpdir(), "octogent-obsidian-vault-"));
    temporaryDirectories.push(vaultPath);
    mkdirSync(join(vaultPath, "Octogent"), { recursive: true });
    writeFileSync(
      join(vaultPath, "Octogent", "Research.md"),
      "# Research\n\nBlock Bounce testing decision uses api_key=not-a-real-secret.\n",
      "utf8",
    );
    mkdirSync(join(vaultPath, "Private"), { recursive: true });
    writeFileSync(
      join(vaultPath, "Private", "Do Not Search.md"),
      "Block Bounce private note.",
      "utf8",
    );

    const results = searchObsidianSharedNotes({ vaultPath, query: "block bounce" });

    expect(results).toEqual([
      expect.objectContaining({ relativePath: "Octogent/Research.md", score: 2 }),
    ]);
    expect(JSON.stringify(results)).toContain("api_key=[redacted]");
    expect(JSON.stringify(results)).not.toContain("not-a-real-secret");
    expect(JSON.stringify(results)).not.toContain("Do Not Search");
  });
});
