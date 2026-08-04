import { execFileSync } from "node:child_process";

export type StartupPrerequisiteSeverity = "error" | "warning";

export type StartupPrerequisiteIssue = {
  command: string;
  severity: StartupPrerequisiteSeverity;
  summary: string;
  guidance: string;
};

export type StartupPrerequisiteAvailability = Record<
  | "claude"
  | "codex"
  | "gemini"
  | "perplexity"
  | "notebooklm"
  | "lmStudio"
  | "notion"
  | "stitch"
  | "antigravity"
  | "custom"
  | "git"
  | "gh"
  | "curl",
  boolean
>;

export type StartupPrerequisiteReport = {
  availability: StartupPrerequisiteAvailability;
  errors: StartupPrerequisiteIssue[];
  warnings: StartupPrerequisiteIssue[];
};

type CommandAvailabilityChecker = (command: string) => boolean;

type CommandAvailabilityOptions = {
  platform?: NodeJS.Platform;
  execFileSyncImpl?: typeof execFileSync;
};

const resolveLookupCommand = (platform: NodeJS.Platform) =>
  platform === "win32"
    ? { file: "where", args: [] as string[] }
    : { file: "which", args: [] as string[] };

export const isCommandAvailable = (
  command: string,
  options: CommandAvailabilityOptions = {},
): boolean => {
  const lookup = resolveLookupCommand(options.platform ?? process.platform);

  try {
    (options.execFileSyncImpl ?? execFileSync)(lookup.file, [...lookup.args, command], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
};

export const collectStartupPrerequisiteReport = (
  isAvailable: CommandAvailabilityChecker = (command) => isCommandAvailable(command),
): StartupPrerequisiteReport => {
  const availability: StartupPrerequisiteAvailability = {
    claude: isAvailable("claude"),
    codex: isAvailable("codex"),
    gemini: isAvailable("gemini"),
    perplexity: isAvailable("pplx") || Boolean(process.env.OCTOGENT_PERPLEXITY_COMMAND?.trim()),
    notebooklm:
      isAvailable("notebooklm") || Boolean(process.env.OCTOGENT_NOTEBOOKLM_COMMAND?.trim()),
    lmStudio: isAvailable("lms") || Boolean(process.env.OCTOGENT_LM_STUDIO_COMMAND?.trim()),
    notion: isAvailable("notion") || Boolean(process.env.OCTOGENT_NOTION_COMMAND?.trim()),
    stitch: isAvailable("stitch") || Boolean(process.env.OCTOGENT_STITCH_COMMAND?.trim()),
    antigravity:
      isAvailable("antigravity") || Boolean(process.env.OCTOGENT_ANTIGRAVITY_COMMAND?.trim()),
    custom: Boolean(process.env.OCTOGENT_CUSTOM_AGENT_COMMAND?.trim()),
    git: isAvailable("git"),
    gh: isAvailable("gh"),
    curl: isAvailable("curl"),
  };

  const errors: StartupPrerequisiteIssue[] = [];
  const warnings: StartupPrerequisiteIssue[] = [];

  if (
    !availability.claude &&
    !availability.codex &&
    !availability.gemini &&
    !availability.perplexity &&
    !availability.notebooklm &&
    !availability.lmStudio &&
    !availability.notion &&
    !availability.stitch &&
    !availability.antigravity &&
    !availability.custom
  ) {
    errors.push({
      command: "claude/codex/gemini/pplx/notebooklm/lms/notion/stitch/antigravity/custom",
      severity: "error",
      summary: "No supported agent CLI is installed.",
      guidance:
        "Install at least one agent CLI before starting Octogent. Core providers use `claude`, `codex`, `gemini`, `pplx`, `lms`, or an OCTOGENT_*_COMMAND override.",
    });
  } else {
    if (!availability.claude) {
      warnings.push({
        command: "claude",
        severity: "warning",
        summary: "`claude` is not installed.",
        guidance:
          "Claude-backed terminals are unavailable. Install Claude Code and run `claude login` if you want the default Claude provider.",
      });
    }

    if (!availability.codex) {
      warnings.push({
        command: "codex",
        severity: "warning",
        summary: "`codex` is not installed.",
        guidance:
          "Codex-backed terminals and Codex usage telemetry are unavailable. Install Codex CLI and run `codex login` if you want Codex terminals.",
      });
    }

    if (!availability.gemini) {
      warnings.push({
        command: "gemini",
        severity: "warning",
        summary: "`gemini` is not installed.",
        guidance:
          "Gemini-backed terminals are unavailable. Install Gemini CLI if you want Gemini agents.",
      });
    }

    if (!availability.perplexity) {
      warnings.push({
        command: "pplx",
        severity: "warning",
        summary: "`pplx` is not installed.",
        guidance:
          "Perplexity research terminals are unavailable through the default command. Install a Perplexity CLI wrapper or set OCTOGENT_PERPLEXITY_COMMAND to your local research command.",
      });
    }

    if (!availability.notebooklm) {
      warnings.push({
        command: "notebooklm",
        severity: "warning",
        summary: "No NotebookLM workflow command is configured.",
        guidance:
          "NotebookLM terminals need a local wrapper command. Set OCTOGENT_NOTEBOOKLM_COMMAND to a script that opens or syncs your curated source-grounded research workflow.",
      });
    }

    if (!availability.lmStudio) {
      warnings.push({
        command: "lms",
        severity: "warning",
        summary: "`lms` is not installed.",
        guidance:
          "Qwen/LM Studio-backed terminals are unavailable through the default command. Install LM Studio with a Qwen model or set OCTOGENT_LM_STUDIO_COMMAND to your local chat command.",
      });
    }

    if (!availability.notion) {
      warnings.push({
        command: "notion",
        severity: "warning",
        summary: "No Notion workflow command is configured.",
        guidance:
          "Notion terminals need a local wrapper command. Set OCTOGENT_NOTION_COMMAND to a script that opens or syncs your Notion memory workflow.",
      });
    }

    if (!availability.stitch) {
      warnings.push({
        command: "stitch",
        severity: "warning",
        summary: "No Google Stitch workflow command is configured.",
        guidance:
          "Stitch terminals need a local wrapper command. Set OCTOGENT_STITCH_COMMAND to a script that opens or prepares your UI/UX workflow.",
      });
    }
  }

  if (!availability.git) {
    warnings.push({
      command: "git",
      severity: "warning",
      summary: "`git` is not installed.",
      guidance:
        "Worktree terminals and git lifecycle actions are unavailable. Install Git to enable branch/worktree flows.",
    });
  }

  if (!availability.gh) {
    warnings.push({
      command: "gh",
      severity: "warning",
      summary: "`gh` is not installed.",
      guidance:
        "GitHub pull request features are unavailable. Install GitHub CLI and run `gh auth login` to enable PR actions.",
    });
  }

  if (!availability.curl) {
    warnings.push({
      command: "curl",
      severity: "warning",
      summary: "`curl` is not installed.",
      guidance:
        "Claude hook command callbacks for SessionStart, UserPromptSubmit, and Stop are unavailable. Install curl to restore full Claude hook delivery.",
    });
  }

  return { availability, errors, warnings };
};

export const formatStartupPrerequisiteReport = (report: StartupPrerequisiteReport): string[] => {
  if (report.errors.length === 0 && report.warnings.length === 0) {
    return [];
  }

  const lines = ["Octogent startup preflight:"];

  for (const issue of report.errors) {
    lines.push(`  Error: ${issue.summary}`);
    lines.push(`    ${issue.guidance}`);
  }

  for (const issue of report.warnings) {
    lines.push(`  Warning: ${issue.summary}`);
    lines.push(`    ${issue.guidance}`);
  }

  return lines;
};
