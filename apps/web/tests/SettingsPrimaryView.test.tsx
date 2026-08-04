import type { WorkspaceSetupSnapshot } from "@octogent/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SettingsPrimaryView } from "../src/components/SettingsPrimaryView";

const setupSnapshot: WorkspaceSetupSnapshot = {
  isFirstRun: false,
  shouldShowSetupCard: false,
  hasAnyTentacles: true,
  tentacleCount: 2,
  steps: [],
  agenticOs: {
    brains: [
      {
        id: "claude",
        label: "Claude",
        role: "Planning and synthesis.",
        status: "available_local",
        command: "claude",
        guidance: "Claude is ready.",
        workflowUrl: "https://claude.ai/",
      },
      {
        id: "notion",
        label: "Notion",
        role: "Shared memory.",
        status: "needs_setup",
        command: "OCTOGENT_NOTION_COMMAND",
        guidance: "Configure Notion memory.",
        workflowUrl: "https://www.notion.com/",
      },
    ],
  },
};

const renderSettings = (workspaceSetup: WorkspaceSetupSnapshot | null = setupSnapshot) =>
  render(
    <SettingsPrimaryView
      terminalCompletionSound="silent"
      isRuntimeStatusStripVisible
      isMonitorVisible
      workspaceSetup={workspaceSetup}
      isWorkspaceSetupLoading={false}
      workspaceSetupError={null}
      onTerminalCompletionSoundChange={vi.fn()}
      onPreviewTerminalCompletionSound={vi.fn()}
      onRuntimeStatusStripVisibilityChange={vi.fn()}
      onMonitorVisibilityChange={vi.fn()}
    />,
  );

describe("SettingsPrimaryView", () => {
  it("shows the Agentic OS brain map without mistaking a local command for a connection", () => {
    renderSettings();

    expect(screen.getByRole("region", { name: "Agentic OS map" })).toBeInTheDocument();
    expect(screen.getByText("0 signed in · 1/2 available")).toBeInTheDocument();
    expect(screen.getByLabelText("Claude available locally")).toHaveAttribute(
      "data-status",
      "available_local",
    );
    expect(
      screen.getByText("Command found only. Login and provider response are not verified."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Notion needs setup")).toHaveAttribute(
      "data-status",
      "needs_setup",
    );
    expect(screen.getByText("OCTOGENT_NOTION_COMMAND")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Open workflow" })[0]).toHaveAttribute(
      "href",
      "https://claude.ai/",
    );
  });

  it("labels a verified local CLI session without claiming a model response", () => {
    const claude = setupSnapshot.agenticOs.brains[0];
    if (!claude) throw new Error("Expected Claude setup fixture.");

    renderSettings({
      ...setupSnapshot,
      agenticOs: {
        brains: [
          {
            ...claude,
            status: "authenticated_local",
          },
        ],
      },
    });

    expect(screen.getByText("1 signed in · 1/1 available")).toBeInTheDocument();
    expect(screen.getByLabelText("Claude signed in locally")).toHaveAttribute(
      "data-status",
      "authenticated_local",
    );
    expect(
      screen.getByText("Local CLI sign-in only. No model request has been made."),
    ).toBeInTheDocument();
  });

  it("keeps a fallback brain map visible while setup status is unavailable", () => {
    renderSettings(null);

    expect(screen.getByRole("region", { name: "Agentic OS map" })).toBeInTheDocument();
    expect(screen.getByText("Claude Sonnet / Opus")).toBeInTheDocument();
    expect(screen.getByText("Qwen / LM Studio")).toBeInTheDocument();
    expect(screen.getByText("Google Stitch")).toBeInTheDocument();
  });
});
