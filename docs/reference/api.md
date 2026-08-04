# API Reference

Octogent exposes a local HTTP and WebSocket API.

The API has two different kinds of state:

- persisted project state, such as terminal records, Deck metadata, UI state, and transcripts
- in-memory runtime state, such as live PTYs, attached WebSockets, and scrollback

Most HTTP routes either read/write persisted files or create runtime records. WebSocket routes attach clients to live PTY sessions owned by the API process.

## Terminals

- `GET /api/terminal-snapshots` - returns the current terminal list and snapshot state for the UI
- `GET /api/audit` - returns the full hash-chained audit log across all terminals and API calls
- `POST /api/terminals` - creates a new terminal session
- `POST /api/terminals/:terminalId/start` - explicitly starts a prepared terminal's local shell
- `POST /api/terminals/prune` - removes terminal records with `stale`, `stopped`, or `exited` lifecycle state
- `PATCH /api/terminals/:terminalId` - updates terminal metadata such as the display name
- `DELETE /api/terminals/:terminalId` - removes a terminal and closes its active session
- `GET /api/terminals/:terminalId/audit` - returns hash-chained audit events for one terminal
- `POST /api/terminals/:terminalId/stop` - stops an active session or recorded stale process
- `POST /api/terminals/:terminalId/kill` - kills an active session or recorded stale process
- `WS /api/terminals/:terminalId/ws` - streams live terminal IO over WebSocket

Terminal snapshots include `lifecycleState` when known. Supported lifecycle states are `registered`, `running`, `stopped`, `exited`, and `stale`. Stale terminals are records that were persisted as running but could not be reattached to a live Octogent PTY session after startup.

Creating a terminal registers metadata first. A PTY starts immediately only when an initial prompt is provided, a WebSocket attaches, an internal direct listener starts the session, or the operator uses the explicit start endpoint. Worktree terminals also create their worktree before the terminal record is exposed. A started shell is not proof that its configured external AI provider is authenticated or responsive.

Every terminal receives an Ed25519 agent identity and an access scope. Snapshots only expose sealed identity metadata plus scoped paths/tools; public keys, private keys, and fingerprints remain internal project state. Audit events are appended to `.octogent/state/audit/events.jsonl` with `previousHash` and `hash` fields so API calls, queries, hooks, tool-use, channel, lifecycle, and operator events can be checked for ordering and tampering without exposing public fingerprints.

## Git and worktrees

- `GET /api/tentacles/:tentacleId/git/status` - reads git status for a worktree-backed tentacle
- `POST /api/tentacles/:tentacleId/git/commit` - creates a commit from the tentacle worktree
- `POST /api/tentacles/:tentacleId/git/push` - pushes the tentacle branch
- `POST /api/tentacles/:tentacleId/git/sync` - syncs the tentacle worktree with its base branch
- `GET /api/tentacles/:tentacleId/git/pr` - reads pull request information for the tentacle branch
- `POST /api/tentacles/:tentacleId/git/pr/merge` - merges the tentacle pull request

## Deck and tentacles

- `GET /api/deck/skills` - lists available Claude Code skills discovered from project-local `.claude/skills/<skill>/SKILL.md` entries
- `GET /api/deck/tentacles` - lists tentacles with metadata, vault files, and todo progress
- `POST /api/deck/tentacles` - creates a new tentacle
- `DELETE /api/deck/tentacles/:tentacleId` - deletes a tentacle and its stored files
- `PATCH /api/deck/tentacles/:tentacleId/skills` - updates the tentacle's suggested Claude Code skills and rewrites the managed block in `CONTEXT.md`
- `POST /api/deck/tentacles/:tentacleId/todo` - adds a todo item to `todo.md`
- `PATCH /api/deck/tentacles/:tentacleId/todo/toggle` - marks a todo item done or undone
- `PATCH /api/deck/tentacles/:tentacleId/todo/edit` - edits the text of a todo item
- `POST /api/deck/tentacles/:tentacleId/todo/delete` - deletes a todo item
- `GET /api/deck/tentacles/:tentacleId/files/:filename` - reads one markdown file from the tentacle vault
- `POST /api/deck/tentacles/:tentacleId/swarm` - spawns worker terminals from incomplete todo items. Optional JSON fields include `swarmId` or `swarmName` for running multiple named swarms on the same tentacle, `workspaceMode`, `agentProvider`, and `todoItemIndices`.

Deck routes treat `.octogent/tentacles/<tentacle-id>/` as the source of truth for agent-facing context. Todo operations update `todo.md` by parsed item index. Swarm operations derive worker assignments from incomplete parsed todo items.

## Prompts

- `GET /api/prompts` - lists available prompt templates
- `POST /api/prompts` - creates a user prompt
- `GET /api/prompts/:promptId` - reads one prompt
- `PUT /api/prompts/:promptId` - updates one prompt
- `DELETE /api/prompts/:promptId` - deletes one prompt

## Memory

- `GET /api/memory` - lists durable project memory entries
- `GET /api/memory?query=<text>` - searches memory by keyword across content, summaries, tags, source, type, and tentacle scope
- `GET /api/memory?tentacleId=<id>` - limits memory results to one tentacle
- `POST /api/memory` - stores a memory entry with `type`, `content`, optional `summary`, `tags`, `source`, and `tentacleId`

Memory entries are stored in `.octogent/state/memory.json` for the current project. Common credential patterns are redacted from new entries and scrubbed from valid legacy entries before they are returned or retained. This is the local memory spine; external memory systems such as Notion or vector stores can sync into this shape later without changing the agent-facing API.

## Autonomous skills

- `GET /api/autonomous-skills` - lists the always-on operating skills injected into generated agent prompts

Autonomous skills are not manually attached Claude Code skills. Octogent injects them into worker, coordinator, and tentacle prompts so agents proactively use memory, orchestration, capability routing, coordination, context awareness, guardrails, goal-directed action, self-correction, human-in-the-loop escalation, reusable workflow patterns, OpenSpace-style skill evolution, video-backed skill mining, parallel codebase recon, multi-perspective review councils, UI/UX production workflows, business automation operations, inside-out outbound workflows, browser-control harnessing, persistent second-brain capture, content-production pipelines, prompt operating-system patterns, cross-model collaboration, Perplexity-plus-NotebookLM-plus-Notion research triads, token-budget control, local/free model evaluation, developer-tool interop, brand voice/persona capture, motion/web experience, startup-business story framing, and agentic-OS architecture. The built-in research templates are `research-triad-workflow`, `notion-research-brief`, and `inside-out-outbound`.

## Goals and runtime policy

- `GET /api/agents` - lists permanent operating roles with plain-language purpose, launch reason, real terminal-derived status, and the latest valid activity report
- `GET /api/agents/:agentId/inbox` - reads durable operator messages for one permanent role
- `POST /api/agents/:agentId/inbox` - queues a redacted, bounded operator message or a capability-checked permanent-role handoff; it never launches a model or terminal
- `GET /api/agents/:agentId/obsidian?terminalId=<id>&query=<query>` - returns redacted snippets from the project-managed shared Obsidian areas; it requires the exact live role terminal plus its private local capability
- `POST /api/agents/:agentId/obsidian` - appends a redacted, bounded update to the matching role's fixed Obsidian note, or to the fixed shared timeline when the body includes `target: "shared"`; it requires the exact live role terminal plus its private local capability
- `GET /api/agents/:agentId/activity` - reads the latest durable activity report for one permanent role
- `PUT /api/agents/:agentId/activity` - lets a matching live terminal report one concise `planning`, `researching`, `implementing`, `testing`, `reviewing`, or `waiting` activity state with `{ terminalId, status, summary }`; it requires the terminal's private local capability
- `GET /api/agents/:agentId/operator-updates` - lists concise, redacted updates that this role has queued for the operator
- `POST /api/agents/:agentId/operator-updates` - lets only a matching live role terminal queue one concise `{ terminalId, content }` update using its private local capability; it never sends an external message
- `GET /api/operator-updates` - returns the 20 most recent safe role reports for the local operator dashboard; it cannot send, deliver, or modify an update
- `GET /api/agent-manifests` - lists native agent manifests with provider, harness, auth mode, scope, tools, memory, subagents, and policies
- `POST /api/agent-manifests/evaluate` - evaluates one agent action with `agentId`, `actionType`, and `content`, returning `allow`, `requires_approval`, or `deny`
- `GET /api/goals` - lists durable runtime goals
- `GET /api/goals?tentacleId=<id>&status=<status>` - filters goals by tentacle and status
- `POST /api/goals` - creates a goal with `title`, optional `description`, `priority`, `tentacleId`, `successCriteria`, and `constraints`
- `PATCH /api/goals/:goalId` - updates a goal status
- `GET /api/runtime-policies` - lists runtime policies
- `POST /api/runtime-policies/evaluate` - evaluates an action with `actionType` and `content`, returning `allow`, `requires_approval`, or `deny`

Goals are stored in `.octogent/state/goals.json`. Generated worker, coordinator, and tentacle prompts include the scoped runtime goals and policy layer so agents operate against durable outcome state and check risky actions against runtime policy rather than relying only on prompt wording.

Agent manifests are the provider contract for the Agent OS. The initial native team includes Codex Executor, Claude Strategist, Gemini Google Research, Perplexity Live Research, Notion Record Center, and Stitch UI Production. Each starts with API-key access disabled and can be evaluated before an action is allowed into a launcher or workflow.

Runtime policy includes `deny-api-key-workflows`, which blocks API key setup by default. Octogent should use logged-in apps, local CLI subscriptions, browser workflows, connectors, or LM Studio unless the operator explicitly overrides the no-API-keys policy for one exact task.

Role-scoped Obsidian updates are append-only and routed to `Octogent/Agent Updates/<role-id>.md` beneath the configured vault. A matching role may instead submit `{ "target": "shared", "terminalId": "...", "content": "..." }`, which appends to the fixed `Octogent/Shared/Agent Timeline.md` note with the derived role name. Live-role search reads only the project-managed `Octogent/` and `🤖 AI Agent Memory/` areas. Responses expose only redacted snippets and relative note paths; audit records expose only safe metadata, never the update body, query text, or absolute vault path. See [Obsidian Role Memory](../guides/obsidian-role-memory.md).

## Verified session history

- `GET /api/sessions` - projects the append-only local audit into a read-only timeline of managed terminal sessions

Each entry contains only safe metadata: role or terminal title, provider, tentacle, start/end time, end reason, and a count of supporting audit events. Prompt bodies, message bodies, tool output, process IDs, terminal capabilities, and credentials are never returned. The Settings timeline is a local record for review before a human chooses to publish a verified version to a user-owned GitHub remote.

## Workflows

- `GET /api/workflows` - lists persistent workflows and their run history; seeds the initial local workflows on first use
- `POST /api/workflows` - creates a draft workflow with an owner, operating level, SOP, success criteria, and policy-evaluable action
- `PATCH /api/workflows/:workflowId` - changes a workflow status among `draft`, `active`, `paused`, and `archived`
- `POST /api/workflows/:workflowId/runs` - requests a policy-aware workflow run; accepts optional `initiatedBy` as `operator`, `agent`, or `scheduler`
- `PATCH /api/workflows/:workflowId/runs/:runId` - records an `approved` or `rejected` decision for an `awaiting_approval` run
- `POST /api/workflows/:workflowId/runs/:runId/claim` - binds a queued run to an existing terminal after provider, workspace, tentacle, availability, and fresh-policy checks. The request body is either `{ "terminalId": "..." }` or `{ "selectSingleEligibleWorker": true }`; the latter succeeds only when exactly one eligible terminal exists.
- `POST /api/workflows/:workflowId/runs/:runId/outcome` - records one redacted, bounded final outcome with `succeeded`, `blocked`, or `failed` status and optional evidence
- `POST /api/workflows/workflow-game-qa-balance/runs/:runId/execute-local` - runs the one allowlisted local Block Bounce verification plan after the matching Codex terminal claims the run; request body is `{ "terminalId": "..." }`

Workflow state is stored in `.octogent/state/workflows.json`. The registry records intent, policy decisions, approvals, audit evidence, terminal claims, and final outcome summaries. A claim moves an eligible run to `running`, but does not itself send prompts or execute an external provider; that remains a separate, auditable worker-adapter step. See [Workflow Registry](../guides/workflow-registry.md) for the operating model.

## Channels

- `GET /api/channels` - lists the most recent durable messages across all terminal channels for the read-only handoff view
- `GET /api/channels/:terminalId/messages` - lists messages for one terminal channel
- `POST /api/channels/:terminalId/messages` - sends a message to one terminal channel

## Telegram operator bridge

- `GET /api/telegram/status` - returns the bridge's safe local status, command list, trusted-chat count, and last polling error if any; it never returns bot tokens or chat IDs

When configured, the bridge accepts `/roles`, `/agent <role-id> <message>`, and `/updates [role-id]` only from allowlisted Telegram chats. It routes instructions through the durable permanent-role inbox and serves only agent-authored, bounded operator updates when a trusted human asks. It never sends autonomous agent notifications. See [Telegram Operator Bridge](../guides/telegram-operator-bridge.md).

Channel messages are persisted in `.octogent/state/channel-messages.json` so queued and delivered coordination survives an API restart. `GET /api/channels` is read-only and returns the same redacted records ordered newest first; it cannot send or deliver messages. The POST body provides `fromTerminalId` and `content`; delivery injects pending messages into the target terminal input when the target session is idle. Message content is capped at 4,000 characters and common credentials are redacted before it reaches the channel record or audit log.

## Role inboxes

Role inbox messages are persisted in `.octogent/state/agent-inbox.json` and are keyed by permanent `agentId`, not a temporary terminal ID. An operator can post `{ "content": "..." }`. A managed agent can post `{ "fromTerminalId": "...", "content": "..." }` only with its active private local capability and an explicit permanent-role terminal binding; the server derives the sending role rather than trusting caller text. Octogent delivers a queued role message only to one deterministically selected, exact role-bound terminal at an idle prompt boundary. A role inbox is therefore safe to use before a terminal exists and does not expose the role to an unrelated terminal with the same provider or tentacle.

## Code intel

- `POST /api/code-intel/events` - records one code-intel event
- `GET /api/code-intel/events` - returns the stored code-intel event log

## Hooks

- `POST /api/hooks/:hookName` - ingests lifecycle events coming from Claude Code hooks

Current hook names:

- `session-start`
- `user-prompt-submit`
- `pre-tool-use`
- `notification`
- `stop`

## Usage and telemetry

- `GET /api/codex/usage` - returns Codex usage data when available
- `GET /api/claude/usage` - returns Claude usage data when available
- `GET /api/github/summary` - returns GitHub summary and repo telemetry data
- `GET /api/analytics/usage-heatmap?scope=all|project` - returns heatmap data from Claude session history

## UI state

- `GET /api/ui-state` - reads the persisted UI state for the current project
- `PATCH /api/ui-state` - updates the persisted UI state

## Workspace setup

- `GET /api/setup` - reads the verified first-run setup status for the current workspace
- `POST /api/setup/steps/:stepId` - runs one setup step and returns the refreshed setup snapshot

## Monitor

- `GET /api/monitor/config` - reads monitor configuration
- `PATCH /api/monitor/config` - updates monitor configuration
- `GET /api/monitor/feed` - returns the current monitor feed snapshot
- `POST /api/monitor/refresh` - forces a monitor refresh

## Conversations

- `GET /api/conversations` - lists stored conversations
- `DELETE /api/conversations` - deletes all stored conversations
- `GET /api/conversations/search?q=...` - searches conversations by text
- `GET /api/conversations/:sessionId` - reads one conversation in full
- `GET /api/conversations/:sessionId/export?format=json|md` - exports one conversation as JSON or Markdown

## Request limits and defaults

- JSON request bodies are capped at `1 MiB`
- invalid JSON returns `400`
- unsupported methods return `405`
- the server binds to loopback by default
