import { buildSessionHistory } from "../sessionHistory";
import type { ApiRouteHandler } from "./routeHelpers";
import { writeJson, writeMethodNotAllowed } from "./routeHelpers";

export const handleSessionHistoryRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { runtime },
) => {
  if (requestUrl.pathname !== "/api/sessions") return false;
  if (request.method !== "GET") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const sessions = buildSessionHistory({
    auditEvents: runtime.listAuditEvents(),
    terminalSnapshots: runtime.listTerminalSnapshots(),
  });
  runtime.appendAuditEvent("session_history.listed", { payload: { count: sessions.length } });
  writeJson(response, 200, { sessions }, corsOrigin);
  return true;
};
