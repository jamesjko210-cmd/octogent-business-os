import { buildGithubPublishReadinessUrl } from "../../runtime/runtimeEndpoints";
import { GITHUB_SUMMARY_SCAN_INTERVAL_MS } from "../constants";
import { usePollingData } from "./usePollingData";

export type GitHubPublishReadiness = {
  status: "ready" | "needs_user_remote" | "needs_approval" | "unavailable";
  origin: string | null;
  message: string;
};

const fallback = (): GitHubPublishReadiness => ({
  status: "unavailable",
  origin: null,
  message: "Unable to check GitHub publishing readiness.",
});

const normalize = (value: unknown): GitHubPublishReadiness | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const status = record.status;
  const message = typeof record.message === "string" ? record.message : "";
  const origin = typeof record.origin === "string" ? record.origin : null;
  if (
    (status !== "ready" &&
      status !== "needs_user_remote" &&
      status !== "needs_approval" &&
      status !== "unavailable") ||
    !message
  ) {
    return null;
  }
  return { status, origin, message };
};

export const useGithubPublishReadinessPolling = (enabled: boolean) => {
  const { data, isLoading, refresh } = usePollingData<GitHubPublishReadiness>({
    fetchUrl: buildGithubPublishReadinessUrl(),
    intervalMs: GITHUB_SUMMARY_SCAN_INTERVAL_MS,
    normalize,
    fallback,
    enabled,
  });

  return { githubPublishReadiness: data, isRefreshingGithubPublishReadiness: isLoading, refresh };
};
