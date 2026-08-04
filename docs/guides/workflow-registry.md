# Workflow Registry

The Workflow Registry turns a repeatable operating procedure into durable project state. It is the bridge between a goal and a safe, inspectable piece of agent work.

Each workflow has:

- a title, purpose, owner agent, and optional tentacle/goal link
- a human-led, human-assisted, or autonomous operating level
- a written SOP, success criteria, and allowed-tool list
- an action description that the policy layer evaluates every time a run is requested
- a persistent run record, including status, policy decision, approval decision, timestamps, and audit event

The registry is intentionally not a silent job launcher. In the current version, a safe run becomes `queued`; an approval-required run becomes `awaiting_approval`; and a prohibited run becomes `denied`. A queued run may be claimed only by an already-created terminal that matches the owner manifest's provider, workspace mode, and tentacle scope. Claiming records a `running` worker binding; it does not start a terminal, send a prompt, or call an external provider.

## Operating Levels

- **Human led**: people choose when the work begins. A scheduler or agent cannot start it without an operator approval.
- **Human assisted**: agents can prepare a draft, analysis, or local result, while a person owns the decision and any risky handoff.
- **Autonomous**: agents can prepare and queue safe, scoped work without a person repeating every small instruction. Global and agent policy still override this label.

Autonomous is not permission to spend money, publish, deploy, handle personal data, use API keys, or perform destructive operations.

## Policy Check

When a run is requested, Octogent evaluates both the global runtime policy and the owner agent's manifest policy. The stricter result wins:

- `allow` creates a `queued` run.
- `requires_approval` creates an `awaiting_approval` run.
- `deny` creates a `denied` run.

Approval is recorded as an operator decision. An approved run moves to `queued`; it still does not execute automatically in this first registry release.

## Initial Workflows

The first API read seeds four local operating procedures:

- Game QA and balance sweep, owned by Codex Executor
- Research triad brief, owned by Claude Strategist
- Developer journal update, owned by Notion Record Center
- Playtest feedback review, owned by Claude Strategist

They can be reviewed, paused, and extended from the **[9] Workflows** view. New workflows always start as drafts so their scope can be reviewed before activation.

## API

- `GET /api/workflows` lists workflows and run history, and seeds the initial workflows on first use.
- `POST /api/workflows` creates a draft workflow.
- `PATCH /api/workflows/:workflowId` changes workflow status.
- `POST /api/workflows/:workflowId/runs` requests a policy-aware run.
- `PATCH /api/workflows/:workflowId/runs/:runId` approves or rejects a pending run.
- `POST /api/workflows/:workflowId/runs/:runId/claim` binds an eligible queued run to a matching existing terminal. The request body is `{ "terminalId": "..." }`, or `{ "selectSingleEligibleWorker": true }` when the operator wants Octogent to claim only if one and only one eligible terminal exists.
- `POST /api/workflows/:workflowId/runs/:runId/outcome` records a claimed run's final `succeeded`, `blocked`, or `failed` outcome. The request body provides a concise `summary` and optional bounded `evidence` entries.

All registry actions are written to the local hash-chained audit log. State is stored in `.octogent/state/workflows.json` for the active project.

## Claim Guardrails

The claim boundary verifies the workflow is active, the run is queued, the terminal exists and is available, and the terminal provider, tentacle, and workspace mode match the owner manifest. Runtime and manifest policies are evaluated again immediately before claim. A new approval requirement blocks the claim until the operator approves; a denial blocks it entirely. The safe-selection option considers only live or idle terminals whose runtime state is idle and refuses to choose if zero or more than one terminal qualifies. Claims are single-use and emit requested, accepted, or rejected events to the local hash-chained audit log.

## Next Runtime Layer

Outcome records are bounded and redact common credential patterns before persistence. They are intended for verified result summaries, not raw logs, browser sessions, secrets, or personal data.

The next execution adapter must preserve the run's policy decision, input, output, and tool-use evidence; dispatch only an explicitly supported local workflow; and require fresh approval when a plan changes scope or gains an external side effect. Keeping prompt delivery and provider execution separate from the claim prevents the dashboard from implying that a claimed request has already performed work.

## First Local Executor

The initial adapter is intentionally narrow: only the claimed `Game QA and balance sweep` workflow can call `POST /api/workflows/:workflowId/runs/:runId/execute-local`. It runs two fixed Node test files from the local Block Bounce project: `tests/game-engine.test.mjs` and `tests/rankings.test.mjs`.

The route accepts no command, path, argument, environment, network target, or shell text from the request. It requires the same live Codex terminal that claimed the run, updates the role to `testing`, records a bounded/redacted outcome, then moves the activity to `reviewing` on success or `waiting` on failure. Other workflows remain non-executable until they receive their own reviewed adapter.
