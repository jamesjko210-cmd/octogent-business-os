import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import type { AgenticOsBrain, WorkspaceSetupSnapshot, WorkspaceSetupStep } from "@octogent/core";

import { readDeckTentacles } from "./deck/readDeckTentacles";
import {
  deriveProjectIdFromWorkspace,
  ensureOctogentGitignoreEntry,
  ensureProjectScaffold,
  hasOctogentGitignoreEntry,
  loadProjectConfig,
  migrateStateToGlobal,
  registerProject,
} from "./projectPersistence";
import { readSetupState } from "./setupState";
import {
  collectStartupPrerequisiteReport,
  readCodexCliAuthentication,
} from "./startupPrerequisites";

export const initializeWorkspaceFiles = (workspaceCwd: string, projectStateDir: string) => {
  const projectName = loadProjectConfig(workspaceCwd)?.displayName;
  const projectConfig = ensureProjectScaffold(
    workspaceCwd,
    projectName,
    deriveProjectIdFromWorkspace(workspaceCwd),
  );
  registerProject(workspaceCwd, projectConfig.displayName);
  mkdirSync(join(projectStateDir, "state"), { recursive: true });
  migrateStateToGlobal(workspaceCwd, projectStateDir);

  return { projectConfig, projectStateDir };
};

export const ensureWorkspaceGitignore = (workspaceCwd: string) =>
  ensureOctogentGitignoreEntry(workspaceCwd);

export const readWorkspaceSetupSnapshot = (
  workspaceCwd: string,
  projectStateDir: string,
): WorkspaceSetupSnapshot => {
  const prerequisites = collectStartupPrerequisiteReport();
  const projectConfig = loadProjectConfig(workspaceCwd);
  const octogentDir = join(workspaceCwd, ".octogent");
  const hasProjectScaffold =
    projectConfig !== null &&
    existsSync(join(octogentDir, "tentacles")) &&
    existsSync(join(octogentDir, "worktrees")) &&
    existsSync(join(projectStateDir, "state"));
  const hasGitignore = hasOctogentGitignoreEntry(workspaceCwd);
  const tentacles = readDeckTentacles(workspaceCwd, projectStateDir);
  const tentacleCount = tentacles.length;
  const hasAnyTentacles = tentacleCount > 0;
  const setupState = readSetupState(projectStateDir);
  const isFirstRun = !hasAnyTentacles && !setupState.tentaclesInitializedAt;
  const verifiedSteps = setupState.verifiedSteps ?? {};
  const isClaudeVerified = Boolean(verifiedSteps["check-claude"]);
  const isGitVerified = Boolean(verifiedSteps["check-git"]);
  const isCurlVerified = Boolean(verifiedSteps["check-curl"]);
  const hasClaudeCode = prerequisites.availability.claude;
  const codexAuthentication = readCodexCliAuthentication({
    isAvailable: (command) => (command === "codex" ? prerequisites.availability.codex : false),
  });
  const hasGit = prerequisites.availability.git;
  const hasCurl = prerequisites.availability.curl;
  const brain = (
    id: AgenticOsBrain["id"],
    label: string,
    role: string,
    available: boolean,
    command: string,
    guidance: string,
    workflowUrl: string,
    authenticated = false,
  ): AgenticOsBrain => ({
    id,
    label,
    role,
    // Command discovery proves only a local launcher is present, not login or a provider response.
    status: authenticated ? "authenticated_local" : available ? "available_local" : "needs_setup",
    command,
    guidance,
    workflowUrl,
  });
  const brains: AgenticOsBrain[] = [
    brain(
      "claude",
      "Claude Sonnet / Opus",
      "Base planning brain: Sonnet for business/coding operations and synthesis; Opus only for complex escalations.",
      prerequisites.availability.claude,
      "claude",
      "Install Claude Code and run `claude login`.",
      process.env.OCTOGENT_CLAUDE_URL?.trim() || "https://claude.ai/",
    ),
    brain(
      "notion",
      "Notion",
      "Shared memory, decision logs, project wiki, and operating docs.",
      prerequisites.availability.notion,
      "OCTOGENT_NOTION_COMMAND",
      "Set OCTOGENT_NOTION_COMMAND to a local script that opens or syncs Notion memory.",
      process.env.OCTOGENT_NOTION_URL?.trim() || "https://www.notion.com/",
    ),
    brain(
      "gemini",
      "Gemini Pro / Flash",
      "Pro handles Google-family, multimodal, and long-context research; Flash handles fast bulk processing.",
      prerequisites.availability.gemini,
      "gemini",
      "Install Gemini CLI, or set a custom Gemini command wrapper.",
      process.env.OCTOGENT_GEMINI_URL?.trim() || "https://gemini.google.com/",
    ),
    brain(
      "codex",
      "Codex",
      "Execution engine for code edits, tests, builds, and repository maintenance.",
      prerequisites.availability.codex,
      "codex",
      codexAuthentication === "authenticated"
        ? "Local Codex CLI session is signed in. A model response is still unverified."
        : "Install Codex CLI and run `codex login`.",
      process.env.OCTOGENT_CODEX_URL?.trim() || "https://chatgpt.com/codex",
      codexAuthentication === "authenticated",
    ),
    brain(
      "stitch",
      "Google Stitch",
      "UI/UX production, screen generation, and design handoff.",
      prerequisites.availability.stitch,
      "OCTOGENT_STITCH_COMMAND",
      "Set OCTOGENT_STITCH_COMMAND to a script that opens or prepares Stitch work.",
      process.env.OCTOGENT_STITCH_URL?.trim() || "https://stitch.withgoogle.com/",
    ),
    brain(
      "perplexity",
      "Perplexity",
      "Current-source research and citation-heavy market checks.",
      prerequisites.availability.perplexity,
      "pplx / OCTOGENT_PERPLEXITY_COMMAND",
      "Install a Perplexity CLI wrapper or set OCTOGENT_PERPLEXITY_COMMAND.",
      process.env.OCTOGENT_PERPLEXITY_URL?.trim() || "https://www.perplexity.ai/",
    ),
    brain(
      "notebooklm",
      "NotebookLM",
      "Curated source-grounded research room for selected links, PDFs, transcripts, and source Q&A.",
      prerequisites.availability.notebooklm,
      "OCTOGENT_NOTEBOOKLM_COMMAND",
      "Set OCTOGENT_NOTEBOOKLM_COMMAND to a script that opens or syncs NotebookLM research.",
      process.env.OCTOGENT_NOTEBOOKLM_URL?.trim() || "https://notebooklm.google.com/",
    ),
    brain(
      "qwen",
      "Qwen / LM Studio",
      "Local Qwen workers for private, low-cost background drafting, tagging, and memory extraction.",
      prerequisites.availability.lmStudio,
      "lms / OCTOGENT_LM_STUDIO_COMMAND",
      "Install LM Studio and load a Qwen model, or set OCTOGENT_LM_STUDIO_COMMAND.",
      process.env.OCTOGENT_LM_STUDIO_URL?.trim() || "https://lmstudio.ai/",
    ),
  ];

  const steps: WorkspaceSetupStep[] = [
    {
      id: "initialize-workspace",
      title: "Initialize workspace",
      description: "Create Octogent project files and runtime directories.",
      complete: hasProjectScaffold,
      required: true,
      actionLabel: "Initialize workspace",
      statusText: hasProjectScaffold
        ? "Workspace files are ready."
        : "Create .octogent project files before continuing.",
      guidance: hasProjectScaffold
        ? null
        : "Workspace initialization failed. Run the Octogent initializer in this repository.",
      command: hasProjectScaffold ? null : "octogent init",
    },
    {
      id: "ensure-gitignore",
      title: "Ignore .octogent",
      description: "Add .octogent to .gitignore, or create .gitignore when it is missing.",
      complete: hasGitignore,
      required: true,
      actionLabel: "Update .gitignore",
      statusText: hasGitignore
        ? ".gitignore covers .octogent."
        : "Add .octogent to .gitignore before creating tentacles.",
      guidance: hasGitignore
        ? null
        : "Git ignore entry is missing. Create or update .gitignore with the Octogent workspace path.",
      command: hasGitignore ? null : "printf '.octogent\\n' >> .gitignore",
    },
    {
      id: "check-claude",
      title: "Check Claude Code",
      description: "Verify the default Claude Code workflow is available on this machine.",
      complete: hasClaudeCode && isClaudeVerified,
      required: false,
      actionLabel: "Check Claude Code",
      statusText: hasClaudeCode
        ? isClaudeVerified
          ? "Claude Code is available."
          : "Confirm Claude Code before using the planner."
        : "Claude Code is unavailable.",
      guidance: hasClaudeCode
        ? isClaudeVerified
          ? null
          : "Click to verify the Claude Code workflow on this machine."
        : "Install Claude Code and log in before using the default Claude workflow.",
      command: hasClaudeCode ? null : "claude login",
    },
    {
      id: "check-git",
      title: "Check Git",
      description: "Verify Git is available for worktree-backed tentacles.",
      complete: hasGit && isGitVerified,
      required: false,
      actionLabel: "Check Git",
      statusText: hasGit
        ? isGitVerified
          ? "Git is available."
          : "Confirm Git before launching worktree-backed tentacles."
        : "Git is unavailable.",
      guidance: hasGit
        ? isGitVerified
          ? null
          : "Click to verify Git support for worktree terminal flows."
        : "Install Git to enable worktree terminals and branch flows.",
      command: hasGit ? null : "git --version",
    },
    {
      id: "check-curl",
      title: "Check curl",
      description: "Verify curl is available for Claude hook callbacks.",
      complete: hasCurl && isCurlVerified,
      required: false,
      actionLabel: "Check curl",
      statusText: hasCurl
        ? isCurlVerified
          ? "curl is available."
          : "Confirm curl before using Claude hook callbacks."
        : "curl is unavailable.",
      guidance: hasCurl
        ? isCurlVerified
          ? null
          : "Click to verify hook callback support on this machine."
        : "Install curl to restore Claude hook callbacks.",
      command: hasCurl ? null : "curl --version",
    },
    {
      id: "create-tentacles",
      title: "Create tentacles",
      description: "Create at least one tentacle before launching a coding agent.",
      complete: hasAnyTentacles,
      required: true,
      actionLabel: null,
      statusText: hasAnyTentacles
        ? `${tentacleCount} tentacle${tentacleCount === 1 ? "" : "s"} ready.`
        : "Create your first tentacle to continue.",
      guidance: hasAnyTentacles
        ? null
        : "Use the planner or manual creation to add at least one tentacle.",
      command: null,
    },
  ];

  return {
    isFirstRun,
    shouldShowSetupCard: isFirstRun || (!hasAnyTentacles && (!hasProjectScaffold || !hasGitignore)),
    hasAnyTentacles,
    tentacleCount,
    steps,
    agenticOs: {
      brains,
    },
  };
};
