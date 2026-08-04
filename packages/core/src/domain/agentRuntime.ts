export type AgentRuntimeState =
  | "idle"
  | "processing"
  | "waiting_for_permission"
  | "waiting_for_user";

export const isAgentRuntimeState = (value: unknown): value is AgentRuntimeState =>
  value === "idle" ||
  value === "processing" ||
  value === "waiting_for_permission" ||
  value === "waiting_for_user";

export type TerminalAgentProvider =
  | "codex"
  | "claude-code"
  | "gemini-cli"
  | "perplexity"
  | "notebooklm"
  | "lm-studio"
  | "notion"
  | "stitch"
  | "antigravity"
  | "custom";

export const TERMINAL_AGENT_PROVIDERS: TerminalAgentProvider[] = [
  "codex",
  "claude-code",
  "gemini-cli",
  "perplexity",
  "notebooklm",
  "lm-studio",
  "notion",
  "stitch",
  "antigravity",
  "custom",
];

export const TERMINAL_AGENT_PROVIDER_LABELS: Record<TerminalAgentProvider, string> = {
  codex: "Codex",
  "claude-code": "Claude Code",
  "gemini-cli": "Gemini CLI",
  perplexity: "Perplexity Research",
  notebooklm: "NotebookLM",
  "lm-studio": "Qwen / LM Studio",
  notion: "Notion",
  stitch: "Google Stitch",
  antigravity: "Antigravity",
  custom: "Custom",
};

export const isTerminalAgentProvider = (value: unknown): value is TerminalAgentProvider =>
  typeof value === "string" && TERMINAL_AGENT_PROVIDERS.includes(value as TerminalAgentProvider);
