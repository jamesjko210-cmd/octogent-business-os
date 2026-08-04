import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import type { WorkflowRunEvidence, WorkflowRunOutcome } from "@octogent/core";

const LOCAL_WORKFLOW_ID = "workflow-game-qa-balance";
const COMMAND_TIMEOUT_MS = 60_000;
const MAX_CAPTURED_OUTPUT_CHARS = 2_000;

type AllowlistedCheck = {
  label: string;
  file: string;
};

const BLOCK_BOUNCE_CHECKS: readonly AllowlistedCheck[] = [
  { label: "Game engine tests", file: "tests/game-engine.test.mjs" },
  { label: "Ranking tests", file: "tests/rankings.test.mjs" },
];

export type LocalWorkflowExecutionResult = {
  outcome: Omit<WorkflowRunOutcome, "completedAt">;
  output: string;
};

const redactSensitiveText = (value: string) =>
  value
    .replace(
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
      "[redacted private key]",
    )
    .replace(/\b(?:sk|pk|ghp|github_pat)_[A-Za-z0-9_-]+\b/gi, "[redacted credential]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+/gi, "Bearer [redacted]")
    .replace(/\b(api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]\s*\S+/gi, "$1=[redacted]");

const blockBounceDirectory = (workspaceCwd: string) =>
  process.env.OCTOGENT_BLOCK_BOUNCE_DIR?.trim()
    ? resolve(process.env.OCTOGENT_BLOCK_BOUNCE_DIR)
    : resolve(workspaceCwd, "..", "game");

const runCheck = async ({ cwd, check }: { cwd: string; check: AllowlistedCheck }) => {
  const filePath = resolve(cwd, check.file);
  if (!existsSync(filePath)) {
    return { ok: false, output: `${check.label} file is not available.` };
  }

  return new Promise<{ ok: boolean; output: string }>((resolveRun) => {
    const child = spawn(process.execPath, [check.file], {
      cwd,
      env: { NODE_ENV: "test", PATH: process.env.PATH ?? "" },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let timedOut = false;
    const appendOutput = (chunk: Buffer) => {
      output = `${output}${chunk.toString()}`.slice(-MAX_CAPTURED_OUTPUT_CHARS);
    };
    child.stdout.on("data", appendOutput);
    child.stderr.on("data", appendOutput);
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, COMMAND_TIMEOUT_MS);
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolveRun({ ok: false, output: error.message });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      resolveRun({
        ok: exitCode === 0 && !timedOut,
        output: timedOut ? `${check.label} timed out.` : output,
      });
    });
  });
};

export const isAllowlistedLocalWorkflow = (workflowId: string) => workflowId === LOCAL_WORKFLOW_ID;

export const executeAllowlistedLocalWorkflow = async ({
  workflowId,
  workspaceCwd,
}: {
  workflowId: string;
  workspaceCwd: string;
}): Promise<LocalWorkflowExecutionResult> => {
  if (!isAllowlistedLocalWorkflow(workflowId)) {
    throw new Error("This workflow has no allowlisted local executor.");
  }

  const cwd = blockBounceDirectory(workspaceCwd);
  if (!existsSync(cwd)) {
    return {
      outcome: {
        status: "blocked",
        summary: "The local Block Bounce project directory is not available for verification.",
        evidence: [],
      },
      output: "Block Bounce project directory is not available.",
    };
  }

  const evidence: WorkflowRunEvidence[] = [];
  const outputs: string[] = [];
  for (const check of BLOCK_BOUNCE_CHECKS) {
    const result = await runCheck({ cwd, check });
    outputs.push(`${check.label}: ${result.output}`);
    evidence.push({
      kind: "test",
      summary: result.ok ? `${check.label} passed.` : `${check.label} failed.`,
      occurredAt: new Date().toISOString(),
    });
    if (!result.ok) {
      return {
        outcome: {
          status: "failed",
          summary: `${check.label} failed during the allowlisted Block Bounce verification run.`,
          evidence,
        },
        output: redactSensitiveText(outputs.join("\n")).slice(-MAX_CAPTURED_OUTPUT_CHARS),
      };
    }
  }

  return {
    outcome: {
      status: "succeeded",
      summary: `${BLOCK_BOUNCE_CHECKS.length} allowlisted Block Bounce verification checks passed.`,
      evidence,
    },
    output: redactSensitiveText(outputs.join("\n")).slice(-MAX_CAPTURED_OUTPUT_CHARS),
  };
};
