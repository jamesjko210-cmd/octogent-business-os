import { createHash, generateKeyPairSync, randomUUID, timingSafeEqual } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import type { AgentIdentity, TentacleWorkspaceMode, TerminalAccessScope } from "@octogent/core";

import type { PersistedTerminal, TerminalAgentProvider } from "./types";

type PersistedAgentIdentity = AgentIdentity & {
  publicKeyPem: string;
  privateKeyPem: string;
  fingerprint: string;
};

export type PersistedTerminalSecurity = {
  identity: PersistedAgentIdentity;
  accessScope: TerminalAccessScope;
};

export type AuditEventType =
  | "api.call"
  | "terminal.created"
  | "terminal.identity_assigned"
  | "terminal.renamed"
  | "terminal.deleted"
  | "terminal.stopped"
  | "terminal.killed"
  | "session.started"
  | "session.ended"
  | "session.state_changed"
  | "session_history.listed"
  | "session.input"
  | "session.initial_prompt"
  | "session.initial_input_draft"
  | "hook.received"
  | "tool.pre_use"
  | "query.user_prompt"
  | "agent_activity.loaded"
  | "agent_activity.updated"
  | "agent_activity.rejected"
  | "agent_operator_update.queued"
  | "agent_operator_update.rejected"
  | "agent_roster.loaded"
  | "swarm_registry.loaded"
  | "swarm_registry.created"
  | "swarm_registry.removed"
  | "agent_manifests.loaded"
  | "agent_manifest.evaluated"
  | "autonomous_skills.loaded"
  | "memory.created"
  | "memory.searched"
  | "goal.created"
  | "goal.status_changed"
  | "goals.listed"
  | "runtime_policies.loaded"
  | "runtime_policy.evaluated"
  | "workflows.listed"
  | "workflow.created"
  | "workflow.status_changed"
  | "workflow.run_created"
  | "workflow.run_approval_decided"
  | "workflow.run_claim_requested"
  | "workflow.run_claimed"
  | "workflow.run_claim_rejected"
  | "workflow.run_outcome_recorded"
  | "workflow.run_outcome_rejected"
  | "workflow.run_local_execution_started"
  | "workflow.run_local_execution_finished"
  | "workflow.run_local_execution_rejected"
  | "channel.message_queued"
  | "channel.message_delivered"
  | "channel.message_rejected"
  | "agent_inbox.message_queued"
  | "agent_inbox.message_delivered"
  | "telegram.message_queued"
  | "telegram.message_rejected"
  | "telegram.updates_viewed"
  | "telegram.poll_failed"
  | "provider_handshake.requested"
  | "provider_handshake.completed"
  | "obsidian.update_appended"
  | "obsidian.update_rejected"
  | "obsidian.searched"
  | "obsidian.search_rejected";

export type AuditEvent = {
  eventId: string;
  timestamp: string;
  terminalId?: string;
  eventType: AuditEventType;
  payload: Record<string, unknown>;
  previousHash: string | null;
  hash: string;
};

const toBase64Url = (buffer: Buffer) =>
  buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

export const createTerminalSecurity = ({
  terminalId,
  tentacleId,
  worktreeId,
  workspaceMode,
  agentProvider,
}: {
  terminalId: string;
  tentacleId: string;
  worktreeId?: string;
  workspaceMode: TentacleWorkspaceMode;
  agentProvider?: TerminalAgentProvider;
}): PersistedTerminalSecurity => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const fingerprint = `agent-${toBase64Url(createHash("sha256").update(publicKeyPem).digest()).slice(0, 32)}`;
  const allowedPaths =
    workspaceMode === "worktree"
      ? [`.octogent/worktrees/${worktreeId ?? terminalId}`]
      : [".", `.octogent/tentacles/${tentacleId}`];
  const allowedTools = [
    "terminal",
    "channel",
    "read",
    "write",
    ...(workspaceMode === "worktree" ? ["git-worktree"] : []),
    ...(agentProvider ? [`provider:${agentProvider}`] : []),
  ];

  return {
    identity: {
      algorithm: "ed25519",
      publicKeyPem,
      privateKeyPem,
      fingerprint,
      createdAt: new Date().toISOString(),
    },
    accessScope: {
      workspaceMode,
      tentacleId,
      ...(worktreeId ? { worktreeId } : {}),
      allowedPaths,
      allowedTools,
    },
  };
};

export const publicAgentIdentity = (identity: PersistedAgentIdentity): AgentIdentity => ({
  algorithm: identity.algorithm,
  createdAt: identity.createdAt,
});

// This is a local capability derived from the terminal's private identity. It is never shown in
// snapshots, audit responses, or the browser, but the managed terminal receives it in its shell.
export const terminalChannelCapability = (terminal: PersistedTerminal): string | null => {
  const privateKeyPem = terminal.security?.identity.privateKeyPem;
  if (!privateKeyPem) {
    return null;
  }

  return createHash("sha256")
    .update("octogent-channel-capability-v1")
    .update(terminal.terminalId)
    .update(privateKeyPem)
    .digest("base64url");
};

export const hasTerminalChannelCapability = (terminal: PersistedTerminal, candidate: string) => {
  const expected = terminalChannelCapability(terminal);
  if (!expected || !candidate) {
    return false;
  }
  const expectedBuffer = Buffer.from(expected);
  const candidateBuffer = Buffer.from(candidate);
  return (
    expectedBuffer.length === candidateBuffer.length &&
    timingSafeEqual(expectedBuffer, candidateBuffer)
  );
};

const readLastAuditHash = (auditPath: string): string | null => {
  if (!existsSync(auditPath)) {
    return null;
  }

  const contents = readFileSync(auditPath, "utf8").trim();
  if (!contents) {
    return null;
  }

  const lastLine = contents.split("\n").pop();
  if (!lastLine) {
    return null;
  }

  try {
    const parsed = JSON.parse(lastLine) as { hash?: unknown };
    return typeof parsed.hash === "string" ? parsed.hash : null;
  } catch {
    return null;
  }
};

export const createAuditLog = (
  projectStateDir: string,
  terminals: Map<string, PersistedTerminal>,
) => {
  const auditPath = join(projectStateDir, "state", "audit", "events.jsonl");
  let previousHash = readLastAuditHash(auditPath);

  const appendAuditEvent = (
    eventType: AuditEventType,
    options: {
      terminalId?: string;
      payload?: Record<string, unknown>;
    } = {},
  ): AuditEvent => {
    const timestamp = new Date().toISOString();
    const eventWithoutHash = {
      eventId: randomUUID(),
      timestamp,
      ...(options.terminalId ? { terminalId: options.terminalId } : {}),
      eventType,
      payload: options.payload ?? {},
      previousHash,
    };
    const hash = createHash("sha256").update(JSON.stringify(eventWithoutHash)).digest("hex");
    const event: AuditEvent = { ...eventWithoutHash, hash };

    mkdirSync(dirname(auditPath), { recursive: true });
    appendFileSync(auditPath, `${JSON.stringify(event)}\n`, "utf8");
    previousHash = hash;
    return event;
  };

  const listAuditEvents = (terminalId?: string): AuditEvent[] => {
    if (!existsSync(auditPath)) {
      return [];
    }

    return readFileSync(auditPath, "utf8")
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as AuditEvent)
      .filter((event) => !terminalId || event.terminalId === terminalId)
      .map((event) => {
        const { agentIdentityFingerprint: _agentIdentityFingerprint, ...redactedEvent } =
          event as AuditEvent & { agentIdentityFingerprint?: string };
        return redactedEvent;
      });
  };

  return {
    auditPath,
    appendAuditEvent,
    listAuditEvents,
    relativeAuditPath: (workspaceCwd: string) => relative(workspaceCwd, auditPath),
  };
};
