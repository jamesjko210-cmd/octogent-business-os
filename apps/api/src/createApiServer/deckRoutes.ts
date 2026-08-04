import { join } from "node:path";

import type { TerminalAgentProvider } from "@octogent/core";
import { renderAutonomousSkillsSection } from "../autonomousSkills";
import {
  addTodoItem,
  createDeckTentacle,
  deleteDeckTentacle,
  deleteTodoItem,
  editTodoItem,
  listDeckAvailableSkills,
  parseTodoProgress,
  readDeckTentacles,
  readDeckVaultFile,
  toggleTodoItem,
  updateDeckTentacleSuggestedSkills,
} from "../deck/readDeckTentacles";
import { renderGoalRuntimeSection } from "../goalRuntime";
import { resolvePrompt } from "../prompts";
import { renderRuntimePolicySection } from "../runtimePolicies";
import { MAX_CHILDREN_PER_PARENT, RuntimeInputError } from "../terminalRuntime";
import type { ApiRouteHandler } from "./routeHelpers";
import {
  readJsonBodyOrWriteError,
  writeJson,
  writeMethodNotAllowed,
  writeNoContent,
  writeText,
} from "./routeHelpers";
import { parseTerminalAgentProvider, parseTerminalWorkspaceMode } from "./terminalParsers";

const shellSingleQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
const RESEARCH_FALLBACK_PROVIDER_SEQUENCE: TerminalAgentProvider[] = [
  "perplexity",
  "notebooklm",
  "notion",
  "claude-code",
  "gemini-cli",
];

const buildSingleTodoWorkerPrompt = async ({
  promptsDir,
  workspaceCwd,
  tentacleId,
  tentacleName,
  todoItemText,
  terminalId,
  apiPort,
}: {
  promptsDir: string;
  workspaceCwd: string;
  tentacleId: string;
  tentacleName: string;
  todoItemText: string;
  terminalId: string;
  apiPort: string;
}) => {
  const tentacleContextPath = join(workspaceCwd, ".octogent/tentacles", tentacleId);

  return await resolvePrompt(promptsDir, "swarm-worker", {
    tentacleName,
    tentacleId,
    tentacleContextPath,
    todoItemText,
    terminalId,
    apiPort,
    workspaceContextIntro:
      "You are working in the shared main workspace on the main branch, not in an isolated worktree.",
    workspaceGuidelines: [
      "- You must work in the main project directory. Do NOT create or use git worktrees for this task.",
      "- You are working in the shared main workspace. Keep edits narrow and focused on this one todo item.",
      "- Do NOT create commits. Leave your completed changes uncommitted in the main workspace.",
      "- Do NOT mark todo items done or rewrite tentacle context files unless this specific todo item explicitly requires it.",
    ].join("\n"),
    commitGuidance:
      "- Do NOT commit. Leave your completed changes uncommitted in the shared workspace and report what changed.",
    definitionOfDoneCommitStep:
      "Changes are left uncommitted in the shared main workspace, ready for operator review.",
    workspaceReminder: "Do not commit. Do not use worktrees.",
    parentTerminalId: "",
    parentSection: "",
  });
};

export const handleDeckTentaclesRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { workspaceCwd, projectStateDir },
) => {
  if (requestUrl.pathname !== "/api/deck/tentacles") return false;

  if (request.method === "GET") {
    const tentacles = readDeckTentacles(workspaceCwd, projectStateDir);
    writeJson(response, 200, tentacles, corsOrigin);
    return true;
  }

  if (request.method === "POST") {
    const bodyReadResult = await readJsonBodyOrWriteError(request, response, corsOrigin);
    if (!bodyReadResult.ok) return true;

    const body = bodyReadResult.payload as Record<string, unknown> | null;
    const name = body && typeof body.name === "string" ? body.name : "";
    const description = body && typeof body.description === "string" ? body.description : "";
    const color = body && typeof body.color === "string" ? body.color : "#d4a017";
    const suggestedSkills =
      body && Array.isArray(body.suggestedSkills)
        ? body.suggestedSkills.filter((skill): skill is string => typeof skill === "string")
        : [];

    const rawOctopus =
      body && typeof body.octopus === "object" && body.octopus !== null
        ? (body.octopus as Record<string, unknown>)
        : {};
    const octopus = {
      animation: typeof rawOctopus.animation === "string" ? rawOctopus.animation : null,
      expression: typeof rawOctopus.expression === "string" ? rawOctopus.expression : null,
      accessory: typeof rawOctopus.accessory === "string" ? rawOctopus.accessory : null,
      hairColor: typeof rawOctopus.hairColor === "string" ? rawOctopus.hairColor : null,
    };

    const result = createDeckTentacle(
      workspaceCwd,
      { name, description, color, octopus, suggestedSkills },
      projectStateDir,
    );
    if (!result.ok) {
      writeJson(response, 400, { error: result.error }, corsOrigin);
      return true;
    }

    writeJson(response, 201, result.tentacle, corsOrigin);
    return true;
  }

  writeMethodNotAllowed(response, corsOrigin);
  return true;
};

export const handleDeckSkillsRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { workspaceCwd },
) => {
  if (requestUrl.pathname !== "/api/deck/skills") return false;

  if (request.method !== "GET") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  writeJson(response, 200, listDeckAvailableSkills(workspaceCwd), corsOrigin);
  return true;
};

const DECK_TENTACLE_ITEM_PATTERN = /^\/api\/deck\/tentacles\/([^/]+)$/;

export const handleDeckTentacleItemRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { workspaceCwd, projectStateDir },
) => {
  const match = requestUrl.pathname.match(DECK_TENTACLE_ITEM_PATTERN);
  if (!match) return false;

  if (request.method !== "DELETE") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const tentacleId = decodeURIComponent(match[1] as string);
  const result = deleteDeckTentacle(workspaceCwd, tentacleId, projectStateDir);
  if (!result.ok) {
    writeJson(response, 404, { error: result.error }, corsOrigin);
    return true;
  }

  writeNoContent(response, 204, corsOrigin);
  return true;
};

const DECK_VAULT_FILE_PATTERN = /^\/api\/deck\/tentacles\/([^/]+)\/files\/([^/]+)$/;

export const handleDeckVaultFileRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { workspaceCwd },
) => {
  const match = requestUrl.pathname.match(DECK_VAULT_FILE_PATTERN);
  if (!match) return false;
  if (request.method !== "GET") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const tentacleId = decodeURIComponent(match[1] as string);
  const fileName = decodeURIComponent(match[2] as string);

  const content = readDeckVaultFile(workspaceCwd, tentacleId, fileName);
  if (content === null) {
    writeJson(response, 404, { error: "Vault file not found" }, corsOrigin);
    return true;
  }

  writeText(response, 200, content, "text/markdown; charset=utf-8", corsOrigin);
  return true;
};

const DECK_TENTACLE_SKILLS_PATTERN = /^\/api\/deck\/tentacles\/([^/]+)\/skills$/;

export const handleDeckTentacleSkillsRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { workspaceCwd, projectStateDir },
) => {
  const match = requestUrl.pathname.match(DECK_TENTACLE_SKILLS_PATTERN);
  if (!match) return false;
  if (request.method !== "PATCH") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const body = await readJsonBodyOrWriteError(request, response, corsOrigin);
  if (!body.ok) return true;

  const payload = body.payload as Record<string, unknown> | null;
  const suggestedSkills = Array.isArray(payload?.suggestedSkills)
    ? payload.suggestedSkills.filter((skill): skill is string => typeof skill === "string")
    : null;

  if (suggestedSkills === null) {
    writeJson(response, 400, { error: "suggestedSkills (string[]) is required" }, corsOrigin);
    return true;
  }

  const tentacleId = decodeURIComponent(match[1] as string);
  const updated = updateDeckTentacleSuggestedSkills(
    workspaceCwd,
    tentacleId,
    suggestedSkills,
    projectStateDir,
  );
  if (!updated) {
    writeJson(response, 404, { error: "Tentacle not found" }, corsOrigin);
    return true;
  }

  writeJson(response, 200, updated, corsOrigin);
  return true;
};

// ---------------------------------------------------------------------------
// Deck — Todo toggle
// ---------------------------------------------------------------------------

const DECK_TODO_TOGGLE_PATTERN = /^\/api\/deck\/tentacles\/([^/]+)\/todo\/toggle$/;

export const handleDeckTodoToggleRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { workspaceCwd },
) => {
  const match = requestUrl.pathname.match(DECK_TODO_TOGGLE_PATTERN);
  if (!match) return false;
  if (request.method !== "PATCH") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const body = await readJsonBodyOrWriteError(request, response, corsOrigin);
  if (!body.ok) return true;

  const { itemIndex, done } = body.payload as { itemIndex: unknown; done: unknown };
  if (typeof itemIndex !== "number" || typeof done !== "boolean") {
    writeJson(
      response,
      400,
      { error: "itemIndex (number) and done (boolean) are required" },
      corsOrigin,
    );
    return true;
  }

  const tentacleId = decodeURIComponent(match[1] as string);
  const result = toggleTodoItem(workspaceCwd, tentacleId, itemIndex, done);
  if (!result) {
    writeJson(response, 404, { error: "Todo item not found" }, corsOrigin);
    return true;
  }

  writeJson(response, 200, result, corsOrigin);
  return true;
};

// ---------------------------------------------------------------------------
// Deck — Todo edit (rename item text)
// ---------------------------------------------------------------------------

const DECK_TODO_EDIT_PATTERN = /^\/api\/deck\/tentacles\/([^/]+)\/todo\/edit$/;

export const handleDeckTodoEditRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { workspaceCwd },
) => {
  const match = requestUrl.pathname.match(DECK_TODO_EDIT_PATTERN);
  if (!match) return false;
  if (request.method !== "PATCH") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const body = await readJsonBodyOrWriteError(request, response, corsOrigin);
  if (!body.ok) return true;

  const { itemIndex, text } = body.payload as { itemIndex: unknown; text: unknown };
  if (typeof itemIndex !== "number" || typeof text !== "string" || text.trim().length === 0) {
    writeJson(
      response,
      400,
      { error: "itemIndex (number) and text (non-empty string) are required" },
      corsOrigin,
    );
    return true;
  }

  const tentacleId = decodeURIComponent(match[1] as string);
  const result = editTodoItem(workspaceCwd, tentacleId, itemIndex, text.trim());
  if (!result) {
    writeJson(response, 404, { error: "Todo item not found" }, corsOrigin);
    return true;
  }

  writeJson(response, 200, result, corsOrigin);
  return true;
};

// ---------------------------------------------------------------------------
// Deck — Todo add
// ---------------------------------------------------------------------------

const DECK_TODO_ADD_PATTERN = /^\/api\/deck\/tentacles\/([^/]+)\/todo$/;

export const handleDeckTodoAddRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { workspaceCwd },
) => {
  const match = requestUrl.pathname.match(DECK_TODO_ADD_PATTERN);
  if (!match) return false;
  if (request.method !== "POST") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const body = await readJsonBodyOrWriteError(request, response, corsOrigin);
  if (!body.ok) return true;

  const { text } = body.payload as { text: unknown };
  if (typeof text !== "string" || text.trim().length === 0) {
    writeJson(response, 400, { error: "text (non-empty string) is required" }, corsOrigin);
    return true;
  }

  const tentacleId = decodeURIComponent(match[1] as string);
  const result = addTodoItem(workspaceCwd, tentacleId, text.trim());
  if (!result) {
    writeJson(response, 404, { error: "Tentacle todo.md not found" }, corsOrigin);
    return true;
  }

  writeJson(response, 201, result, corsOrigin);
  return true;
};

// ---------------------------------------------------------------------------
// Deck — Todo delete
// ---------------------------------------------------------------------------

const DECK_TODO_DELETE_PATTERN = /^\/api\/deck\/tentacles\/([^/]+)\/todo\/delete$/;

export const handleDeckTodoDeleteRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { workspaceCwd },
) => {
  const match = requestUrl.pathname.match(DECK_TODO_DELETE_PATTERN);
  if (!match) return false;
  if (request.method !== "POST") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const body = await readJsonBodyOrWriteError(request, response, corsOrigin);
  if (!body.ok) return true;

  const { itemIndex } = body.payload as { itemIndex: unknown };
  if (typeof itemIndex !== "number") {
    writeJson(response, 400, { error: "itemIndex (number) is required" }, corsOrigin);
    return true;
  }

  const tentacleId = decodeURIComponent(match[1] as string);
  const result = deleteTodoItem(workspaceCwd, tentacleId, itemIndex);
  if (!result) {
    writeJson(response, 404, { error: "Todo item not found" }, corsOrigin);
    return true;
  }

  writeJson(response, 200, result, corsOrigin);
  return true;
};

// ---------------------------------------------------------------------------
// Deck — Solve a single todo item
// ---------------------------------------------------------------------------

const DECK_TODO_SOLVE_PATTERN = /^\/api\/deck\/tentacles\/([^/]+)\/todo\/solve$/;

export const handleDeckTodoSolveRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { runtime, workspaceCwd, projectStateDir, promptsDir, getApiPort },
) => {
  const match = requestUrl.pathname.match(DECK_TODO_SOLVE_PATTERN);
  if (!match) return false;
  if (request.method !== "POST") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const bodyReadResult = await readJsonBodyOrWriteError(request, response, corsOrigin);
  if (!bodyReadResult.ok) return true;

  const body = (bodyReadResult.payload ?? {}) as Record<string, unknown>;
  const itemIndex = body.itemIndex;
  if (typeof itemIndex !== "number") {
    writeJson(response, 400, { error: "itemIndex (number) is required" }, corsOrigin);
    return true;
  }

  const agentProviderResult = parseTerminalAgentProvider(body);
  if (agentProviderResult.error) {
    writeJson(response, 400, { error: agentProviderResult.error }, corsOrigin);
    return true;
  }

  const tentacleId = decodeURIComponent(match[1] as string);
  const todoContent = readDeckVaultFile(workspaceCwd, tentacleId, "todo.md");
  if (todoContent === null) {
    writeJson(response, 404, { error: "Tentacle or todo.md not found." }, corsOrigin);
    return true;
  }

  const todoResult = parseTodoProgress(todoContent);
  const todoItem = todoResult.items[itemIndex] ?? null;
  if (!todoItem) {
    writeJson(response, 404, { error: "Todo item not found." }, corsOrigin);
    return true;
  }
  if (todoItem.done) {
    writeJson(response, 400, { error: "Todo item is already complete." }, corsOrigin);
    return true;
  }

  const terminalId = `${tentacleId}-todo-${itemIndex}`;
  const existingTerminal = runtime
    .listTerminalSnapshots()
    .find((terminal) => terminal.terminalId === terminalId);
  if (existingTerminal) {
    writeJson(
      response,
      409,
      { error: "A solve agent is already active for this todo item.", terminalId },
      corsOrigin,
    );
    return true;
  }

  const deckTentacles = readDeckTentacles(workspaceCwd, projectStateDir);
  const deckEntry = deckTentacles.find((tentacle) => tentacle.tentacleId === tentacleId);
  const tentacleName = deckEntry?.displayName ?? tentacleId;

  try {
    const workerPrompt = await buildSingleTodoWorkerPrompt({
      promptsDir,
      workspaceCwd,
      tentacleId,
      tentacleName,
      todoItemText: todoItem.text,
      terminalId,
      apiPort: getApiPort(),
    });

    const snapshot = runtime.createTerminal({
      terminalId,
      tentacleId,
      tentacleName,
      nameOrigin: "generated",
      autoRenamePromptContext: todoItem.text,
      workspaceMode: "shared",
      ...(agentProviderResult.agentProvider
        ? { agentProvider: agentProviderResult.agentProvider }
        : {}),
      ...(workerPrompt ? { initialPrompt: workerPrompt } : {}),
    });

    writeJson(
      response,
      201,
      {
        terminalId: snapshot.terminalId,
        tentacleId,
        itemIndex,
        workspaceMode: "shared",
      },
      corsOrigin,
    );
    return true;
  } catch (error) {
    if (error instanceof RuntimeInputError) {
      writeJson(response, 400, { error: error.message }, corsOrigin);
      return true;
    }

    throw error;
  }
};

// ---------------------------------------------------------------------------
// Deck — Swarm
// ---------------------------------------------------------------------------

const DECK_TENTACLE_SWARM_PATTERN = /^\/api\/deck\/tentacles\/([^/]+)\/swarm$/;

const normalizeSwarmNamespace = (value: unknown) => {
  if (value === undefined || value === null) {
    return {
      swarmId: "default",
      terminalPrefix: "swarm",
      displayName: "swarm",
      isDefault: true,
      error: null as string | null,
    };
  }

  if (typeof value !== "string") {
    return {
      swarmId: "",
      terminalPrefix: "",
      displayName: "",
      isDefault: false,
      error: "swarmId must be a string.",
    };
  }

  const displayName = value.trim();
  const swarmId = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  if (!swarmId) {
    return {
      swarmId: "",
      terminalPrefix: "",
      displayName: "",
      isDefault: false,
      error: "swarmId must contain at least one letter or number.",
    };
  }

  return {
    swarmId,
    terminalPrefix: `swarm-${swarmId}`,
    displayName,
    isDefault: false,
    error: null as string | null,
  };
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isTerminalInSwarmNamespace = (
  terminalId: string,
  tentacleId: string,
  swarmNamespace: ReturnType<typeof normalizeSwarmNamespace>,
) => {
  if (swarmNamespace.isDefault) {
    const escapedTentacleId = escapeRegExp(tentacleId);
    return new RegExp(`^${escapedTentacleId}-swarm-(?:parent|\\d+)$`).test(terminalId);
  }

  return terminalId.startsWith(`${tentacleId}-${swarmNamespace.terminalPrefix}-`);
};

const isResearchDefaultSwarm = ({
  tentacleId,
  tentacleName,
  swarmNamespace,
}: {
  tentacleId: string;
  tentacleName: string;
  swarmNamespace: ReturnType<typeof normalizeSwarmNamespace>;
}) => {
  const haystack = [tentacleId, tentacleName, swarmNamespace.swarmId, swarmNamespace.displayName]
    .join(" ")
    .toLowerCase();

  return /\bresearch\b/.test(haystack);
};

const countKeywordMatches = (haystack: string, keywords: string[]) =>
  keywords.reduce((score, keyword) => (haystack.includes(keyword) ? score + 1 : score), 0);

const resolveResearchDefaultProvider = (
  todoText: string,
  todoIndex: number,
): TerminalAgentProvider => {
  const prompt = todoText.toLowerCase();
  const providerScores: Array<{ provider: TerminalAgentProvider; score: number }> = [
    {
      provider: "perplexity",
      score:
        countKeywordMatches(prompt, [
          "citation",
          "cite",
          "source",
          "sources",
          "latest",
          "current",
          "news",
          "market",
          "competitor",
          "competitors",
          "benchmark",
          "pricing",
          "statistics",
          "stats",
          "trend",
          "trends",
        ]) * 2,
    },
    {
      provider: "notebooklm",
      score:
        countKeywordMatches(prompt, [
          "notebooklm",
          "notebook lm",
          "curated",
          "source-grounded",
          "grounded",
          "uploaded",
          "pdf",
          "transcript",
          "selected sources",
          "source set",
          "q&a",
          "qa",
        ]) * 2,
    },
    {
      provider: "notion",
      score:
        countKeywordMatches(prompt, [
          "notion",
          "brief",
          "source index",
          "decision log",
          "decisions",
          "tasks",
          "memory",
          "bmc",
          "business model canvas",
          "archive",
          "store",
        ]) * 2,
    },
    {
      provider: "gemini-cli",
      score:
        countKeywordMatches(prompt, [
          "google",
          "youtube",
          "gmail",
          "calendar",
          "sheets",
          "docs",
          "drive",
          "maps",
          "ads",
          "analytics",
          "search console",
          "seo",
          "keyword",
          "keywords",
        ]) * 2,
    },
    {
      provider: "claude-code",
      score:
        countKeywordMatches(prompt, [
          "synthesize",
          "synthesis",
          "strategy",
          "strategic",
          "recommend",
          "recommendation",
          "compare",
          "decision",
          "plan",
          "positioning",
          "operations",
          "risks",
          "tradeoffs",
          "why",
        ]) * 2,
    },
  ];
  const bestProvider = providerScores.reduce((best, candidate) =>
    candidate.score > best.score ? candidate : best,
  );

  if (bestProvider.score > 0) {
    return bestProvider.provider;
  }

  return (
    RESEARCH_FALLBACK_PROVIDER_SEQUENCE[todoIndex % RESEARCH_FALLBACK_PROVIDER_SEQUENCE.length] ??
    "claude-code"
  );
};

export const handleDeckTentacleSwarmRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { runtime, workspaceCwd, projectStateDir, promptsDir, getApiPort },
) => {
  const match = requestUrl.pathname.match(DECK_TENTACLE_SWARM_PATTERN);
  if (!match) return false;

  if (request.method !== "POST") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const tentacleId = decodeURIComponent(match[1] as string);

  // Read and parse the tentacle's todo.md.
  const todoContent = readDeckVaultFile(workspaceCwd, tentacleId, "todo.md");
  if (todoContent === null) {
    writeJson(response, 404, { error: "Tentacle or todo.md not found." }, corsOrigin);
    return true;
  }

  const todoResult = parseTodoProgress(todoContent);
  const incompleteItems = todoResult.items
    .map((item, index) => ({ ...item, index }))
    .filter((item) => !item.done);

  if (incompleteItems.length === 0) {
    writeJson(response, 400, { error: "No incomplete todo items found." }, corsOrigin);
    return true;
  }

  // Parse optional request body for item filtering and agent provider.
  const bodyReadResult = await readJsonBodyOrWriteError(request, response, corsOrigin);
  if (!bodyReadResult.ok) return true;
  const body = (bodyReadResult.payload ?? {}) as Record<string, unknown>;

  const agentProviderResult = parseTerminalAgentProvider(body);
  if (agentProviderResult.error) {
    writeJson(response, 400, { error: agentProviderResult.error }, corsOrigin);
    return true;
  }
  const explicitSwarmAgentProvider = agentProviderResult.agentProvider;

  const workspaceModeResult = parseTerminalWorkspaceMode(body);
  if (workspaceModeResult.error) {
    writeJson(response, 400, { error: workspaceModeResult.error }, corsOrigin);
    return true;
  }
  const workerWorkspaceMode =
    body.workspaceMode === undefined ? "worktree" : workspaceModeResult.workspaceMode;

  const swarmNamespace = normalizeSwarmNamespace(body.swarmId ?? body.swarmName);
  if (swarmNamespace.error) {
    writeJson(response, 400, { error: swarmNamespace.error }, corsOrigin);
    return true;
  }

  // Filter to specific item indices if requested.
  let targetItems = incompleteItems;
  if (Array.isArray(body.todoItemIndices)) {
    const requestedIndices = new Set(
      (body.todoItemIndices as unknown[]).filter((v): v is number => typeof v === "number"),
    );
    targetItems = incompleteItems.filter((item) => requestedIndices.has(item.index));
    if (targetItems.length === 0) {
      writeJson(
        response,
        400,
        { error: "None of the requested todo item indices are incomplete." },
        corsOrigin,
      );
      return true;
    }
  }

  if (targetItems.length > MAX_CHILDREN_PER_PARENT) {
    // Todo order is priority order, so overflow items are deferred automatically.
    targetItems = targetItems.slice(0, MAX_CHILDREN_PER_PARENT);
  }

  // Check for existing swarm terminals to prevent duplicates.
  const existingTerminals = runtime.listTerminalSnapshots();
  const existingSwarmIds = existingTerminals
    .filter((t) => isTerminalInSwarmNamespace(t.terminalId, tentacleId, swarmNamespace))
    .map((t) => t.terminalId);
  if (existingSwarmIds.length > 0) {
    writeJson(
      response,
      409,
      {
        error: `A ${swarmNamespace.displayName} swarm is already active for this tentacle.`,
        existingSwarmIds,
      },
      corsOrigin,
    );
    return true;
  }

  // Determine base ref: use tentacle's worktree branch if it exists, otherwise HEAD.
  const tentacleTerminal = existingTerminals.find(
    (t) => t.tentacleId === tentacleId && t.workspaceMode === "worktree",
  );
  const baseRef = tentacleTerminal ? `octogent/${tentacleId}` : "HEAD";

  // Resolve the tentacle display name for prompts.
  const deckTentacles = readDeckTentacles(workspaceCwd, projectStateDir);
  const deckEntry = deckTentacles.find((t) => t.tentacleId === tentacleId);
  const tentacleName = deckEntry?.displayName ?? tentacleId;
  const shouldUseResearchDefaults =
    explicitSwarmAgentProvider === undefined &&
    isResearchDefaultSwarm({ tentacleId, tentacleName, swarmNamespace });
  const resolveWorkerAgentProvider = (todoIndex: number): TerminalAgentProvider | undefined =>
    explicitSwarmAgentProvider ??
    (shouldUseResearchDefaults
      ? resolveResearchDefaultProvider(
          targetItems.find((item) => item.index === todoIndex)?.text ?? "",
          todoIndex,
        )
      : undefined);
  const parentAgentProvider: TerminalAgentProvider | undefined =
    explicitSwarmAgentProvider ?? (shouldUseResearchDefaults ? "claude-code" : undefined);

  const apiPort = getApiPort();
  const needsParent = targetItems.length > 1;
  const parentTerminalId = needsParent
    ? `${tentacleId}-${swarmNamespace.terminalPrefix}-parent`
    : null;
  const tentacleContextPath = join(workspaceCwd, ".octogent/tentacles", tentacleId);
  const workers = targetItems.map((item) => ({
    terminalId: `${tentacleId}-${swarmNamespace.terminalPrefix}-${item.index}`,
    todoIndex: item.index,
    todoText: item.text,
  }));
  const integrationBranchName = swarmNamespace.isDefault
    ? `octogent_integration_${tentacleId}`
    : `octogent_integration_${tentacleId}_${swarmNamespace.swarmId}`;

  const buildWorkerContextIntro = (): string =>
    workerWorkspaceMode === "worktree"
      ? "You are working on an isolated worktree branch, not the main branch."
      : "You are working in the shared main workspace on the main branch, not in an isolated worktree.";

  const buildWorkerGuidelines = (terminalId: string): string =>
    workerWorkspaceMode === "worktree"
      ? `- You are working in an isolated git worktree on branch \`octogent/${terminalId}\`. Make changes freely without worrying about conflicts with other agents.`
      : [
          "- You are working in the shared main workspace. Other workers may touch the same files, so keep your edits narrow, avoid broad refactors, and coordinate via your parent if you hit overlap.",
          "- Do NOT create commits in shared mode. Leave your changes uncommitted for the coordinator to review and commit later.",
          "- Do NOT mark todo items done or rewrite tentacle context files unless your assigned todo item explicitly requires it. The coordinator handles the final tentacle-level sync.",
        ].join("\n");

  const buildWorkerCommitGuidance = (): string =>
    workerWorkspaceMode === "worktree"
      ? "- Commit your changes with a clear commit message describing what you did."
      : "- Do NOT commit in shared mode. Leave your completed changes uncommitted and report DONE with a short summary of what changed.";

  const buildWorkerDefinitionOfDoneCommitStep = (): string =>
    workerWorkspaceMode === "worktree"
      ? "Changes are committed with a descriptive message."
      : "Changes are left uncommitted in the shared workspace, ready for coordinator review.";

  const buildWorkerReminder = (): string =>
    workerWorkspaceMode === "worktree" ? "Commit." : "Do not commit in shared mode.";

  const buildWorkerWorkspaceSection = (): string =>
    workerWorkspaceMode === "worktree"
      ? [
          "Each worker commits to its own isolated branch:",
          "",
          ...workers.map(
            (w) => `- \`octogent/${w.terminalId}\` — item #${w.todoIndex}: ${w.todoText}`,
          ),
        ].join("\n")
      : [
          "Workers are running in the shared main workspace, not in separate worktrees.",
          "",
          "There are no per-worker branches for this swarm. Supervise them carefully to avoid overlapping edits in the same files.",
        ].join("\n");

  const buildCompletionStrategySection = (baseBranch: string): string =>
    workerWorkspaceMode === "worktree"
      ? [
          `Only begin merging after ALL ${workers.length} workers have reported DONE.`,
          "",
          "### Step-by-step merge process",
          "",
          `1. **Create an integration branch** from \`${baseBranch}\`. First check if a stale integration branch exists from a previous swarm attempt — if so, delete it before proceeding:`,
          "   ```bash",
          `   git branch -D ${integrationBranchName} 2>/dev/null || true`,
          `   git checkout ${baseBranch}`,
          `   git checkout -b ${integrationBranchName}`,
          "   ```",
          "",
          "2. **Merge each worker branch** into the integration branch one at a time. Start with the branch most likely to merge cleanly (fewest changes):",
          "   ```bash",
          "   git merge <worker-branch-name> --no-edit",
          "   ```",
          "   If there are conflicts, resolve them carefully. Read the conflicting files and understand both sides before choosing.",
          "",
          "3. **Run tests** on the integration branch after all merges. Do not skip this step.",
          "",
          "4. **If tests pass**, merge the integration branch into the base branch:",
          "   ```bash",
          `   git checkout ${baseBranch}`,
          `   git merge ${integrationBranchName} --no-edit`,
          "   ```",
          "",
          "5. **If tests fail**, investigate and fix before merging. Do not merge broken code.",
          "",
          `6. **Update tentacle state/docs** before finalizing. Mark completed items as done in \`.octogent/tentacles/${tentacleId}/todo.md\`, and update \`.octogent/tentacles/${tentacleId}/CONTEXT.md\` or other tentacle markdown files if the merged work changed the reality they describe.`,
          "",
          "7. **Clean up** the integration branch:",
          "   ```bash",
          `   git branch -d ${integrationBranchName}`,
          "   ```",
          "",
          "### Merge failure recovery",
          "",
          "If a worker's branch has conflicts that are too complex to resolve, send a message to that worker asking them to rebase their work. Merge the other workers' branches first.",
        ].join("\n")
      : [
          `Only begin final verification after ALL ${workers.length} workers have reported DONE.`,
          "",
          "Workers are sharing the main workspace, so there are no per-worker branches to merge.",
          "",
          "### Step-by-step completion process",
          "",
          `1. **Verify the workspace is on \`${baseBranch}\`** and review the overall diff carefully. Do not assume the combined result is safe just because workers reported DONE.`,
          "",
          "2. **Review the changed files** to ensure workers did not overwrite each other or leave partial edits.",
          "",
          "3. **Run tests** on the shared workspace after all workers report DONE. Do not skip this step.",
          "",
          "4. **If tests fail**, investigate and coordinate fixes. Do not declare the swarm complete while the workspace is broken.",
          "",
          `5. **Update tentacle state/docs** before asking for approval. Mark completed items as done in \`.octogent/tentacles/${tentacleId}/todo.md\`, and update \`.octogent/tentacles/${tentacleId}/CONTEXT.md\` or other tentacle markdown files if the completed work changed the reality they describe. If no tentacle docs need updates, say that explicitly.`,
          "",
          "6. **Wait for explicit user approval** before creating any commit on the shared main branch. Present a concise summary of the reviewed diff, test results, and tentacle-doc updates first.",
          "",
          "7. **Only after approval, create one final commit** on the shared branch that captures the swarm's completed work.",
          "",
          "8. **Report completion** only after the shared workspace is reviewed, tests pass, tentacle docs are synced, approval is granted, and the final commit is created.",
          "",
          "### Shared-workspace failure recovery",
          "",
          "If two workers collide in the same files, stop them from making broad new edits, inspect the current diff, and coordinate targeted follow-up changes instead of pretending there is a clean merge boundary.",
        ].join("\n");

  try {
    if (!needsParent) {
      const [item] = targetItems;
      const [worker] = workers;
      if (!item || !worker) {
        writeJson(response, 400, { error: "No incomplete todo items found." }, corsOrigin);
        return true;
      }
      const workerAgentProvider = resolveWorkerAgentProvider(item.index);

      const workerPrompt = await resolvePrompt(promptsDir, "swarm-worker", {
        tentacleName,
        tentacleId,
        tentacleContextPath,
        todoItemText: item.text,
        terminalId: worker.terminalId,
        apiPort,
        workspaceContextIntro: buildWorkerContextIntro(),
        workspaceGuidelines: buildWorkerGuidelines(worker.terminalId),
        commitGuidance: buildWorkerCommitGuidance(),
        definitionOfDoneCommitStep: buildWorkerDefinitionOfDoneCommitStep(),
        workspaceReminder: buildWorkerReminder(),
        parentTerminalId: "",
        parentSection: "",
        autonomousSkillsSection: renderAutonomousSkillsSection(),
        goalRuntimeSection: renderGoalRuntimeSection({ projectStateDir, tentacleId }),
        runtimePolicySection: renderRuntimePolicySection(),
      });

      runtime.createTerminal({
        terminalId: worker.terminalId,
        tentacleId,
        ...(workerWorkspaceMode === "worktree" ? { worktreeId: worker.terminalId } : {}),
        tentacleName,
        nameOrigin: "generated",
        autoRenamePromptContext: item.text,
        workspaceMode: workerWorkspaceMode,
        ...(workerAgentProvider ? { agentProvider: workerAgentProvider } : {}),
        ...(workerPrompt ? { initialPrompt: workerPrompt } : {}),
        ...(workerWorkspaceMode === "worktree" ? { baseRef } : {}),
      });
    }

    if (needsParent && parentTerminalId) {
      const workerListing = workers
        .map((w) => `- \`${w.terminalId}\` — item #${w.todoIndex}: ${w.todoText}`)
        .join("\n");

      const workerSpawnCommands = targetItems
        .map((item) => {
          const workerTerminalId = `${tentacleId}-${swarmNamespace.terminalPrefix}-${item.index}`;
          const workerAgentProvider = resolveWorkerAgentProvider(item.index);
          const parentSection = [
            "## Communication",
            "",
            `Your parent coordinator is at terminal \`${parentTerminalId}\`.`,
            "When you complete your task, report back:",
            "```bash",
            `node bin/octogent channel send ${parentTerminalId} "DONE: ${item.text}" --from ${workerTerminalId}`,
            "```",
            "If you are blocked, ask for help:",
            "```bash",
            `node bin/octogent channel send ${parentTerminalId} "BLOCKED: <describe what you need>" --from ${workerTerminalId}`,
            "```",
          ].join("\n");

          const promptVariables = JSON.stringify({
            tentacleName,
            tentacleId,
            tentacleContextPath,
            todoItemText: item.text,
            terminalId: workerTerminalId,
            apiPort,
            workspaceContextIntro: buildWorkerContextIntro(),
            workspaceGuidelines: buildWorkerGuidelines(workerTerminalId),
            commitGuidance: buildWorkerCommitGuidance(),
            definitionOfDoneCommitStep: buildWorkerDefinitionOfDoneCommitStep(),
            workspaceReminder: buildWorkerReminder(),
            parentTerminalId,
            parentSection,
            autonomousSkillsSection: renderAutonomousSkillsSection(),
            goalRuntimeSection: renderGoalRuntimeSection({ projectStateDir, tentacleId }),
            runtimePolicySection: renderRuntimePolicySection(),
          });

          const commandParts = [
            "node bin/octogent terminal create",
            `--terminal-id ${shellSingleQuote(workerTerminalId)}`,
            `--tentacle-id ${shellSingleQuote(tentacleId)}`,
            `--parent-terminal-id ${shellSingleQuote(parentTerminalId)}`,
            `--workspace-mode ${workerWorkspaceMode}`,
            `--name ${shellSingleQuote(tentacleName)}`,
            "--name-origin generated",
            `--auto-rename-prompt-context ${shellSingleQuote(item.text)}`,
            "--prompt-template swarm-worker",
            `--prompt-variables ${shellSingleQuote(promptVariables)}`,
          ];
          if (workerAgentProvider) {
            commandParts.splice(4, 0, `--agent-provider ${shellSingleQuote(workerAgentProvider)}`);
          }
          if (workerWorkspaceMode === "worktree") {
            commandParts.splice(3, 0, `--worktree-id ${shellSingleQuote(workerTerminalId)}`);
          }
          const command = commandParts.join(" ");

          return `- \`${workerTerminalId}\`:\n  \`\`\`bash\n  ${command}\n  \`\`\``;
        })
        .join("\n");

      const parentBaseBranch =
        workerWorkspaceMode === "worktree" ? (baseRef === "HEAD" ? "main" : baseRef) : "main";

      const parentPrompt = await resolvePrompt(promptsDir, "swarm-parent", {
        tentacleName,
        tentacleId,
        workerCount: String(workers.length),
        maxChildrenPerParent: String(MAX_CHILDREN_PER_PARENT),
        workerListing,
        workerWorkspaceSection: buildWorkerWorkspaceSection(),
        workerSpawnCommands,
        completionStrategySection: buildCompletionStrategySection(parentBaseBranch),
        baseBranch: parentBaseBranch,
        terminalId: parentTerminalId,
        apiPort,
        autonomousSkillsSection: renderAutonomousSkillsSection(),
        goalRuntimeSection: renderGoalRuntimeSection({ projectStateDir, tentacleId }),
        runtimePolicySection: renderRuntimePolicySection(),
      });

      runtime.createTerminal({
        terminalId: parentTerminalId,
        tentacleId,
        tentacleName: swarmNamespace.isDefault
          ? `${tentacleName} (coordinator)`
          : `${tentacleName} (${swarmNamespace.displayName} coordinator)`,
        workspaceMode: "shared",
        ...(parentAgentProvider ? { agentProvider: parentAgentProvider } : {}),
        ...(parentPrompt ? { initialPrompt: parentPrompt } : {}),
      });
    }
  } catch (error) {
    if (error instanceof RuntimeInputError) {
      writeJson(response, 400, { error: error.message }, corsOrigin);
      return true;
    }
    throw error;
  }

  writeJson(
    response,
    201,
    {
      tentacleId,
      ...(swarmNamespace.isDefault ? {} : { swarmId: swarmNamespace.swarmId }),
      parentTerminalId,
      workers,
    },
    corsOrigin,
  );
  return true;
};
