export type GoalStatus =
  | "planned"
  | "active"
  | "blocked"
  | "needs_review"
  | "completed"
  | "cancelled";

export type GoalPriority = "low" | "normal" | "high" | "urgent";

export type Goal = {
  id: string;
  title: string;
  description: string;
  status: GoalStatus;
  priority: GoalPriority;
  tentacleId?: string;
  ownerAgentId?: string;
  successCriteria: string[];
  constraints: string[];
  evidence: string[];
  createdAt: string;
  updatedAt: string;
};

export type GoalSnapshot = {
  goals: Goal[];
};
