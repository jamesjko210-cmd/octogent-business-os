import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const UPSTREAM_REPOSITORY = "github.com/hesamsheikh/octogent";

type CommandResult = { stdout: string; stderr: string };
type RunCommand = (
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
) => Promise<CommandResult>;

export type GitHubPublishReadiness = {
  status: "ready" | "needs_user_remote" | "needs_approval" | "unavailable";
  origin: string | null;
  message: string;
};

type Dependencies = { cwd?: string; env?: NodeJS.ProcessEnv; runCommand?: RunCommand };

const defaultRunCommand: RunCommand = async (command, args, options) => {
  const result = await execFileAsync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
  });
  return { stdout: result.stdout, stderr: result.stderr };
};

const redactOrigin = (origin: string) =>
  origin.replace(/:\/\/[^/@]+@/, "://[redacted]@").replace(/^([^@/\s]+)@/, "[redacted]@");

const normalizeRepositoryOrigin = (origin: string) => {
  const withoutScheme = origin.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const withoutUser = withoutScheme.replace(/^[^@/\s]+@/, "");
  return withoutUser
    .replace(/^([^/]+):/, "$1/")
    .replace(/\.git\/?$/i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
};

export const readGithubPublishReadiness = async (
  dependencies: Dependencies = {},
): Promise<GitHubPublishReadiness> => {
  const cwd = dependencies.cwd ?? process.cwd();
  const env = dependencies.env ?? process.env;
  const runCommand = dependencies.runCommand ?? defaultRunCommand;
  let origin = "";

  try {
    origin = (await runCommand("git", ["remote", "get-url", "origin"], { cwd, env })).stdout.trim();
  } catch {
    return {
      status: "unavailable",
      origin: null,
      message:
        "No Git origin is available. Create a user-owned GitHub repository before publishing.",
    };
  }

  if (!origin) {
    return {
      status: "unavailable",
      origin: null,
      message:
        "No Git origin is configured. Create a user-owned GitHub repository before publishing.",
    };
  }

  const approvedOrigin = env.OCTOGENT_GITHUB_PUBLISH_ORIGIN?.trim();
  if (normalizeRepositoryOrigin(origin) === UPSTREAM_REPOSITORY) {
    return {
      status: "needs_user_remote",
      origin: redactOrigin(origin),
      message:
        "Origin points to the upstream Octogent repository. Publishing is blocked until you set a user-owned remote.",
    };
  }

  if (!approvedOrigin || origin !== approvedOrigin) {
    return {
      status: "needs_approval",
      origin: redactOrigin(origin),
      message:
        "Origin has not been explicitly approved for publishing. Set OCTOGENT_GITHUB_PUBLISH_ORIGIN to the exact user-owned remote after review.",
    };
  }

  return {
    status: "ready",
    origin: redactOrigin(origin),
    message:
      "A user-owned remote is explicitly approved. Reviewed releases may be committed and pushed after operator approval.",
  };
};
