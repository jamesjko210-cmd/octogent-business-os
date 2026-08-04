import { CODEX_HANDSHAKE_CONFIRMATION, type ProviderHandshakeRunner } from "../providerHandshake";
import type { ApiRouteHandler } from "./routeHelpers";
import { readJsonBodyOrWriteError, writeJson, writeMethodNotAllowed } from "./routeHelpers";

const CODEX_HANDSHAKE_PATH = "/api/providers/codex/handshake";

const confirmationFrom = (value: unknown) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "";
  const confirmation = (value as Record<string, unknown>).confirmation;
  return typeof confirmation === "string" ? confirmation : "";
};

export const handleProviderHandshakeRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { providerHandshakeRunner, runtime },
) => {
  if (requestUrl.pathname !== CODEX_HANDSHAKE_PATH) return false;

  if (request.method === "GET") {
    writeJson(response, 200, providerHandshakeRunner.read(), corsOrigin);
    return true;
  }

  if (request.method !== "POST") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const body = await readJsonBodyOrWriteError(request, response, corsOrigin);
  if (!body.ok) return true;
  if (confirmationFrom(body.payload) !== CODEX_HANDSHAKE_CONFIRMATION) {
    writeJson(
      response,
      400,
      { error: "Explicit isolated-read-only confirmation is required." },
      corsOrigin,
    );
    return true;
  }

  runtime.appendAuditEvent("provider_handshake.requested", {
    payload: { provider: "codex", mode: "isolated_read_only" },
  });
  const snapshot = providerHandshakeRunner.runCodex();
  runtime.appendAuditEvent("provider_handshake.completed", {
    payload: { provider: "codex", status: snapshot.status },
  });
  writeJson(response, 200, snapshot, corsOrigin);
  return true;
};
