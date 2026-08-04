import { type ComponentProps, type ReactNode, Suspense, lazy } from "react";

import type { PrimaryNavIndex } from "../app/constants";
import type { UseMonitorRuntimeResult } from "../app/hooks/useMonitorRuntime";

const ActivityPrimaryView = lazy(async () => {
  const module = await import("./ActivityPrimaryView");
  return { default: module.ActivityPrimaryView };
});
const CanvasPrimaryView = lazy(async () => {
  const module = await import("./CanvasPrimaryView");
  return { default: module.CanvasPrimaryView };
});
const CodeIntelPrimaryView = lazy(async () => {
  const module = await import("./CodeIntelPrimaryView");
  return { default: module.CodeIntelPrimaryView };
});
const ConversationsPrimaryView = lazy(async () => {
  const module = await import("./ConversationsPrimaryView");
  return { default: module.ConversationsPrimaryView };
});
const DeckPrimaryView = lazy(async () => {
  const module = await import("./DeckPrimaryView");
  return { default: module.DeckPrimaryView };
});
const MonitorPrimaryView = lazy(async () => {
  const module = await import("./MonitorPrimaryView");
  return { default: module.MonitorPrimaryView };
});
const PromptsPrimaryView = lazy(async () => {
  const module = await import("./PromptsPrimaryView");
  return { default: module.PromptsPrimaryView };
});
const SettingsPrimaryView = lazy(async () => {
  const module = await import("./SettingsPrimaryView");
  return { default: module.SettingsPrimaryView };
});
const WorkflowsPrimaryView = lazy(async () => {
  const module = await import("./WorkflowsPrimaryView");
  return { default: module.WorkflowsPrimaryView };
});

type PrimaryViewRouterProps = {
  activePrimaryNav: PrimaryNavIndex;
  deckPrimaryViewProps: ComponentProps<typeof DeckPrimaryView>;
  isMonitorVisible: boolean;
  activityPrimaryViewProps: ComponentProps<typeof ActivityPrimaryView>;
  settingsPrimaryViewProps: ComponentProps<typeof SettingsPrimaryView>;
  canvasPrimaryViewProps: ComponentProps<typeof CanvasPrimaryView>;
  monitorRuntime: Pick<
    UseMonitorRuntimeResult,
    | "monitorConfig"
    | "monitorFeed"
    | "monitorError"
    | "isRefreshingMonitorFeed"
    | "isSavingMonitorConfig"
    | "refreshMonitorFeed"
    | "patchMonitorConfig"
  >;
  conversationsEnabled: boolean;
  conversationTerminalColumns: ComponentProps<typeof ConversationsPrimaryView>["columns"];
  onConversationsSidebarContent: (content: ReactNode) => void;
  onConversationsActionPanel: (content: ReactNode) => void;
  promptsEnabled: boolean;
  onPromptsSidebarContent: (content: ReactNode) => void;
};

export const PrimaryViewRouter = ({
  activePrimaryNav,
  deckPrimaryViewProps,
  isMonitorVisible,
  activityPrimaryViewProps,
  settingsPrimaryViewProps,
  canvasPrimaryViewProps,
  monitorRuntime,
  conversationsEnabled,
  conversationTerminalColumns,
  onConversationsSidebarContent,
  onConversationsActionPanel,
  promptsEnabled,
  onPromptsSidebarContent,
}: PrimaryViewRouterProps) => {
  let primaryView: ReactNode;

  if (activePrimaryNav === 2) {
    primaryView = <DeckPrimaryView {...deckPrimaryViewProps} />;
  } else if (activePrimaryNav === 3) {
    primaryView = <ActivityPrimaryView {...activityPrimaryViewProps} />;
  } else if (activePrimaryNav === 4) {
    primaryView = <CodeIntelPrimaryView enabled />;
  } else if (activePrimaryNav === 5) {
    if (isMonitorVisible) {
      primaryView = <MonitorPrimaryView monitorRuntime={monitorRuntime} />;
    } else {
      primaryView = (
        <section className="monitor-view" aria-label="Monitor primary view disabled">
          <section className="monitor-panel monitor-panel--configure">
            <h3>Monitor is disabled</h3>
            <p>Enable Monitor workspace view in Settings to restore this panel.</p>
          </section>
        </section>
      );
    }
  } else if (activePrimaryNav === 6) {
    primaryView = (
      <ConversationsPrimaryView
        enabled={conversationsEnabled}
        columns={conversationTerminalColumns}
        onSidebarContent={onConversationsSidebarContent}
        onActionPanel={onConversationsActionPanel}
      />
    );
  } else if (activePrimaryNav === 7) {
    primaryView = (
      <PromptsPrimaryView enabled={promptsEnabled} onSidebarContent={onPromptsSidebarContent} />
    );
  } else if (activePrimaryNav === 8) {
    primaryView = <SettingsPrimaryView {...settingsPrimaryViewProps} />;
  } else if (activePrimaryNav === 9) {
    primaryView = <WorkflowsPrimaryView enabled />;
  } else {
    primaryView = <CanvasPrimaryView {...canvasPrimaryViewProps} />;
  }

  return (
    <Suspense
      fallback={
        <section className="primary-view-loading" aria-live="polite" aria-label="Loading workspace">
          Loading workspace...
        </section>
      }
    >
      {primaryView}
    </Suspense>
  );
};
