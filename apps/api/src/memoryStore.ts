import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { MemoryEntry, MemoryEntryType, MemorySnapshot } from "@octogent/core";

import { normalizeChannelContent } from "./terminalRuntime/channelMessaging";

const MEMORY_TYPES = new Set<MemoryEntryType>([
  "fact",
  "decision",
  "preference",
  "handoff",
  "research",
  "note",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeStringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => normalizeChannelContent(item))
        .filter(Boolean)
    : [];

const parseMemoryEntry = (value: unknown): MemoryEntry | null => {
  if (!isRecord(value)) {
    return null;
  }

  const id = typeof value.id === "string" ? value.id : "";
  const type =
    typeof value.type === "string" && MEMORY_TYPES.has(value.type as MemoryEntryType)
      ? (value.type as MemoryEntryType)
      : null;
  const content = typeof value.content === "string" ? normalizeChannelContent(value.content) : "";
  const source = typeof value.source === "string" ? normalizeChannelContent(value.source) : "";
  const createdAt = typeof value.createdAt === "string" ? value.createdAt : "";
  const updatedAt = typeof value.updatedAt === "string" ? value.updatedAt : "";

  if (!id || !type || !content || !source || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id,
    type,
    content,
    ...(typeof value.summary === "string" && normalizeChannelContent(value.summary)
      ? { summary: normalizeChannelContent(value.summary) }
      : {}),
    tags: normalizeStringList(value.tags),
    source,
    ...(typeof value.tentacleId === "string" && normalizeChannelContent(value.tentacleId)
      ? { tentacleId: normalizeChannelContent(value.tentacleId) }
      : {}),
    createdAt,
    updatedAt,
  };
};

const scoreEntry = (entry: MemoryEntry, terms: string[]) => {
  const haystack = [
    entry.content,
    entry.summary ?? "",
    entry.source,
    entry.tentacleId ?? "",
    entry.type,
    entry.tags.join(" "),
  ]
    .join(" ")
    .toLowerCase();

  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
};

export const createMemoryStore = (projectStateDir: string) => {
  const memoryPath = join(projectStateDir, "state", "memory.json");

  const writeSnapshot = (snapshot: MemorySnapshot) => {
    mkdirSync(dirname(memoryPath), { recursive: true });
    writeFileSync(memoryPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  };

  const readSnapshot = (): MemorySnapshot => {
    if (!existsSync(memoryPath)) {
      return { entries: [] };
    }

    try {
      const parsed = JSON.parse(readFileSync(memoryPath, "utf8")) as unknown;
      const rawEntries = isRecord(parsed) && Array.isArray(parsed.entries) ? parsed.entries : [];
      const entries =
        rawEntries.length > 0
          ? rawEntries.map(parseMemoryEntry).filter((entry): entry is MemoryEntry => entry !== null)
          : [];
      const snapshot = { entries };
      // Rewrite legacy entries so common credentials and malformed fields do not remain on disk.
      if (JSON.stringify(rawEntries) !== JSON.stringify(entries)) {
        writeSnapshot(snapshot);
      }
      return snapshot;
    } catch {
      return { entries: [] };
    }
  };

  const list = ({ tentacleId }: { tentacleId?: string } = {}) => {
    const snapshot = readSnapshot();
    return tentacleId
      ? snapshot.entries.filter((entry) => entry.tentacleId === tentacleId)
      : snapshot.entries;
  };

  const create = (input: {
    type?: unknown;
    content?: unknown;
    summary?: unknown;
    tags?: unknown;
    source?: unknown;
    tentacleId?: unknown;
  }): MemoryEntry => {
    const content = typeof input.content === "string" ? normalizeChannelContent(input.content) : "";
    if (!content) {
      throw new Error("Memory content is required.");
    }

    const type =
      typeof input.type === "string" && MEMORY_TYPES.has(input.type as MemoryEntryType)
        ? (input.type as MemoryEntryType)
        : "note";
    const now = new Date().toISOString();
    const entry: MemoryEntry = {
      id: `mem-${randomUUID()}`,
      type,
      content,
      ...(typeof input.summary === "string" && normalizeChannelContent(input.summary)
        ? { summary: normalizeChannelContent(input.summary) }
        : {}),
      tags: normalizeStringList(input.tags),
      source:
        typeof input.source === "string" && normalizeChannelContent(input.source)
          ? normalizeChannelContent(input.source)
          : "operator",
      ...(typeof input.tentacleId === "string" && normalizeChannelContent(input.tentacleId)
        ? { tentacleId: normalizeChannelContent(input.tentacleId) }
        : {}),
      createdAt: now,
      updatedAt: now,
    };

    const snapshot = readSnapshot();
    writeSnapshot({ entries: [entry, ...snapshot.entries] });
    return entry;
  };

  const search = ({ query, tentacleId }: { query: string; tentacleId?: string }) => {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .map((term) => term.trim())
      .filter(Boolean);

    if (terms.length === 0) {
      return list(tentacleId ? { tentacleId } : {});
    }

    return list(tentacleId ? { tentacleId } : {})
      .map((entry) => ({ entry, score: scoreEntry(entry, terms) }))
      .filter((result) => result.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score || right.entry.updatedAt.localeCompare(left.entry.updatedAt),
      )
      .map((result) => result.entry);
  };

  return {
    create,
    list,
    memoryPath,
    search,
  };
};
