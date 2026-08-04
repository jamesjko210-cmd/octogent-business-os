import type { Goal } from "@octogent/core";
import { createGoalStore } from "./goalStore";

export const renderGoalRuntimeSection = ({
  projectStateDir,
  tentacleId,
  ownerAgentId,
}: {
  projectStateDir: string;
  tentacleId?: string;
  ownerAgentId?: string;
}) => {
  const goalScope: { tentacleId?: string; ownerAgentId?: string } = {};
  if (tentacleId) {
    goalScope.tentacleId = tentacleId;
  }
  if (ownerAgentId) {
    goalScope.ownerAgentId = ownerAgentId;
  }
  const activeGoals = createGoalStore(projectStateDir).list({ ...goalScope, status: "active" });
  const plannedGoals = createGoalStore(projectStateDir).list({ ...goalScope, status: "planned" });
  const goals = [...activeGoals, ...plannedGoals].slice(0, 8);

  const renderGoal = (goal: Goal) =>
    [
      `- ${goal.title} (\`${goal.id}\`, ${goal.status}, ${goal.priority})`,
      goal.description ? `  Description: ${goal.description}` : "",
      goal.successCriteria.length > 0
        ? `  Success criteria: ${goal.successCriteria.join("; ")}`
        : "",
      goal.constraints.length > 0 ? `  Constraints: ${goal.constraints.join("; ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");

  return [
    "## Runtime Goals",
    "",
    "Use these goals as the source of truth for outcome, priority, success criteria, and constraints.",
    "If no relevant goal exists, infer the smallest useful goal from the assigned task and report it clearly.",
    "",
    goals.length > 0
      ? goals.map(renderGoal).join("\n")
      : "- No active or planned goal is currently scoped to this task.",
  ].join("\n");
};
