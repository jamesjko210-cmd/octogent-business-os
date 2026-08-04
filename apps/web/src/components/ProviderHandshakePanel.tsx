import { useEffect, useState } from "react";

import { buildCodexProviderHandshakeUrl } from "../runtime/runtimeEndpoints";
import { ActionButton } from "./ui/ActionButton";

type ProviderHandshakeStatus = "not_run" | "succeeded" | "failed" | "unavailable" | "rate_limited";

type ProviderHandshakeSnapshot = {
  provider: "codex";
  status: ProviderHandshakeStatus;
  checkedAt?: string;
  retryAt?: string;
  detail: string;
};

const STATUS_LABEL: Record<ProviderHandshakeStatus, string> = {
  not_run: "Not run",
  succeeded: "Response verified",
  failed: "Check failed",
  unavailable: "Unavailable",
  rate_limited: "Wait before retrying",
};

export const ProviderHandshakePanel = ({ codexSignedIn }: { codexSignedIn: boolean }) => {
  const [snapshot, setSnapshot] = useState<ProviderHandshakeSnapshot | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!codexSignedIn) return;
    let isCurrent = true;
    void fetch(buildCodexProviderHandshakeUrl(), { headers: { Accept: "application/json" } })
      .then(async (response) => {
        const payload = (await response
          .json()
          .catch(() => null)) as ProviderHandshakeSnapshot | null;
        if (!response.ok || !payload) throw new Error("Unable to read Codex check status.");
        if (isCurrent) setSnapshot(payload);
      })
      .catch((requestError: unknown) => {
        if (isCurrent) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Unable to read Codex check status.",
          );
        }
      });
    return () => {
      isCurrent = false;
    };
  }, [codexSignedIn]);

  const runHandshake = async () => {
    setIsRunning(true);
    setError(null);
    try {
      const response = await fetch(buildCodexProviderHandshakeUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ confirmation: "RUN_CODEX_READ_ONLY_HANDSHAKE" }),
      });
      const payload = (await response.json().catch(() => null)) as ProviderHandshakeSnapshot | null;
      if (!response.ok || !payload) throw new Error("Codex could not complete the isolated check.");
      setSnapshot(payload);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Codex could not complete the isolated check.",
      );
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <section
      className="settings-panel settings-panel--provider-handshake"
      aria-label="Codex provider check"
    >
      <header className="settings-panel-header settings-provider-handshake-header">
        <div>
          <h2>Codex provider check</h2>
          <p>
            Verify one minimal model response only when you choose. This does not launch an agent,
            read this project, or allow tools.
          </p>
        </div>
        <span
          data-status={snapshot?.status ?? "not_run"}
          className="settings-provider-handshake-status"
        >
          {snapshot ? STATUS_LABEL[snapshot.status] : "Checking sign-in"}
        </span>
      </header>
      {!codexSignedIn ? (
        <p className="settings-provider-handshake-detail">
          Sign in to the local Codex CLI first. This control stays disabled until local sign-in is
          verified.
        </p>
      ) : null}
      {codexSignedIn && snapshot ? (
        <p className="settings-provider-handshake-detail">{snapshot.detail}</p>
      ) : null}
      {snapshot?.retryAt ? (
        <small className="settings-provider-handshake-detail">
          Retry after {new Date(snapshot.retryAt).toLocaleTimeString()}.
        </small>
      ) : null}
      {error ? <p className="settings-provider-handshake-error">{error}</p> : null}
      <div className="settings-panel-actions">
        <ActionButton
          aria-label="Run isolated Codex provider check"
          disabled={!codexSignedIn || isRunning}
          onClick={() => void runHandshake()}
          size="dense"
          variant="accent"
        >
          {isRunning ? "Checking Codex..." : "Run isolated check"}
        </ActionButton>
        <small>Uses your signed-in plan. It is manual, read-only, and rate-limited.</small>
      </div>
    </section>
  );
};
