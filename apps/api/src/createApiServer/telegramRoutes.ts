import type { ApiRouteHandler } from "./routeHelpers";
import { writeJson, writeMethodNotAllowed } from "./routeHelpers";

export const handleTelegramStatusRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { telegramBridge },
) => {
  if (requestUrl.pathname !== "/api/telegram/status") return false;
  if (request.method !== "GET") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  writeJson(response, 200, telegramBridge.getStatus(), corsOrigin);
  return true;
};
