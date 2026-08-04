import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { migrateStateToGlobal } from "../src/projectPersistence";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("project state migration", () => {
  it("copies every missing local state record without overwriting normalized state", () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-workspace-"));
    const projectStateDir = mkdtempSync(join(tmpdir(), "octogent-project-state-"));
    temporaryDirectories.push(workspaceCwd, projectStateDir);
    const legacyStateDir = join(workspaceCwd, ".octogent", "state");
    mkdirSync(join(legacyStateDir, "audit"), { recursive: true });
    mkdirSync(join(legacyStateDir, "transcripts"), { recursive: true });
    writeFileSync(join(legacyStateDir, "goals.json"), '{"goals":["legacy"]}\n');
    writeFileSync(join(legacyStateDir, "memory.json"), '{"memory":["shared"]}\n');
    writeFileSync(join(legacyStateDir, "audit", "events.jsonl"), '{"event":"legacy"}\n');
    writeFileSync(join(legacyStateDir, "transcripts", "worker.log"), "legacy transcript\n");

    const normalizedStateDir = join(projectStateDir, "state");
    mkdirSync(normalizedStateDir, { recursive: true });
    writeFileSync(join(normalizedStateDir, "memory.json"), '{"memory":["newer"]}\n');

    migrateStateToGlobal(workspaceCwd, projectStateDir);

    expect(readFileSync(join(normalizedStateDir, "goals.json"), "utf8")).toContain("legacy");
    expect(readFileSync(join(normalizedStateDir, "memory.json"), "utf8")).toContain("newer");
    expect(readFileSync(join(normalizedStateDir, "audit", "events.jsonl"), "utf8")).toContain(
      "legacy",
    );
    expect(readFileSync(join(normalizedStateDir, "transcripts", "worker.log"), "utf8")).toContain(
      "legacy transcript",
    );
  });
});
