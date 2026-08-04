import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const CODEX_HANDSHAKE_CONFIRMATION = "RUN_CODEX_READ_ONLY_HANDSHAKE";

const CODEX_HANDSHAKE_PROMPT =
  "Reply with exactly OCTOGENT_PROVIDER_HANDSHAKE_OK. Do not use tools, access files, or take any action.";
const MIN_HANDSHAKE_INTERVAL_MS = 5 * 60 * 1000;

export type ProviderHandshakeStatus =
  | "not_run"
  | "succeeded"
  | "failed"
  | "unavailable"
  | "rate_limited";

export type ProviderHandshakeSnapshot = {
  provider: "codex";
  status: ProviderHandshakeStatus;
  checkedAt?: string;
  retryAt?: string;
  detail: string;
};

export type ProviderHandshakeRunner = {
  read(): ProviderHandshakeSnapshot;
  runCodex(): ProviderHandshakeSnapshot;
};

type ProviderHandshakeOptions = {
  now?: () => Date;
  execFileSyncImpl?: typeof execFileSync;
  isCodexAvailable?: () => boolean;
};

const readOnlySandboxArgs = (outputPath: string) => [
  "exec",
  "--ephemeral",
  "--ignore-rules",
  "--ignore-user-config",
  "--skip-git-repo-check",
  "--sandbox",
  "read-only",
  "--output-last-message",
  outputPath,
  CODEX_HANDSHAKE_PROMPT,
];

export const createProviderHandshakeRunner = (
  options: ProviderHandshakeOptions = {},
): ProviderHandshakeRunner => {
  const now = options.now ?? (() => new Date());
  const exec = options.execFileSyncImpl ?? execFileSync;
  const isCodexAvailable = options.isCodexAvailable ?? (() => true);
  let latest: ProviderHandshakeSnapshot = {
    provider: "codex",
    status: "not_run",
    detail: "No provider response check has been run.",
  };

  const read = () => latest;

  const runCodex = () => {
    const startedAt = now();
    if (!isCodexAvailable()) {
      latest = {
        provider: "codex",
        status: "unavailable",
        checkedAt: startedAt.toISOString(),
        detail: "Codex CLI is unavailable on this Mac.",
      };
      return latest;
    }

    const previousCheck = latest.checkedAt ? Date.parse(latest.checkedAt) : Number.NaN;
    if (
      Number.isFinite(previousCheck) &&
      startedAt.getTime() - previousCheck < MIN_HANDSHAKE_INTERVAL_MS
    ) {
      latest = {
        provider: "codex",
        status: "rate_limited",
        checkedAt: startedAt.toISOString(),
        retryAt: new Date(previousCheck + MIN_HANDSHAKE_INTERVAL_MS).toISOString(),
        detail: "Wait five minutes before another Codex response check.",
      };
      return latest;
    }

    const handshakeDir = mkdtempSync(join(tmpdir(), "octogent-codex-handshake-"));
    const outputPath = join(handshakeDir, "response.txt");
    try {
      exec("codex", readOnlySandboxArgs(outputPath), {
        cwd: handshakeDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 45_000,
      });
      const output = existsSync(outputPath) ? readFileSync(outputPath, "utf8").trim() : "";
      const succeeded = output === "OCTOGENT_PROVIDER_HANDSHAKE_OK";
      latest = {
        provider: "codex",
        status: succeeded ? "succeeded" : "failed",
        checkedAt: startedAt.toISOString(),
        detail: succeeded
          ? "Codex returned the expected isolated read-only handshake response."
          : "Codex did not return the expected isolated handshake response.",
      };
      return latest;
    } catch {
      latest = {
        provider: "codex",
        status: "failed",
        checkedAt: startedAt.toISOString(),
        detail: "Codex could not complete the isolated read-only handshake.",
      };
      return latest;
    } finally {
      rmSync(handshakeDir, { force: true, recursive: true });
    }
  };

  return { read, runCodex };
};
