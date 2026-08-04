import { join } from "node:path";
import { findAgentManifest } from "../agentManifests";
import { findAgentRosterRole } from "../agentRoster";
import { renderAutonomousSkillsSection } from "../autonomousSkills";
import { readDeckTentacles } from "../deck/readDeckTentacles";
import { renderGoalRuntimeSection } from "../goalRuntime";
import { resolvePrompt } from "../prompts";
import { renderRuntimePolicySection } from "../runtimePolicies";
import {
  RuntimeInputError,
  type TentacleWorkspaceMode,
  type TerminalAgentProvider,
  type TerminalNameOrigin,
} from "../terminalRuntime";
import type { ApiRouteHandler } from "./routeHelpers";
import {
  readJsonBodyOrWriteError,
  writeJson,
  writeMethodNotAllowed,
  writeNoContent,
} from "./routeHelpers";
import {
  parseTerminalAgentProvider,
  parseTerminalName,
  parseTerminalNameOrigin,
  parseTerminalWorkspaceMode,
} from "./terminalParsers";

const buildTentacleInitialPrompt = (
  promptsDir: string,
  workspaceCwd: string,
  projectStateDir: string,
  tentacleId: string,
  agentId?: string,
): Promise<string | undefined> => {
  const tentacle = readDeckTentacles(workspaceCwd, projectStateDir).find(
    (entry) => entry.tentacleId === tentacleId,
  );
  if (!tentacle) {
    return Promise.resolve(undefined);
  }

  const tentacleFolderPath = join(".octogent", "tentacles", tentacleId);
  return resolvePrompt(promptsDir, "tentacle-context-init", {
    tentacleName: tentacle.displayName,
    tentacleId,
    tentacleContextPath: tentacleFolderPath,
    autonomousSkillsSection: renderAutonomousSkillsSection(),
    goalRuntimeSection: renderGoalRuntimeSection({
      projectStateDir,
      tentacleId,
      ...(agentId ? { ownerAgentId: agentId } : {}),
    }),
    runtimePolicySection: renderRuntimePolicySection(),
  });
};

export const handleTerminalSnapshotsRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { runtime },
) => {
  if (requestUrl.pathname !== "/api/terminal-snapshots") {
    return false;
  }

  if (request.method !== "GET") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const payload = runtime.listTerminalSnapshots();
  writeJson(response, 200, payload, corsOrigin);
  return true;
};

export const handleAuditLogRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { runtime },
) => {
  if (requestUrl.pathname !== "/api/audit") {
    return false;
  }

  if (request.method !== "GET") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  writeJson(response, 200, { events: runtime.listAuditEvents() }, corsOrigin);
  return true;
};

export const handleTerminalsCollectionRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { runtime, workspaceCwd, projectStateDir, promptsDir, userPromptsDir, getApiPort },
) => {
  if (requestUrl.pathname !== "/api/terminals") {
    return false;
  }

  if (request.method !== "POST") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const bodyReadResult = await readJsonBodyOrWriteError(request, response, corsOrigin);
  if (!bodyReadResult.ok) {
    return true;
  }

  const nameResult = parseTerminalName(bodyReadResult.payload);
  if (nameResult.error) {
    writeJson(response, 400, { error: nameResult.error }, corsOrigin);
    return true;
  }

  const workspaceModeResult = parseTerminalWorkspaceMode(bodyReadResult.payload);
  if (workspaceModeResult.error) {
    writeJson(response, 400, { error: workspaceModeResult.error }, corsOrigin);
    return true;
  }

  const agentProviderResult = parseTerminalAgentProvider(bodyReadResult.payload);
  if (agentProviderResult.error) {
    writeJson(response, 400, { error: agentProviderResult.error }, corsOrigin);
    return true;
  }

  const nameOriginResult = parseTerminalNameOrigin(bodyReadResult.payload);
  if (nameOriginResult.error) {
    writeJson(response, 400, { error: nameOriginResult.error }, corsOrigin);
    return true;
  }

  try {
    const createTerminalInput: {
      terminalId?: string;
      agentId?: string;
      tentacleId?: string;
      worktreeId?: string;
      tentacleName?: string;
      workspaceMode: TentacleWorkspaceMode;
      agentProvider?: TerminalAgentProvider;
      nameOrigin?: TerminalNameOrigin;
      initialPrompt?: string;
      initialInputDraft?: string;
      autoRenamePromptContext?: string;
      parentTerminalId?: string;
    } = {
      workspaceMode: workspaceModeResult.workspaceMode,
    };
    if (nameResult.name !== undefined) {
      createTerminalInput.tentacleName = nameResult.name;
    }
    if (agentProviderResult.agentProvider !== undefined) {
      createTerminalInput.agentProvider = agentProviderResult.agentProvider;
    }
    if (nameOriginResult.nameOrigin !== undefined) {
      createTerminalInput.nameOrigin = nameOriginResult.nameOrigin;
    }
    const bodyPayload = bodyReadResult.payload as Record<string, unknown> | null;
    if (
      bodyPayload &&
      typeof bodyPayload.terminalId === "string" &&
      bodyPayload.terminalId.trim().length > 0
    ) {
      createTerminalInput.terminalId = bodyPayload.terminalId.trim();
    }
    if (
      bodyPayload &&
      typeof bodyPayload.agentId === "string" &&
      bodyPayload.agentId.trim().length > 0
    ) {
      const agentId = bodyPayload.agentId.trim();
      createTerminalInput.agentId = agentId;
    }
    if (
      bodyPayload &&
      typeof bodyPayload.tentacleId === "string" &&
      bodyPayload.tentacleId.trim().length > 0
    ) {
      createTerminalInput.tentacleId = bodyPayload.tentacleId.trim();
    }
    if (createTerminalInput.agentId) {
      const role = findAgentRosterRole(createTerminalInput.agentId);
      if (!role) {
        writeJson(response, 400, { error: "Agent role not found." }, corsOrigin);
        return true;
      }
      if (
        createTerminalInput.tentacleId !== role.tentacleId ||
        createTerminalInput.agentProvider !== role.preferredProvider
      ) {
        writeJson(
          response,
          400,
          { error: "A role terminal must use that role's assigned provider and tentacle." },
          corsOrigin,
        );
        return true;
      }
      const manifest = findAgentManifest(createTerminalInput.agentId);
      if (!manifest) {
        writeJson(
          response,
          409,
          { error: "Agent role has no scoped policy manifest." },
          corsOrigin,
        );
        return true;
      }
      if (
        createTerminalInput.workspaceMode !== manifest.scope.workspaceMode ||
        !createTerminalInput.tentacleId ||
        !manifest.scope.tentacleIds.includes(createTerminalInput.tentacleId)
      ) {
        writeJson(
          response,
          400,
          { error: "A role terminal must use that role's manifest workspace and tentacle scope." },
          corsOrigin,
        );
        return true;
      }
      const existingRoleTerminal = runtime
        .listTerminalSnapshots()
        .find((snapshot) => snapshot.agentId === createTerminalInput.agentId);
      if (existingRoleTerminal) {
        writeJson(
          response,
          409,
          {
            error:
              "This permanent role already has a prepared or active terminal. Release it before preparing another.",
          },
          corsOrigin,
        );
        return true;
      }
    }
    if (
      bodyPayload &&
      typeof bodyPayload.parentTerminalId === "string" &&
      bodyPayload.parentTerminalId.trim().length > 0
    ) {
      createTerminalInput.parentTerminalId = bodyPayload.parentTerminalId.trim();
    }
    if (
      bodyPayload &&
      typeof bodyPayload.autoRenamePromptContext === "string" &&
      bodyPayload.autoRenamePromptContext.trim().length > 0
    ) {
      createTerminalInput.autoRenamePromptContext = bodyPayload.autoRenamePromptContext.trim();
    }
    if (
      bodyPayload &&
      typeof bodyPayload.worktreeId === "string" &&
      bodyPayload.worktreeId.trim().length > 0
    ) {
      createTerminalInput.worktreeId = bodyPayload.worktreeId.trim();
    }

    // Support prompt resolution via template name + variables, or a raw string.
    if (
      bodyPayload &&
      typeof bodyPayload.promptTemplate === "string" &&
      bodyPayload.promptTemplate.trim().length > 0
    ) {
      const templateName = bodyPayload.promptTemplate.trim();
      const templateVars: Record<string, string> =
        bodyPayload.promptVariables != null &&
        typeof bodyPayload.promptVariables === "object" &&
        !Array.isArray(bodyPayload.promptVariables)
          ? Object.fromEntries(
              Object.entries(bodyPayload.promptVariables as Record<string, unknown>)
                .filter(([, v]) => typeof v === "string")
                .map(([k, v]) => [k, v as string]),
            )
          : {};

      // Auto-inject terminalId variable so callers don't have to guess it.
      // The runtime hasn't allocated the ID yet, so we use the tentacle name
      // when provided (sandbox always passes its name).
      if (!templateVars.terminalId && createTerminalInput.tentacleName) {
        templateVars.terminalId = createTerminalInput.tentacleName;
      }

      // Auto-inject apiPort so prompt templates can reference the local API.
      if (!templateVars.apiPort) {
        templateVars.apiPort = getApiPort();
      }

      // Auto-inject userPromptsDir so prompt templates know where to save user prompts.
      if (!templateVars.userPromptsDir) {
        templateVars.userPromptsDir = userPromptsDir;
      }

      // Auto-inject always-on operating skills so generated agents inherit them
      // without the operator manually attaching Claude-specific skills.
      if (!templateVars.autonomousSkillsSection) {
        templateVars.autonomousSkillsSection = renderAutonomousSkillsSection();
      }
      if (!templateVars.goalRuntimeSection) {
        templateVars.goalRuntimeSection = renderGoalRuntimeSection({
          projectStateDir,
          ...(createTerminalInput.tentacleId ? { tentacleId: createTerminalInput.tentacleId } : {}),
          ...(createTerminalInput.agentId ? { ownerAgentId: createTerminalInput.agentId } : {}),
        });
      }
      if (!templateVars.runtimePolicySection) {
        templateVars.runtimePolicySection = renderRuntimePolicySection();
      }

      // Auto-inject existingTerminals summary so planner-style prompts have context.
      if (!templateVars.existingTerminals) {
        const deckTentacles = readDeckTentacles(workspaceCwd, projectStateDir);
        if (deckTentacles.length > 0) {
          const listing = deckTentacles
            .map(
              (t) =>
                `- **${t.displayName}** (\`${t.tentacleId}\`): ${t.description || "(no description)"}`,
            )
            .join("\n");
          templateVars.existingTerminals = `## Existing Terminals\n\nThe following departments already exist:\n\n${listing}\n\nConsider these when proposing new departments — avoid duplicates and note any gaps.`;
        } else {
          templateVars.existingTerminals =
            "## Existing Terminals\n\nNo department terminals exist yet. You are starting from scratch.";
        }
      }

      const resolved = await resolvePrompt(promptsDir, templateName, templateVars);
      if (resolved !== undefined) {
        createTerminalInput.initialPrompt = resolved;
      }
    } else if (
      bodyPayload &&
      typeof bodyPayload.initialPrompt === "string" &&
      bodyPayload.initialPrompt.trim().length > 0
    ) {
      createTerminalInput.initialPrompt = bodyPayload.initialPrompt.trim();
    }

    if (!createTerminalInput.initialPrompt && createTerminalInput.tentacleId) {
      const defaultTentaclePrompt = await buildTentacleInitialPrompt(
        promptsDir,
        workspaceCwd,
        projectStateDir,
        createTerminalInput.tentacleId,
        createTerminalInput.agentId,
      );
      if (defaultTentaclePrompt) {
        createTerminalInput.initialInputDraft = defaultTentaclePrompt;
      }
    }

    const snapshot = runtime.createTerminal(createTerminalInput);
    const payload: Record<string, unknown> = { ...snapshot };
    if (createTerminalInput.initialPrompt) {
      payload.initialPrompt = createTerminalInput.initialPrompt;
    }
    writeJson(response, 201, payload, corsOrigin);
    return true;
  } catch (error) {
    if (error instanceof RuntimeInputError) {
      writeJson(response, 400, { error: error.message }, corsOrigin);
      return true;
    }

    throw error;
  }
};

const TERMINAL_ITEM_PATH_PATTERN = /^\/api\/terminals\/([^/]+)$/;
const TERMINAL_AUDIT_PATH_PATTERN = /^\/api\/terminals\/([^/]+)\/audit$/;
const TERMINAL_ACTION_PATH_PATTERN = /^\/api\/terminals\/([^/]+)\/(start|stop|kill)$/;

export const handleTerminalAuditRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { runtime },
) => {
  const auditMatch = requestUrl.pathname.match(TERMINAL_AUDIT_PATH_PATTERN);
  if (!auditMatch) {
    return false;
  }

  if (request.method !== "GET") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const terminalId = decodeURIComponent(auditMatch[1] ?? "");
  writeJson(response, 200, { events: runtime.listAuditEvents(terminalId) }, corsOrigin);
  return true;
};

export const handleTerminalItemRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { runtime },
) => {
  const renameMatch = requestUrl.pathname.match(TERMINAL_ITEM_PATH_PATTERN);
  if (!renameMatch) {
    return false;
  }

  if (request.method !== "PATCH" && request.method !== "DELETE") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const terminalId = decodeURIComponent(renameMatch[1] ?? "");
  if (request.method === "DELETE") {
    try {
      runtime.deleteTerminal(terminalId);
      writeNoContent(response, 204, corsOrigin);
      return true;
    } catch (error) {
      if (error instanceof RuntimeInputError) {
        writeJson(response, 409, { error: error.message }, corsOrigin);
        return true;
      }
      throw error;
    }
  }

  const bodyReadResult = await readJsonBodyOrWriteError(request, response, corsOrigin);
  if (!bodyReadResult.ok) {
    return true;
  }

  const nameResult = parseTerminalName(bodyReadResult.payload);
  if (nameResult.error) {
    writeJson(response, 400, { error: nameResult.error }, corsOrigin);
    return true;
  }

  if (!nameResult.provided || !nameResult.name) {
    writeJson(response, 400, { error: "Terminal name is required." }, corsOrigin);
    return true;
  }

  const payload = runtime.renameTerminal(terminalId, nameResult.name);
  if (!payload) {
    writeJson(response, 404, { error: "Terminal not found." }, corsOrigin);
    return true;
  }

  writeJson(response, 200, payload, corsOrigin);
  return true;
};

export const handleTerminalActionRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { runtime },
) => {
  const actionMatch = requestUrl.pathname.match(TERMINAL_ACTION_PATH_PATTERN);
  if (!actionMatch) {
    return false;
  }

  if (request.method !== "POST") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const terminalId = decodeURIComponent(actionMatch[1] ?? "");
  const action = actionMatch[2];
  if (action === "start") {
    const result = runtime.startTerminal(terminalId);
    if (!result) {
      writeJson(response, 404, { error: "Terminal not found." }, corsOrigin);
      return true;
    }
    if (!result.started) {
      writeJson(
        response,
        409,
        { error: "Terminal could not start or is no longer prepared." },
        corsOrigin,
      );
      return true;
    }
    writeJson(response, 200, result.snapshot, corsOrigin);
    return true;
  }

  const snapshot =
    action === "kill" ? runtime.killTerminal(terminalId) : runtime.stopTerminal(terminalId);
  if (!snapshot) {
    writeJson(response, 404, { error: "Terminal not found." }, corsOrigin);
    return true;
  }

  writeJson(response, 200, snapshot, corsOrigin);
  return true;
};

export const handleTerminalPruneRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { runtime },
) => {
  if (requestUrl.pathname !== "/api/terminals/prune") {
    return false;
  }

  if (request.method !== "POST") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  writeJson(response, 200, { prunedTerminalIds: runtime.pruneTerminals() }, corsOrigin);
  return true;
};
