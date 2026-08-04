export type RuntimePolicyDecision = "allow" | "requires_approval" | "deny";

export type RuntimePolicy = {
  id: string;
  title: string;
  decision: RuntimePolicyDecision;
  match: {
    actionTypes: string[];
    keywords: string[];
  };
  rationale: string;
};

export type RuntimePolicyEvaluation = {
  decision: RuntimePolicyDecision;
  matchedPolicies: RuntimePolicy[];
  rationale: string;
};
