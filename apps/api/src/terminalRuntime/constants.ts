export const TERMINAL_ID_PREFIX = "terminal-";
export const TERMINAL_REGISTRY_VERSION = 3;
export const TERMINAL_REGISTRY_RELATIVE_PATH = ".octogent/state/tentacles.json";
export const TERMINAL_TRANSCRIPT_RELATIVE_PATH = ".octogent/state/transcripts";
export const TENTACLE_WORKTREE_RELATIVE_PATH = ".octogent/worktrees";
export const TENTACLE_WORKTREE_BRANCH_PREFIX = "octogent/";
export const DEFAULT_AGENT_PROVIDER = "claude-code" as const;

export const TERMINAL_BOOTSTRAP_COMMANDS: Record<string, string> = {
  codex: "codex",
  "claude-code": "claude",
  "gemini-cli": process.env.OCTOGENT_GEMINI_COMMAND?.trim() || "gemini",
  perplexity: process.env.OCTOGENT_PERPLEXITY_COMMAND?.trim() || "pplx",
  notebooklm:
    process.env.OCTOGENT_NOTEBOOKLM_COMMAND?.trim() ||
    "printf 'Set OCTOGENT_NOTEBOOKLM_COMMAND to launch a NotebookLM source-grounded research workflow.\\n'",
  "lm-studio": process.env.OCTOGENT_LM_STUDIO_COMMAND?.trim() || "lms",
  notion:
    process.env.OCTOGENT_NOTION_COMMAND?.trim() ||
    "printf 'Set OCTOGENT_NOTION_COMMAND to launch a Notion memory/provider workflow.\\n'",
  stitch:
    process.env.OCTOGENT_STITCH_COMMAND?.trim() ||
    "printf 'Set OCTOGENT_STITCH_COMMAND to launch a Google Stitch UI/UX workflow.\\n'",
  antigravity:
    process.env.OCTOGENT_ANTIGRAVITY_COMMAND?.trim() ||
    "printf 'Set OCTOGENT_ANTIGRAVITY_COMMAND to launch an Antigravity workflow.\\n'",
  custom:
    process.env.OCTOGENT_CUSTOM_AGENT_COMMAND?.trim() ||
    "printf 'Set OCTOGENT_CUSTOM_AGENT_COMMAND to launch a custom agent provider.\\n'",
};
export const TERMINAL_SESSION_IDLE_GRACE_MS = 5 * 60 * 1000;
export const TERMINAL_SCROLLBACK_MAX_BYTES = 512 * 1024;
export const TERMINAL_MAX_CONCURRENT_SESSIONS = 32;
export const DEFAULT_TERMINAL_INACTIVITY_THRESHOLD_MS = 2 * 24 * 60 * 60 * 1000; // 2 days
