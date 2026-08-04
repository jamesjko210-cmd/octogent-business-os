import { listAutonomousSkills } from "../autonomousSkills";
import type { ApiRouteHandler } from "./routeHelpers";
import { writeJson, writeMethodNotAllowed } from "./routeHelpers";

export const handleAutonomousSkillsRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { runtime },
) => {
  if (requestUrl.pathname !== "/api/autonomous-skills") {
    return false;
  }

  if (request.method !== "GET") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const skills = listAutonomousSkills();
  runtime.appendAuditEvent("autonomous_skills.loaded", {
    payload: {
      count: skills.length,
      ids: skills.map((skill) => skill.id),
    },
  });
  writeJson(response, 200, { skills }, corsOrigin);
  return true;
};
