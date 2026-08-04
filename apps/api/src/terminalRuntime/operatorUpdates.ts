import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { normalizeChannelContent } from "./channelMessaging";
import type { AuditEventType } from "./security";

export const MAX_OPERATOR_UPDATE_LENGTH = 1_000;

export type OperatorUpdate = {
  updateId: string;
  agentId: string;
  terminalId: string;
  content: string;
  timestamp: string;
};

const isOperatorUpdate = (value: unknown): value is OperatorUpdate => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const update = value as Record<string, unknown>;
  return (
    typeof update.updateId === "string" &&
    typeof update.agentId === "string" &&
    typeof update.terminalId === "string" &&
    typeof update.content === "string" &&
    typeof update.timestamp === "string"
  );
};

const normalizeOperatorUpdateContent = (content: string) =>
  normalizeChannelContent(content).slice(0, MAX_OPERATOR_UPDATE_LENGTH);

export const createOperatorUpdates = (deps: {
  stateDir: string;
  appendAuditEvent?: (
    eventType: AuditEventType,
    options: { terminalId?: string; payload?: Record<string, unknown> },
  ) => void;
}) => {
  const updatesPath = join(deps.stateDir, "state", "operator-updates.json");
  const updates: OperatorUpdate[] = [];

  const persist = () => {
    mkdirSync(dirname(updatesPath), { recursive: true });
    writeFileSync(updatesPath, `${JSON.stringify({ updates }, null, 2)}\n`, "utf8");
  };

  const load = () => {
    if (!existsSync(updatesPath)) return 0;
    try {
      const payload = JSON.parse(readFileSync(updatesPath, "utf8")) as { updates?: unknown[] };
      let greatestUpdateNumber = 0;
      let didNormalize = false;
      for (const candidate of payload.updates ?? []) {
        if (!isOperatorUpdate(candidate)) continue;
        const content = normalizeOperatorUpdateContent(candidate.content);
        if (!content) continue;
        if (content !== candidate.content) {
          candidate.content = content;
          didNormalize = true;
        }
        updates.push(candidate);
        const match = /^operator-update-(\d+)$/.exec(candidate.updateId);
        if (match) greatestUpdateNumber = Math.max(greatestUpdateNumber, Number(match[1]));
      }
      if (didNormalize) persist();
      return greatestUpdateNumber;
    } catch {
      return 0;
    }
  };

  let updateCounter = load();

  return {
    createOperatorUpdate({
      agentId,
      terminalId,
      content,
    }: Omit<OperatorUpdate, "updateId" | "timestamp" | "content"> & { content: string }) {
      const normalizedContent = normalizeOperatorUpdateContent(content);
      if (!normalizedContent) {
        throw new Error("Operator update content cannot be empty.");
      }
      updateCounter += 1;
      const update: OperatorUpdate = {
        updateId: `operator-update-${updateCounter}`,
        agentId,
        terminalId,
        content: normalizedContent,
        timestamp: new Date().toISOString(),
      };
      updates.push(update);
      persist();
      deps.appendAuditEvent?.("agent_operator_update.queued", {
        terminalId,
        payload: { updateId: update.updateId, agentId, contentLength: normalizedContent.length },
      });
      return update;
    },

    listOperatorUpdates(options: { agentId?: string; limit?: number } = {}): OperatorUpdate[] {
      const limit = Math.max(1, Math.min(20, Math.floor(options.limit ?? 8)));
      return updates
        .filter((update) => !options.agentId || update.agentId === options.agentId)
        .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
        .slice(0, limit)
        .map((update) => ({ ...update }));
    },
  };
};
