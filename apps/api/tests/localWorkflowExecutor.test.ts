import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  executeAllowlistedLocalWorkflow,
  isAllowlistedLocalWorkflow,
} from "../src/localWorkflowExecutor";

const temporaryDirectories: string[] = [];

const createBlockBounceFixture = ({
  failingRanking = false,
}: { failingRanking?: boolean } = {}) => {
  const root = mkdtempSync(join(tmpdir(), "octogent-local-executor-"));
  temporaryDirectories.push(root);
  const workspaceCwd = join(root, "octogent");
  const testDirectory = join(root, "game", "tests");
  mkdirSync(workspaceCwd, { recursive: true });
  mkdirSync(testDirectory, { recursive: true });
  writeFileSync(join(testDirectory, "game-engine.test.mjs"), "console.log('engine ok');\n", "utf8");
  writeFileSync(
    join(testDirectory, "rankings.test.mjs"),
    failingRanking
      ? "console.error('ranking failed'); process.exit(1);\n"
      : "console.log('ranking ok');\n",
    "utf8",
  );
  return workspaceCwd;
};

afterEach(() => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
  temporaryDirectories.length = 0;
});

describe("localWorkflowExecutor", () => {
  it("runs only the two fixed Block Bounce verification files", async () => {
    const result = await executeAllowlistedLocalWorkflow({
      workflowId: "workflow-game-qa-balance",
      workspaceCwd: createBlockBounceFixture(),
    });

    expect(result.outcome).toEqual(
      expect.objectContaining({
        status: "succeeded",
        summary: "2 allowlisted Block Bounce verification checks passed.",
        evidence: [
          expect.objectContaining({ summary: "Game engine tests passed." }),
          expect.objectContaining({ summary: "Ranking tests passed." }),
        ],
      }),
    );
    expect(result.output).toContain("engine ok");
    expect(result.output).toContain("ranking ok");
  });

  it("records the fixed check that failed without accepting arbitrary workflow IDs", async () => {
    const result = await executeAllowlistedLocalWorkflow({
      workflowId: "workflow-game-qa-balance",
      workspaceCwd: createBlockBounceFixture({ failingRanking: true }),
    });

    expect(result.outcome.status).toBe("failed");
    expect(result.outcome.evidence).toEqual([
      expect.objectContaining({ summary: "Game engine tests passed." }),
      expect.objectContaining({ summary: "Ranking tests failed." }),
    ]);
    expect(isAllowlistedLocalWorkflow("workflow-research-triad-brief")).toBe(false);
    await expect(
      executeAllowlistedLocalWorkflow({
        workflowId: "workflow-research-triad-brief",
        workspaceCwd: createBlockBounceFixture(),
      }),
    ).rejects.toThrow("no allowlisted local executor");
  });

  it("records a blocked outcome when the local Block Bounce project is unavailable", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "octogent-local-executor-missing-game-"));
    temporaryDirectories.push(workspaceCwd);

    const result = await executeAllowlistedLocalWorkflow({
      workflowId: "workflow-game-qa-balance",
      workspaceCwd,
    });

    expect(result.outcome).toEqual({
      status: "blocked",
      summary: "The local Block Bounce project directory is not available for verification.",
      evidence: [],
    });
  });
});
