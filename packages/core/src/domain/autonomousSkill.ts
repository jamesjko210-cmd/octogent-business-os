export type AutonomousSkillId =
  | "memory-management"
  | "workflow-orchestration"
  | "capability-registry"
  | "multi-agent-coordination"
  | "agent-activity-reporting"
  | "context-awareness"
  | "security-guardrails"
  | "production-app-security"
  | "goal-oriented-action"
  | "self-correction"
  | "human-in-the-loop"
  | "modular-reusability"
  | "openspace-skill-evolution"
  | "video-backed-skill-mining"
  | "parallel-codebase-recon"
  | "multi-perspective-review-council"
  | "ui-ux-production-system"
  | "business-automation-operator"
  | "inside-out-outbound-system"
  | "browser-control-harness"
  | "persistent-second-brain"
  | "content-production-pipeline"
  | "prompt-operating-system"
  | "cross-model-collaboration"
  | "rag-research-system"
  | "token-budget-control"
  | "local-free-model-lab"
  | "developer-tool-interop"
  | "brand-voice-and-persona"
  | "motion-and-web-experience"
  | "startup-business-story"
  | "agentic-os-architecture";

export type AutonomousSkill = {
  id: AutonomousSkillId;
  title: string;
  description: string;
  alwaysOn: boolean;
  instructions: string[];
};
