import { afterEach, describe, expect, it, vi } from "vitest";

import {
  collectStartupPrerequisiteReport,
  formatStartupPrerequisiteReport,
  isCommandAvailable,
} from "../src/startupPrerequisites";

describe("startup prerequisites", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("passes cleanly when every prerequisite is installed", () => {
    const report = collectStartupPrerequisiteReport(() => true);

    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(formatStartupPrerequisiteReport(report)).toEqual([]);
  });

  it("fails startup when no agent CLI is installed", () => {
    const report = collectStartupPrerequisiteReport((command) => command === "git");

    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]?.summary).toContain("No supported agent CLI");
    expect(report.warnings.map((issue) => issue.command)).toEqual(["gh", "curl"]);
  });

  it("warns for degraded optional integrations when one provider is available", () => {
    const report = collectStartupPrerequisiteReport((command) => command === "codex");

    expect(report.errors).toEqual([]);
    expect(report.warnings.map((issue) => issue.command)).toEqual([
      "claude",
      "gemini",
      "pplx",
      "notebooklm",
      "lms",
      "notion",
      "stitch",
      "git",
      "gh",
      "curl",
    ]);
    expect(formatStartupPrerequisiteReport(report)).toEqual([
      "Octogent startup preflight:",
      "  Warning: `claude` is not installed.",
      "    Claude-backed terminals are unavailable. Install Claude Code and run `claude login` if you want the default Claude provider.",
      "  Warning: `gemini` is not installed.",
      "    Gemini-backed terminals are unavailable. Install Gemini CLI if you want Gemini agents.",
      "  Warning: `pplx` is not installed.",
      "    Perplexity research terminals are unavailable through the default command. Install a Perplexity CLI wrapper or set OCTOGENT_PERPLEXITY_COMMAND to your local research command.",
      "  Warning: No NotebookLM workflow command is configured.",
      "    NotebookLM terminals need a local wrapper command. Set OCTOGENT_NOTEBOOKLM_COMMAND to a script that opens or syncs your curated source-grounded research workflow.",
      "  Warning: `lms` is not installed.",
      "    Qwen/LM Studio-backed terminals are unavailable through the default command. Install LM Studio with a Qwen model or set OCTOGENT_LM_STUDIO_COMMAND to your local chat command.",
      "  Warning: No Notion workflow command is configured.",
      "    Notion terminals need a local wrapper command. Set OCTOGENT_NOTION_COMMAND to a script that opens or syncs your Notion memory workflow.",
      "  Warning: No Google Stitch workflow command is configured.",
      "    Stitch terminals need a local wrapper command. Set OCTOGENT_STITCH_COMMAND to a script that opens or prepares your UI/UX workflow.",
      "  Warning: `git` is not installed.",
      "    Worktree terminals and git lifecycle actions are unavailable. Install Git to enable branch/worktree flows.",
      "  Warning: `gh` is not installed.",
      "    GitHub pull request features are unavailable. Install GitHub CLI and run `gh auth login` to enable PR actions.",
      "  Warning: `curl` is not installed.",
      "    Claude hook command callbacks for SessionStart, UserPromptSubmit, and Stop are unavailable. Install curl to restore full Claude hook delivery.",
    ]);
  });

  it("accepts no-key research wrapper commands as configured providers", () => {
    vi.stubEnv("OCTOGENT_PERPLEXITY_COMMAND", "node scripts/perplexity-workflow.mjs");
    vi.stubEnv("OCTOGENT_NOTEBOOKLM_COMMAND", "node scripts/notebooklm-workflow.mjs");
    vi.stubEnv("OCTOGENT_NOTION_COMMAND", "node scripts/notion-workflow.mjs");

    const report = collectStartupPrerequisiteReport((command) => command === "codex");

    expect(report.errors).toEqual([]);
    expect(report.warnings.map((issue) => issue.command)).not.toContain("pplx");
    expect(report.warnings.map((issue) => issue.command)).not.toContain("notebooklm");
    expect(report.warnings.map((issue) => issue.command)).not.toContain("notion");
  });

  it("uses where on Windows and which elsewhere when checking commands", () => {
    const calls: Array<{ file: string; args: string[] }> = [];

    const windowsAvailable = isCommandAvailable("claude", {
      platform: "win32",
      execFileSyncImpl: ((file, args) => {
        calls.push({ file, args: args as string[] });
        return Buffer.from("");
      }) as typeof import("node:child_process").execFileSync,
    });

    const unixAvailable = isCommandAvailable("codex", {
      platform: "linux",
      execFileSyncImpl: ((file, args) => {
        calls.push({ file, args: args as string[] });
        return Buffer.from("");
      }) as typeof import("node:child_process").execFileSync,
    });

    expect(windowsAvailable).toBe(true);
    expect(unixAvailable).toBe(true);
    expect(calls).toEqual([
      { file: "where", args: ["claude"] },
      { file: "which", args: ["codex"] },
    ]);
  });
});
