import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { renderGoalRuntimeSection } from "../src/goalRuntime";
import { createGoalStore } from "../src/goalStore";

describe("renderGoalRuntimeSection", () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories) {
      rmSync(directory, { recursive: true, force: true });
    }
    temporaryDirectories.length = 0;
  });

  it("shows role terminals only the active and planned goals they own", () => {
    const projectStateDir = mkdtempSync(join(tmpdir(), "octogent-goal-runtime-"));
    temporaryDirectories.push(projectStateDir);
    const store = createGoalStore(projectStateDir);
    store.create({
      title: "Run Codex verification",
      ownerAgentId: "codex-executor",
      tentacleId: "game-business",
    });
    store.create({
      title: "Review player feedback",
      ownerAgentId: "service-council",
      tentacleId: "game-business",
    });

    const promptSection = renderGoalRuntimeSection({
      projectStateDir,
      tentacleId: "game-business",
      ownerAgentId: "codex-executor",
    });

    expect(promptSection).toContain("Run Codex verification");
    expect(promptSection).not.toContain("Review player feedback");
  });
});
