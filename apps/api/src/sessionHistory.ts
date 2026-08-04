import type { TerminalSnapshot } from "@octogent/core";

import { findAgentRosterRole } from "./agentRoster";
import type { AuditEvent } from "./terminalRuntime/security";

export type SessionHistoryEntry = {
  terminalId: string;
  title: string;
  agentId?: string;
  agentTitle?: string;
  tentacleId: string;
  provider: string;
  startedAt: string;
  endedAt?: string;
  state: "running" | "ended";
  endReason?: string;
  evidenceEventCount: number;
  lastEvidenceAt: string;
};

type TerminalHistoryMetadata = {
  title: string;
  agentId?: string;
  tentacleId: string;
  provider: string;
};

const asString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const metadataFromAudit = (event: AuditEvent): TerminalHistoryMetadata | null => {
  if (event.eventType !== "terminal.created" || !event.terminalId) return null;
  const tentacleId = asString(event.payload.tentacleId);
  if (!tentacleId) return null;
  const agentId = asString(event.payload.agentId);
  return {
    title: asString(event.payload.tentacleName) || event.terminalId,
    ...(agentId ? { agentId } : {}),
    tentacleId,
    provider: asString(event.payload.agentProvider) || "unknown",
  };
};

const metadataFromSnapshot = (snapshot: TerminalSnapshot): TerminalHistoryMetadata => ({
  title: snapshot.tentacleName ?? snapshot.label,
  ...(snapshot.agentId ? { agentId: snapshot.agentId } : {}),
  tentacleId: snapshot.tentacleId,
  provider: snapshot.agentProvider ?? "unknown",
});

/**
 * Projects the append-only audit into short session summaries. It intentionally omits prompts,
 * message bodies, capabilities, and raw tool output; those stay in their scoped runtime records.
 */
export const buildSessionHistory = ({
  auditEvents,
  terminalSnapshots,
}: {
  auditEvents: readonly AuditEvent[];
  terminalSnapshots: readonly TerminalSnapshot[];
}): SessionHistoryEntry[] => {
  const metadataByTerminal = new Map<string, TerminalHistoryMetadata>();
  for (const snapshot of terminalSnapshots) {
    metadataByTerminal.set(snapshot.terminalId, metadataFromSnapshot(snapshot));
  }
  for (const event of auditEvents) {
    const metadata = metadataFromAudit(event);
    if (metadata && event.terminalId) {
      metadataByTerminal.set(event.terminalId, metadata);
    }
  }

  const sessions: Array<SessionHistoryEntry & { startedEventIndex: number }> = [];
  const activeByTerminal = new Map<string, number>();
  auditEvents.forEach((event, eventIndex) => {
    if (!event.terminalId) return;
    if (event.eventType === "session.started") {
      const metadata = metadataByTerminal.get(event.terminalId);
      if (!metadata) return;
      const role = metadata.agentId ? findAgentRosterRole(metadata.agentId) : null;
      sessions.push({
        terminalId: event.terminalId,
        title: metadata.title,
        ...(metadata.agentId ? { agentId: metadata.agentId } : {}),
        ...(role ? { agentTitle: role.title } : {}),
        tentacleId: metadata.tentacleId,
        provider: metadata.provider,
        startedAt: asString(event.payload.startedAt) || event.timestamp,
        state: "running",
        evidenceEventCount: 1,
        lastEvidenceAt: event.timestamp,
        startedEventIndex: eventIndex,
      });
      activeByTerminal.set(event.terminalId, sessions.length - 1);
      return;
    }

    const sessionIndex = activeByTerminal.get(event.terminalId);
    if (sessionIndex === undefined) return;
    const session = sessions[sessionIndex];
    if (!session) return;
    session.evidenceEventCount += 1;
    session.lastEvidenceAt = event.timestamp;
    if (event.eventType === "session.ended") {
      session.state = "ended";
      session.endedAt = asString(event.payload.endedAt) || event.timestamp;
      const reason = asString(event.payload.reason);
      if (reason) session.endReason = reason;
      activeByTerminal.delete(event.terminalId);
    }
  });

  return sessions
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
    .map(({ startedEventIndex: _startedEventIndex, ...session }) => session);
};
