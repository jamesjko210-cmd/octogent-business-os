import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { normalizeChannelContent } from "./terminalRuntime/channelMessaging";

const DEFAULT_VAULT_PATH = "/Users/jamesko/Desktop/Claude memory/AI startup bussiness";
const SHARED_MEMORY_DIRECTORIES = ["Octogent", "🤖 AI Agent Memory"] as const;
const MAX_SEARCHED_FILES = 200;
const MAX_FILE_BYTES = 512_000;
const MAX_RESULT_SNIPPET_LENGTH = 700;

const safeRoleId = (value: string) => /^[a-z0-9-]+$/.test(value);

export const resolveObsidianVaultPath = (env: Record<string, string | undefined> = process.env) =>
  resolve(env.OCTOGENT_OBSIDIAN_VAULT_PATH?.trim() || DEFAULT_VAULT_PATH);

const roleNotePath = (vaultPath: string, agentId: string) => {
  if (!safeRoleId(agentId)) {
    throw new Error("Role ID is invalid for Obsidian capture.");
  }
  const path = join(vaultPath, "Octogent", "Agent Updates", `${agentId}.md`);
  const relativePath = relative(vaultPath, path);
  if (relativePath.startsWith("..") || relativePath === "") {
    throw new Error("Obsidian capture path is outside the vault.");
  }
  return path;
};

const sharedTimelinePath = (vaultPath: string) => {
  const path = join(vaultPath, "Octogent", "Shared", "Agent Timeline.md");
  const relativePath = relative(vaultPath, path);
  if (relativePath.startsWith("..") || relativePath === "") {
    throw new Error("Obsidian shared timeline path is outside the vault.");
  }
  return path;
};

const appendObsidianEntry = ({
  vaultPath,
  path,
  title,
  content,
  timestamp,
  agentId,
}: {
  vaultPath: string;
  path: string;
  title: string;
  content: string;
  timestamp: string;
  agentId?: string;
}) => {
  const normalizedContent = normalizeChannelContent(content);
  if (!normalizedContent) {
    throw new Error("Obsidian update content is required.");
  }
  if (!existsSync(vaultPath)) {
    throw new Error("Configured Obsidian vault is unavailable.");
  }

  mkdirSync(dirname(path), { recursive: true });
  const existing = existsSync(path) ? readFileSync(path, "utf8") : `# ${title}\n`;
  const author = agentId ? `\n\n**Role:** ${agentId}` : "";
  const entry = `\n## ${timestamp}${author}\n\n${normalizedContent}\n`;
  writeFileSync(path, `${existing.trimEnd()}${entry}`, "utf8");

  return {
    relativePath: relative(vaultPath, path),
    contentLength: normalizedContent.length,
    timestamp,
  };
};

export const appendObsidianRoleUpdate = ({
  vaultPath = resolveObsidianVaultPath(),
  agentId,
  content,
  timestamp = new Date().toISOString(),
}: {
  vaultPath?: string;
  agentId: string;
  content: string;
  timestamp?: string;
}) => {
  const path = roleNotePath(vaultPath, agentId);
  return appendObsidianEntry({
    vaultPath,
    path,
    title: `${agentId} Updates`,
    content,
    timestamp,
  });
};

export const appendObsidianSharedTimelineUpdate = ({
  vaultPath = resolveObsidianVaultPath(),
  agentId,
  content,
  timestamp = new Date().toISOString(),
}: {
  vaultPath?: string;
  agentId: string;
  content: string;
  timestamp?: string;
}) => {
  if (!safeRoleId(agentId)) {
    throw new Error("Role ID is invalid for Obsidian capture.");
  }
  return appendObsidianEntry({
    vaultPath,
    path: sharedTimelinePath(vaultPath),
    title: "Octogent Shared Agent Timeline",
    agentId,
    content,
    timestamp,
  });
};

export type ObsidianSearchResult = {
  relativePath: string;
  snippet: string;
  score: number;
};

const collectMarkdownFiles = (directory: string, files: string[]) => {
  if (!existsSync(directory) || files.length >= MAX_SEARCHED_FILES) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (files.length >= MAX_SEARCHED_FILES) return;
    const entryPath = join(directory, entry.name);
    // Project memory follows normal notes only; symlinks cannot expand the search outside the vault.
    if (entry.isDirectory()) {
      collectMarkdownFiles(entryPath, files);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(entryPath);
    }
  }
};

const buildSnippet = (content: string, firstMatchIndex: number) => {
  const start = Math.max(0, firstMatchIndex - 180);
  const end = Math.min(content.length, start + MAX_RESULT_SNIPPET_LENGTH);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < content.length ? "..." : "";
  return `${prefix}${normalizeChannelContent(content.slice(start, end))}${suffix}`;
};

/** Searches the project-managed memory areas only; it never exposes arbitrary vault paths or files. */
export const searchObsidianSharedNotes = ({
  vaultPath = resolveObsidianVaultPath(),
  query,
  limit = 8,
}: {
  vaultPath?: string;
  query: string;
  limit?: number;
}): ObsidianSearchResult[] => {
  if (!existsSync(vaultPath)) {
    throw new Error("Configured Obsidian vault is unavailable.");
  }
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 12);
  if (terms.length === 0) {
    throw new Error("Obsidian search query is required.");
  }

  const files: string[] = [];
  for (const directoryName of SHARED_MEMORY_DIRECTORIES) {
    collectMarkdownFiles(join(vaultPath, directoryName), files);
  }

  return files
    .flatMap((path) => {
      try {
        const content = readFileSync(path, "utf8").slice(0, MAX_FILE_BYTES);
        const searchable = content.toLowerCase();
        const matches = terms.map((term) => searchable.indexOf(term)).filter((index) => index >= 0);
        if (matches.length === 0) return [];
        const relativePath = relative(vaultPath, path);
        if (!relativePath || relativePath.startsWith("..")) return [];
        return [
          {
            relativePath,
            snippet: buildSnippet(content, Math.min(...matches)),
            score: matches.length,
          },
        ];
      } catch {
        // A malformed or unreadable note does not make the shared memory layer unavailable.
        return [];
      }
    })
    .sort(
      (left, right) =>
        right.score - left.score || left.relativePath.localeCompare(right.relativePath),
    )
    .slice(0, Math.max(1, Math.min(limit, 20)));
};
