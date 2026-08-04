import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join } from "node:path";

import type { UsageChartResponse } from "../claudeSessionScanner";
import type { ClaudeUsageSnapshot } from "../claudeUsage";
import type { CodeIntelStore } from "../codeIntelStore";
import type { CodexUsageSnapshot } from "../codexUsage";
import type { GitHubPublishReadiness } from "../githubPublishReadiness";
import type { GitHubRepoSummarySnapshot } from "../githubRepoSummary";
import { logVerbose } from "../logging";
import type { MonitorService } from "../monitor";
import type { ProviderHandshakeRunner } from "../providerHandshake";
import type { TelegramBridge } from "../telegramBridge";
import { handleAgentActivityRoute } from "./agentActivityRoutes";
import { handleAgentInboxRoute } from "./agentInboxRoutes";
import { handleAgentManifestEvaluateRoute, handleAgentManifestsRoute } from "./agentManifestRoutes";
import { handleAgentObsidianRoute } from "./agentObsidianRoutes";
import { handleAgentRosterRoute } from "./agentRosterRoutes";
import { handleAutonomousSkillsRoute } from "./autonomousSkillRoutes";
import { handleCodeIntelEventsRoute } from "./codeIntelRoutes";
import {
  handleConversationExportRoute,
  handleConversationItemRoute,
  handleConversationSearchRoute,
  handleConversationsCollectionRoute,
} from "./conversationRoutes";
import {
  handleDeckSkillsRoute,
  handleDeckTentacleItemRoute,
  handleDeckTentacleSkillsRoute,
  handleDeckTentacleSwarmRoute,
  handleDeckTentaclesRoute,
  handleDeckTodoAddRoute,
  handleDeckTodoDeleteRoute,
  handleDeckTodoEditRoute,
  handleDeckTodoSolveRoute,
  handleDeckTodoToggleRoute,
  handleDeckVaultFileRoute,
} from "./deckRoutes";
import { handleTentacleGitPullRequestRoute, handleTentacleGitRoute } from "./gitRoutes";
import { handleGoalItemRoute, handleGoalsRoute } from "./goalRoutes";
import { handleLocalWorkflowExecutionRoute } from "./localWorkflowExecutionRoutes";
import { handleMemoryRoute } from "./memoryRoutes";
import {
  handleChannelMessagesRoute,
  handleHookRoute,
  handlePromptItemRoute,
  handlePromptsCollectionRoute,
  handleUiStateRoute,
  handleWorkspaceSetupRoute,
} from "./miscRoutes";
import {
  handleMonitorConfigRoute,
  handleMonitorFeedRoute,
  handleMonitorRefreshRoute,
} from "./monitorRoutes";
import { handleOperatorUpdatesRoute } from "./operatorUpdateRoutes";
import { handleProviderHandshakeRoute } from "./providerHandshakeRoutes";
import type {
  ApiRouteHandler,
  RouteHandlerContext,
  RouteHandlerDependencies,
  TerminalRuntime,
} from "./routeHelpers";
import { writeJson, writeNoContent } from "./routeHelpers";
import {
  handleRuntimePoliciesRoute,
  handleRuntimePolicyEvaluateRoute,
} from "./runtimePolicyRoutes";
import {
  getRequestCorsOrigin,
  isAllowedHostHeader,
  isAllowedOriginHeader,
  readHeaderValue,
} from "./security";
import { handleSessionHistoryRoute } from "./sessionHistoryRoutes";
import { handleSwarmRegistryItemRoute, handleSwarmRegistryRoute } from "./swarmRegistryRoutes";
import { handleTelegramStatusRoute } from "./telegramRoutes";
import {
  handleAuditLogRoute,
  handleTerminalActionRoute,
  handleTerminalAuditRoute,
  handleTerminalItemRoute,
  handleTerminalPruneRoute,
  handleTerminalSnapshotsRoute,
  handleTerminalsCollectionRoute,
} from "./terminalRoutes";
import {
  handleClaudeUsageRoute,
  handleCodexUsageRoute,
  handleGithubPublishReadinessRoute,
  handleGithubSummaryRoute,
  handleUsageHeatmapRoute,
} from "./usageRoutes";
import {
  handleWorkflowItemRoute,
  handleWorkflowRunClaimRoute,
  handleWorkflowRunItemRoute,
  handleWorkflowRunOutcomeRoute,
  handleWorkflowRunsRoute,
  handleWorkflowsRoute,
} from "./workflowRoutes";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

type CreateApiRequestHandlerOptions = {
  runtime: TerminalRuntime;
  workspaceCwd: string;
  projectStateDir: string;
  promptsDir: string;
  userPromptsDir: string;
  webDistDir?: string | undefined;
  getApiBaseUrl: () => string;
  getApiPort: () => string;
  readClaudeUsageSnapshot: () => Promise<ClaudeUsageSnapshot>;
  readClaudeOauthUsageSnapshot: () => Promise<ClaudeUsageSnapshot>;
  readClaudeCliUsageSnapshot: () => Promise<ClaudeUsageSnapshot>;
  readCodexUsageSnapshot: () => Promise<CodexUsageSnapshot>;
  readGithubRepoSummary: () => Promise<GitHubRepoSummarySnapshot>;
  readGithubPublishReadiness: () => Promise<GitHubPublishReadiness>;
  scanUsageHeatmap: (scope: "all" | "project") => Promise<UsageChartResponse>;
  monitorService: MonitorService;
  invalidateClaudeUsageCache: () => void;
  codeIntelStore: CodeIntelStore;
  telegramBridge: TelegramBridge;
  providerHandshakeRunner: ProviderHandshakeRunner;
  obsidianVaultPath: string;
  allowRemoteAccess: boolean;
};

const API_ROUTE_MAP: ReadonlyMap<string, readonly ApiRouteHandler[]> = new Map([
  [
    "agents",
    [
      handleAgentObsidianRoute,
      handleAgentInboxRoute,
      handleAgentActivityRoute,
      handleOperatorUpdatesRoute,
      handleAgentRosterRoute,
    ],
  ],
  ["swarms", [handleSwarmRegistryRoute, handleSwarmRegistryItemRoute]],
  ["agent-manifests", [handleAgentManifestEvaluateRoute, handleAgentManifestsRoute]],
  ["operator-updates", [handleOperatorUpdatesRoute]],
  ["autonomous-skills", [handleAutonomousSkillsRoute]],
  ["channels", [handleChannelMessagesRoute]],
  ["telegram", [handleTelegramStatusRoute]],
  ["providers", [handleProviderHandshakeRoute]],
  ["hooks", [handleHookRoute]],
  ["prompts", [handlePromptsCollectionRoute, handlePromptItemRoute]],
  [
    "deck",
    [
      handleDeckSkillsRoute,
      handleDeckTentaclesRoute,
      handleDeckTentacleItemRoute,
      handleDeckTentacleSkillsRoute,
      handleDeckTodoSolveRoute,
      handleDeckTentacleSwarmRoute,
      handleDeckTodoToggleRoute,
      handleDeckTodoEditRoute,
      handleDeckTodoAddRoute,
      handleDeckTodoDeleteRoute,
      handleDeckVaultFileRoute,
    ],
  ],
  ["terminal-snapshots", [handleTerminalSnapshotsRoute]],
  ["audit", [handleAuditLogRoute]],
  ["codex", [handleCodexUsageRoute]],
  ["claude", [handleClaudeUsageRoute]],
  ["analytics", [handleUsageHeatmapRoute]],
  ["github", [handleGithubPublishReadinessRoute, handleGithubSummaryRoute]],
  ["goals", [handleGoalsRoute, handleGoalItemRoute]],
  ["setup", [handleWorkspaceSetupRoute]],
  ["ui-state", [handleUiStateRoute]],
  ["monitor", [handleMonitorConfigRoute, handleMonitorFeedRoute, handleMonitorRefreshRoute]],
  ["memory", [handleMemoryRoute]],
  ["sessions", [handleSessionHistoryRoute]],
  ["runtime-policies", [handleRuntimePolicyEvaluateRoute, handleRuntimePoliciesRoute]],
  [
    "workflows",
    [
      handleWorkflowRunClaimRoute,
      handleLocalWorkflowExecutionRoute,
      handleWorkflowRunOutcomeRoute,
      handleWorkflowRunItemRoute,
      handleWorkflowRunsRoute,
      handleWorkflowItemRoute,
      handleWorkflowsRoute,
    ],
  ],
  [
    "conversations",
    [
      handleConversationsCollectionRoute,
      handleConversationSearchRoute,
      handleConversationExportRoute,
      handleConversationItemRoute,
    ],
  ],
  [
    "terminals",
    [
      handleTerminalsCollectionRoute,
      handleTerminalPruneRoute,
      handleTerminalAuditRoute,
      handleTerminalActionRoute,
      handleTerminalItemRoute,
    ],
  ],
  ["tentacles", [handleTentacleGitRoute, handleTentacleGitPullRequestRoute]],
  ["code-intel", [handleCodeIntelEventsRoute]],
]);

const extractRoutePrefix = (pathname: string): string | null => {
  const segments = pathname.split("/");
  if (segments.length < 3 || segments[1] !== "api") {
    return null;
  }
  return segments[2] ?? null;
};

const logRequest = (method: string, path: string, status: number, startTime: number) => {
  logVerbose(`[API] ${method} ${path} ${status} ${Date.now() - startTime}ms`);
};

const AUDIT_SAFE_QUERY_KEYS = new Set([
  "agentId",
  "format",
  "limit",
  "scope",
  "status",
  "tentacleId",
]);
const MAX_AUDIT_QUERY_PARAMETERS = 20;
const MAX_AUDIT_QUERY_VALUE_LENGTH = 160;

// Keep routing metadata without putting prompts, session values, or credentials into durable audit.
const redactAuditQuery = (requestUrl: URL) => {
  const entries = [...requestUrl.searchParams.entries()].slice(0, MAX_AUDIT_QUERY_PARAMETERS);
  if (entries.length === 0) return "";
  const serialized = entries.map(([key, value]) => {
    const safeValue = AUDIT_SAFE_QUERY_KEYS.has(key)
      ? encodeURIComponent(value.slice(0, MAX_AUDIT_QUERY_VALUE_LENGTH))
      : "[redacted]";
    return `${encodeURIComponent(key)}=${safeValue}`;
  });
  if (requestUrl.searchParams.size > entries.length)
    serialized.push("[additional_parameters_redacted]");
  return `?${serialized.join("&")}`;
};

const safeDecodeURIComponent = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const extractTerminalIdFromPath = (pathname: string): string | undefined => {
  const match = pathname.match(/^\/api\/terminals\/([^/]+)/);
  return match ? safeDecodeURIComponent(match[1] ?? "") : undefined;
};

const extractTerminalIdFromRequest = (request: IncomingMessage, requestUrl: URL) =>
  extractTerminalIdFromPath(requestUrl.pathname) ??
  requestUrl.searchParams.get("octogent_session") ??
  readHeaderValue(request.headers["x-octogent-session"]) ??
  undefined;

const serveStaticFile = async (
  response: ServerResponse,
  webDistDir: string,
  pathname: string,
): Promise<boolean> => {
  // Prevent path traversal.
  const safePath = pathname.replace(/\.\./g, "").replace(/\/+/g, "/");
  const filePath = join(webDistDir, safePath === "/" ? "index.html" : safePath);

  try {
    const content = await readFile(filePath);
    const ext = extname(filePath);
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
    response.writeHead(200, { "Content-Type": contentType });
    response.end(content);
    return true;
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code !== "ENOENT") {
      console.error(
        `[API] Static file error: ${filePath}`,
        error instanceof Error ? error.message : error,
      );
    }
    return false;
  }
};

export const createApiRequestHandler = ({
  runtime,
  workspaceCwd,
  projectStateDir,
  promptsDir,
  userPromptsDir,
  webDistDir,
  getApiBaseUrl,
  getApiPort,
  readClaudeUsageSnapshot,
  readClaudeOauthUsageSnapshot,
  readClaudeCliUsageSnapshot,
  readCodexUsageSnapshot,
  readGithubRepoSummary,
  readGithubPublishReadiness,
  scanUsageHeatmap,
  monitorService,
  invalidateClaudeUsageCache,
  codeIntelStore,
  telegramBridge,
  providerHandshakeRunner,
  obsidianVaultPath,
  allowRemoteAccess,
}: CreateApiRequestHandlerOptions) => {
  const resolvedWebDistDir = webDistDir && existsSync(webDistDir) ? webDistDir : null;

  const routeDependencies: RouteHandlerDependencies = {
    runtime,
    workspaceCwd,
    projectStateDir,
    promptsDir,
    userPromptsDir,
    getApiBaseUrl,
    getApiPort,
    readClaudeUsageSnapshot,
    readClaudeOauthUsageSnapshot,
    readClaudeCliUsageSnapshot,
    readCodexUsageSnapshot,
    readGithubRepoSummary,
    readGithubPublishReadiness,
    scanUsageHeatmap,
    monitorService,
    invalidateClaudeUsageCache,
    codeIntelStore,
    telegramBridge,
    providerHandshakeRunner,
    obsidianVaultPath,
  };

  return async (request: IncomingMessage, response: ServerResponse) => {
    const startTime = Date.now();
    let statusCode = 0;
    let didAuditRequest = false;
    const auditRequest = () => {
      if (didAuditRequest) {
        return;
      }
      didAuditRequest = true;
      const requestUrl = new URL(request.url ?? "/", "http://localhost");
      if (request.method === "GET" && requestUrl.pathname === "/api/setup") {
        return;
      }
      const terminalId = extractTerminalIdFromRequest(request, requestUrl);
      runtime.appendAuditEvent("api.call", {
        ...(terminalId ? { terminalId } : {}),
        payload: {
          method: request.method ?? "?",
          path: requestUrl.pathname,
          query: redactAuditQuery(requestUrl),
          status: statusCode || response.statusCode,
          origin: readHeaderValue(request.headers.origin) ?? null,
        },
      });
    };
    const originalWriteHead = response.writeHead.bind(response);
    const originalEnd = response.end.bind(response);
    response.writeHead = ((...args: Parameters<typeof response.writeHead>) => {
      statusCode = typeof args[0] === "number" ? args[0] : 0;
      return originalWriteHead(...args);
    }) as typeof response.writeHead;
    response.end = ((...args: Parameters<typeof response.end>) => {
      auditRequest();
      return originalEnd(...args);
    }) as typeof response.end;

    const originHeader = readHeaderValue(request.headers.origin);
    const hostHeader = readHeaderValue(request.headers.host);
    const corsOrigin = getRequestCorsOrigin(originHeader, allowRemoteAccess);

    if (!isAllowedHostHeader(hostHeader, allowRemoteAccess)) {
      writeJson(response, 403, { error: "Host not allowed." }, null);
      logRequest(request.method ?? "?", request.url ?? "/", 403, startTime);
      return;
    }

    if (!isAllowedOriginHeader(originHeader, allowRemoteAccess)) {
      writeJson(response, 403, { error: "Origin not allowed." }, null);
      logRequest(request.method ?? "?", request.url ?? "/", 403, startTime);
      return;
    }

    try {
      const requestUrl = new URL(request.url ?? "/", "http://localhost");

      if (request.method === "OPTIONS") {
        writeNoContent(response, 204, corsOrigin);
        logRequest(request.method ?? "OPTIONS", requestUrl.pathname, statusCode, startTime);
        return;
      }

      const routeContext: RouteHandlerContext = {
        request,
        response,
        requestUrl,
        corsOrigin,
      };

      const prefix = extractRoutePrefix(requestUrl.pathname);
      const handlers = prefix !== null ? API_ROUTE_MAP.get(prefix) : undefined;
      if (handlers) {
        for (const handleRoute of handlers) {
          if (await handleRoute(routeContext, routeDependencies)) {
            logRequest(request.method ?? "?", requestUrl.pathname, statusCode, startTime);
            return;
          }
        }
      }

      // Serve static web frontend if available.
      if (resolvedWebDistDir && request.method === "GET") {
        const served =
          (await serveStaticFile(response, resolvedWebDistDir, requestUrl.pathname)) ||
          (await serveStaticFile(response, resolvedWebDistDir, "/"));
        if (served) {
          logRequest(request.method, requestUrl.pathname, 200, startTime);
          return;
        }
      }

      writeJson(response, 404, { error: "Not found" }, corsOrigin);
      logRequest(request.method ?? "?", requestUrl.pathname, statusCode, startTime);
    } catch (error) {
      console.error(
        `[API] Unhandled error: ${request.method ?? "?"} ${request.url ?? "/"}`,
        error instanceof Error ? (error.stack ?? error.message) : error,
      );
      writeJson(
        response,
        500,
        {
          error: "Internal server error",
        },
        corsOrigin,
      );
      logRequest(request.method ?? "?", request.url ?? "/", statusCode, startTime);
    }
  };
};
