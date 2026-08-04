# Octogent Docs

These docs are written for contributors and future coding agents. They explain how Octogent is put together, where state lives, and how local terminal agents are coordinated.

Octogent has three main layers:

- **agent-facing files** in `.octogent/tentacles/<tentacle-id>/`, which hold context, todos, and handoff notes
- **runtime state** under `~/.octogent/projects/<project-id>/state/`, which tracks terminals, UI state, transcripts, and app metadata
- **live sessions** in the API process, where WebSocket connections are attached to PTY-backed Claude Code terminals

## Start here

- [Project Readiness](reference/project-readiness.md) shows what is verified locally and which external decisions still need the operator
- [Installation](getting-started/installation.md)
- [Quickstart](getting-started/quickstart.md)
- [Mental Model](concepts/mental-model.md) explains the boundaries between tentacles, terminals, worktrees, and runtime state

## Concepts

- [Tentacles](concepts/tentacles.md) explains the file-backed context model and how Deck reads it
- [Runtime and API](concepts/runtime-and-api.md) explains terminal lifecycle, WebSockets, hooks, persistence, and restart behavior

## Guides

- [Working With Todos](guides/working-with-todos.md) explains how checkbox lines become progress and worker inputs
- [Orchestrating Child Agents](guides/orchestrating-child-agents.md) explains parent/worker spawning, shared mode, and worktree mode
- [Inter-Agent Messaging](guides/inter-agent-messaging.md) explains the in-memory channel queue and delivery rules
- [Telegram Operator Bridge](guides/telegram-operator-bridge.md) explains the trusted human-to-role bridge and its local security boundary
- [Obsidian Role Memory](guides/obsidian-role-memory.md) explains the scoped, auditable memory append path available to every permanent role
- [User-Owned GitHub Publication](guides/user-owned-github-publication.md) explains how this customized workspace can be reviewed and published without touching the protected upstream
- [Agent Manifests](guides/agent-manifests.md) explains the Omnigent-inspired provider, scope, and policy contract for each agent
- [Workflow Registry](guides/workflow-registry.md) explains persistent SOPs, autonomy levels, policy-aware runs, approvals, and audit history
- [Operating Model](guides/operating-model.md) defines the Chief, Executor, specialist-review, and evidence standards for coordinated work
- [Managed App Security](guides/managed-app-security.md) defines the security boundary between Octogent and the public app or website

## Reference

- [CLI](reference/cli.md)
- [Filesystem Layout](reference/filesystem-layout.md)
- [API](reference/api.md)
- [Session History Policy](reference/session-history.md) explains the local verified session timeline and how reviewed AI-assisted work is prepared for user-owned GitHub history
- [Experimental Features](reference/experimental-features.md)
- [Troubleshooting](reference/troubleshooting.md)

## Contributor policy

- [Contributing](../CONTRIBUTING.md)
