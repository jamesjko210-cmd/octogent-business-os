import type { AgenticOsBrain, WorkspaceSetupSnapshot } from "@octogent/core";

import {
  TERMINAL_COMPLETION_SOUND_OPTIONS,
  type TerminalCompletionSoundId,
} from "../app/notificationSounds";
import { AgentDirectoryPanel } from "./AgentDirectoryPanel";
import { GoalCommandCenter } from "./GoalCommandCenter";
import { MemoryCenterPanel } from "./MemoryCenterPanel";
import { SessionHistoryPanel } from "./SessionHistoryPanel";
import { SwarmDirectoryPanel } from "./SwarmDirectoryPanel";
import { TelegramBridgePanel } from "./TelegramBridgePanel";
import { ActionButton } from "./ui/ActionButton";
import { SettingsToggle } from "./ui/SettingsToggle";

type SettingsPrimaryViewProps = {
  terminalCompletionSound: TerminalCompletionSoundId;
  isRuntimeStatusStripVisible: boolean;
  isMonitorVisible: boolean;
  workspaceSetup: WorkspaceSetupSnapshot | null;
  isWorkspaceSetupLoading: boolean;
  workspaceSetupError: string | null;
  onTerminalCompletionSoundChange: (soundId: TerminalCompletionSoundId) => void;
  onPreviewTerminalCompletionSound: (soundId: TerminalCompletionSoundId) => void;
  onRuntimeStatusStripVisibilityChange: (visible: boolean) => void;
  onMonitorVisibilityChange: (visible: boolean) => void;
};

const FALLBACK_BRAINS: AgenticOsBrain[] = [
  {
    id: "claude",
    label: "Claude Sonnet / Opus",
    role: "Base planning brain: Sonnet for operations and synthesis; Opus for complex escalations.",
    status: "needs_setup",
    command: "claude",
    guidance: "Load setup status to verify Claude Code.",
    workflowUrl: "https://claude.ai/",
  },
  {
    id: "notion",
    label: "Notion",
    role: "Shared memory, decision logs, project wiki, and operating docs.",
    status: "needs_setup",
    command: "OCTOGENT_NOTION_COMMAND",
    guidance: "Set a Notion memory wrapper command.",
    workflowUrl: "https://www.notion.com/",
  },
  {
    id: "gemini",
    label: "Gemini Pro / Flash",
    role: "Pro for Google-family, multimodal, and long-context research; Flash for fast bulk processing.",
    status: "needs_setup",
    command: "gemini",
    guidance: "Load setup status to verify Gemini.",
    workflowUrl: "https://gemini.google.com/",
  },
  {
    id: "codex",
    label: "Codex",
    role: "Execution engine for code edits, tests, builds, and repository maintenance.",
    status: "needs_setup",
    command: "codex",
    guidance: "Load setup status to verify Codex.",
    workflowUrl: "https://chatgpt.com/codex",
  },
  {
    id: "stitch",
    label: "Google Stitch",
    role: "UI/UX production, screen generation, and design handoff.",
    status: "needs_setup",
    command: "OCTOGENT_STITCH_COMMAND",
    guidance: "Set a Stitch workflow wrapper command.",
    workflowUrl: "https://stitch.withgoogle.com/",
  },
  {
    id: "perplexity",
    label: "Perplexity",
    role: "Current-source research, competitor scans, and citation-heavy market checks.",
    status: "needs_setup",
    command: "pplx / OCTOGENT_PERPLEXITY_COMMAND",
    guidance: "Set a Perplexity research wrapper command.",
    workflowUrl: "https://www.perplexity.ai/",
  },
  {
    id: "notebooklm",
    label: "NotebookLM",
    role: "Curated source-grounded research room for selected links, PDFs, transcripts, and Q&A.",
    status: "needs_setup",
    command: "OCTOGENT_NOTEBOOKLM_COMMAND",
    guidance: "Set a NotebookLM research workflow wrapper command.",
    workflowUrl: "https://notebooklm.google.com/",
  },
  {
    id: "qwen",
    label: "Qwen / LM Studio",
    role: "Local Qwen workers for private, low-cost background drafting, tagging, and memory extraction.",
    status: "needs_setup",
    command: "lms / OCTOGENT_LM_STUDIO_COMMAND",
    guidance: "Install LM Studio and load a Qwen model.",
    workflowUrl: "https://lmstudio.ai/",
  },
];

export const SettingsPrimaryView = ({
  terminalCompletionSound,
  isRuntimeStatusStripVisible,
  isMonitorVisible,
  workspaceSetup,
  isWorkspaceSetupLoading,
  workspaceSetupError,
  onTerminalCompletionSoundChange,
  onPreviewTerminalCompletionSound,
  onRuntimeStatusStripVisibilityChange,
  onMonitorVisibilityChange,
}: SettingsPrimaryViewProps) => {
  const brains = workspaceSetup?.agenticOs.brains ?? FALLBACK_BRAINS;
  const availableBrainCount = brains.filter((brain) => brain.status === "available_local").length;

  return (
    <section className="settings-view" aria-label="Settings primary view">
      <section className="settings-panel settings-panel--agentic-os" aria-label="Agentic OS map">
        <header className="settings-panel-header settings-agentic-os-header">
          <div>
            <h2>Agentic OS brain map</h2>
            <p>
              Your unified team roles: Claude Sonnet plans, Opus escalates, Codex executes, Gemini
              explores, Perplexity scouts, NotebookLM grounds sources, Notion remembers, Qwen drafts
              locally, and Stitch produces UI.
            </p>
          </div>
          <span className="settings-agentic-os-count">
            {isWorkspaceSetupLoading
              ? "Checking"
              : `${availableBrainCount}/${brains.length} available locally`}
          </span>
        </header>

        {workspaceSetupError && <p className="settings-agentic-os-error">{workspaceSetupError}</p>}

        <div className="settings-brain-grid">
          {brains.map((brain) => (
            <article
              className="settings-brain-card"
              data-status={brain.status}
              key={brain.id}
              aria-label={`${brain.label} ${brain.status === "available_local" ? "available locally" : "needs setup"}`}
            >
              <div className="settings-brain-card-topline">
                <span className="settings-brain-label">{brain.label}</span>
                <span className="settings-brain-status">
                  {brain.status === "available_local" ? "Available locally" : "Needs setup"}
                </span>
              </div>
              <p>{brain.role}</p>
              <code>{brain.command}</code>
              <small>{brain.guidance}</small>
              {brain.status === "available_local" ? (
                <small>Command found only. Login and provider response are not verified.</small>
              ) : null}
              <a
                className="settings-brain-open"
                href={brain.workflowUrl}
                rel="noreferrer"
                target="_blank"
              >
                Open workflow
              </a>
            </article>
          ))}
        </div>
      </section>

      <SwarmDirectoryPanel />

      <GoalCommandCenter />

      <MemoryCenterPanel />

      <SessionHistoryPanel />

      <AgentDirectoryPanel />

      <TelegramBridgePanel />

      <section className="settings-panel" aria-label="Completion notification settings">
        <header className="settings-panel-header">
          <h2>Tentacle completion sound</h2>
          <p>Play a notification when a tentacle moves from processing to idle.</p>
        </header>

        <div className="settings-sound-picker">
          {TERMINAL_COMPLETION_SOUND_OPTIONS.map((option) => (
            <button
              aria-pressed={terminalCompletionSound === option.id}
              className="settings-sound-option"
              data-active={terminalCompletionSound === option.id ? "true" : "false"}
              key={option.id}
              onClick={() => {
                onTerminalCompletionSoundChange(option.id);
                onPreviewTerminalCompletionSound(option.id);
              }}
              type="button"
            >
              <span className="settings-sound-option-label">{option.label}</span>
              <span className="settings-sound-option-description">{option.description}</span>
            </button>
          ))}
        </div>

        <div className="settings-panel-actions">
          <ActionButton
            aria-label="Preview selected completion sound"
            className="settings-sound-preview"
            onClick={() => {
              onPreviewTerminalCompletionSound(terminalCompletionSound);
            }}
            size="dense"
            variant="accent"
          >
            Preview
          </ActionButton>
          <span className="settings-saved-pill">Saved to workspace</span>
        </div>
      </section>
      <section className="settings-panel" aria-label="Workspace surface visibility settings">
        <header className="settings-panel-header">
          <h2>Workspace surface visibility</h2>
          <p>Enable or disable monitor surfaces in the main workspace shell.</p>
        </header>

        <div className="settings-toggle-grid">
          <SettingsToggle
            label="X Monitor"
            description="Auto-fetch X feed and show monitor tab"
            ariaLabel="Enable X Monitor"
            checked={isMonitorVisible}
            onChange={onMonitorVisibilityChange}
          />
          <SettingsToggle
            label="Runtime status strip"
            description="Top console status strip metrics"
            ariaLabel="Show runtime status strip"
            checked={isRuntimeStatusStripVisible}
            onChange={onRuntimeStatusStripVisibilityChange}
          />
        </div>
      </section>
    </section>
  );
};
