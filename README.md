<div align="center">

<img width="1500" height="500" alt="Octogent header" src="./static/images/octogent-header.png" />
<br/>
<br/>

<strong>local orchestration for a real project, with evidence before automation</strong>
<br />
<br />

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22+-5FA04E?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Local-first](https://img.shields.io/badge/Runtime-local--first-202938?style=flat-square)](#this-projects-operating-profile)
[![Publish policy](https://img.shields.io/badge/Publishing-human--approved-B78B2E?style=flat-square)](docs/guides/user-owned-github-publication.md)

</div>

# Octogent Business OS

This customized local workspace uses Octogent as the management layer around Block Bounce and future project swarms. It keeps scoped contexts, role responsibilities, workflows, approvals, audit history, shared memory, and safe handoffs in one local system. It does not claim that a named model is connected until a matching local terminal proves it, and it does not publish work until the operator reviews a user-owned destination.

## This Project's Operating Profile

This local Octogent project is an **Agentic OS management harness** for Block Bounce, a web-first game, and future independent project swarms. It is not the game itself. It gives the operator one place to see project lanes, permanent agent roles, live terminal activity, workflows, messages, memory, policy checks, and recorded outcomes.

The current operating team includes strategy, execution, debugging, research, marketing, player feedback, automation, finance, market analysis, records, and UI/UX roles. Each role explains its purpose and when it should be launched. Runtime status remains evidence-based: a role is not shown as working until a matching terminal exists and reports activity.

Block Bounce is the first verified local workflow: a scoped Codex worker can claim the Game QA run only when policy and terminal scope match, then run two fixed regression suites and store the redacted outcome. It cannot execute arbitrary commands or external actions. Other swarms can use the same structure without sharing their context or worktrees.

## Upstream Attribution

This workspace is a local customization of [hesamsheikh/octogent](https://github.com/hesamsheikh/octogent). The original upstream remains protected and is not a publishing target for this project. Before this customized system is published, create a user-owned repository and follow the [safe publication checklist](docs/guides/user-owned-github-publication.md).

## The Vision

This repo is a personal exploration of what an AI coding environment might look like when terminal coding agents are treated as parts of a bigger orchestration layer, not the final interface by themselves. The point is not to hide **Claude Code** behind abstractions. The point is to make *multi-agent work less chaotic for the developer* on a real codebase.

## Screenshots

<div align="center">
<table>
<tr>
<td><img src="./static/images/preview_1.jpg" alt="Screenshot 1" width="100%"/></td>
<td><img src="./static/images/preview_2.jpg" alt="Screenshot 2" width="100%"/></td>
</tr>
<tr>
<td><img src="./static/images/preview_3.jpg" alt="Screenshot 3" width="100%"/></td>
<td><img src="./static/images/preview_4.jpg" alt="Screenshot 4" width="100%"/></td>
</tr>
<tr>
<td><img src="./static/images/preview_5.jpg" alt="Screenshot 5" width="100%"/></td>
<td><img src="./static/images/preview_6.jpg" alt="Screenshot 6" width="100%"/></td>
</tr>
</table>
</div>

## What Octogent Does for You

- **Creates tentacles as context layers** so agents can work with scoped markdown files instead of broad, messy chat context
- **Uses `todo.md` as an execution surface** so tasks stay visible, trackable, and ready for delegation
- **Runs multiple Claude Code terminals** so one developer can coordinate several coding sessions at once
- **Spawns child agents from todo items** so parallel work has a concrete source of truth
- **Supports inter-agent messaging** so workers and coordinators can report completion, blockers, and handoff notes
- **Defines agent manifests** so providers, roles, scopes, auth mode, memory behavior, and policies are inspectable before launch
- **Keeps agent-facing context in files** so the system is more durable than a single prompt thread
- **Provides a local API and UI** for terminal lifecycle, persistence, websocket transport, and orchestration
- **Shows permanent agent roles separately from temporary workers** so the dashboard stays readable as one-off tasks finish
- **Uses shared project memory and the configured Obsidian vault** for verified decisions, handoffs, and session history

A **tentacle** is a folder under `.octogent/tentacles/<tentacle-id>/` that holds agent-readable markdown such as `CONTEXT.md`, `todo.md`, and any extra notes needed for that slice of the codebase.

The octopus metaphor is literal: *one octopus, many tentacles, different work happening at the same time*.

## Tentacles

A **tentacle** is a scoped job container. It gives one slice of work its own files, notes, and `todo.md` so the agent is not forced to reconstruct the entire codebase context from chat history.

What it does:

- keeps context local to one area such as documentation, database work, API changes, or frontend work
- gives agents durable files they can read and update
- provides a natural source for delegation through todo items

For the full model, see [Tentacles](docs/concepts/tentacles.md) and [Working With Todos](docs/guides/working-with-todos.md).

## Context, Notes, and Task Lists

In Octogent, a tentacle is not only a task bucket. It is also where the job keeps its local context. That can include notes about one part of the codebase, implementation details, handoff files, and a `todo.md` that tracks what still needs to happen. A Claude Code agent can read and update those files as the work moves forward.

That means you can:

- keep documentation, database, API, or frontend work separated into different job contexts
- store the notes that help an agent understand that part of the codebase
- spawn one agent for one specific item
- break a larger job into multiple items
- launch a swarm so several agents work through the list in parallel
- use the files inside the tentacle as the shared source of truth for what is done and what is left

For the full model, see [Tentacles](docs/concepts/tentacles.md) and [Working With Todos](docs/guides/working-with-todos.md).

## Claude Code Managing Claude Code

One of the main ideas here is that **Claude Code** should not only be treated as a single terminal session waiting for a human prompt. In Octogent, one Claude Code agent can coordinate other Claude Code agents, assign them specific jobs, and exchange short messages with them while the human stays at the orchestration layer.

This is different from Claude Code's subagent spawning, since it allows you to directly see and control what each worker agent is doing.

That means Octogent is not just a dashboard for multiple terminals. It is also a way to structure parent-worker behavior around scoped tasks and shared context files.

For the current model, see [Orchestrating Child Agents](docs/guides/orchestrating-child-agents.md) and [Inter-Agent Messaging](docs/guides/inter-agent-messaging.md).

## How It Works

Octogent separates three concerns that usually get mixed together in a pile of terminals:

1. **Context** lives in `.octogent/tentacles/<tentacle-id>/`. `CONTEXT.md` explains the area, `todo.md` supplies executable work items, and extra markdown files hold notes or handoffs.
2. **Execution** lives in terminal records and PTY sessions managed by the local API. A terminal can attach to an existing tentacle, and several terminals can share one tentacle during swarm work.
3. **Isolation** is optional. Shared terminals run in the main workspace; worktree terminals run under `.octogent/worktrees/<worktree-id>/` on `octogent/<worktree-id>` branches.

Deck reads the tentacle files directly, parses checkbox items from `todo.md`, and uses incomplete items to generate worker prompts. Claude hooks feed the API with agent state, transcript, and idle events so the UI can show more than raw terminal output.

## Quick start

<details>
<summary><strong>Local development</strong></summary>

```bash
pnpm install
pnpm dev
```

This starts the API and web app for local development.

</details>

<details open>
<summary><strong>Current install status</strong></summary>

```bash
Octogent is not published to the npm registry yet.
```

For local development:

```bash
pnpm install
pnpm dev
```

For a local global CLI install from a clone:

```bash
pnpm install
pnpm build
npm install -g .
octogent
```

The registry install flow `npm install -g octogent` will only work after the package is published.

</details>

On first run, **Octogent** creates the local `.octogent/` scaffold automatically, assigns a stable project ID, picks an available local API port starting at `8787`, and opens the UI unless `OCTOGENT_NO_OPEN=1` is set.

## Requirements

- Node.js `22+`
- at least one supported agent CLI or workflow command: `claude`, `codex`, `gemini`, `pplx`, `lms`, `antigravity`, or an `OCTOGENT_*_COMMAND` override
- `git` for worktree terminals
- `gh` for GitHub pull request features
- `curl` for the current Claude hook callback flow

Claude Code remains the default provider, but terminals can also use Codex, Gemini CLI, Perplexity Research, Qwen/LM Studio, Notion, Google Stitch, Antigravity, or a custom command provider. Research swarms route each prompt to Claude, Gemini, or Perplexity when no provider is explicitly selected. Set `OCTOGENT_GEMINI_COMMAND`, `OCTOGENT_PERPLEXITY_COMMAND`, `OCTOGENT_LM_STUDIO_COMMAND`, `OCTOGENT_NOTION_COMMAND`, `OCTOGENT_STITCH_COMMAND`, `OCTOGENT_ANTIGRAVITY_COMMAND`, or `OCTOGENT_CUSTOM_AGENT_COMMAND` when your local command differs from the defaults.

## What persists

- `.octogent/` keeps project-local scaffold and worktrees
- `~/.octogent/projects/<project-id>/state/` keeps runtime state, transcripts, monitor cache, and metadata
- `.octogent/tentacles/<tentacle-id>/` keeps the context files and todos that agents read

PTY sessions survive browser reloads during the idle grace period, but they do **not** survive an API restart. Octogent marks previously running terminal records as `stale` on startup when it cannot reattach them to a live PTY session; use `octogent terminal list`, `stop`, `kill`, and `prune` to inspect and clean them up. Octogent caps live PTY sessions at 32 by default to protect the host; set `OCTOGENT_MAX_TERMINAL_SESSIONS` to a positive integer to tune that limit for larger orchestration runs.

## Docs

- [Docs Home](docs/index.md)
- [Installation](docs/getting-started/installation.md)
- [Quickstart](docs/getting-started/quickstart.md)
- [Mental Model](docs/concepts/mental-model.md)
- [Tentacles](docs/concepts/tentacles.md)
- [Runtime and API](docs/concepts/runtime-and-api.md)
- [Working With Todos](docs/guides/working-with-todos.md)
- [Orchestrating Child Agents](docs/guides/orchestrating-child-agents.md)
- [Inter-Agent Messaging](docs/guides/inter-agent-messaging.md)
- [Agent Manifests](docs/guides/agent-manifests.md)
- [CLI Reference](docs/reference/cli.md)
- [Filesystem Layout](docs/reference/filesystem-layout.md)
- [API Reference](docs/reference/api.md)
- [Experimental Features](docs/reference/experimental-features.md)
- [Troubleshooting](docs/reference/troubleshooting.md)
- [Contributing](CONTRIBUTING.md)

## Contributor setup
Octogent is not actively reviewing pull requests right now. If you still open one and any code was written with AI, disclose which coding agent and model were used. For contributor workflow and expectations, see [CONTRIBUTING.md](CONTRIBUTING.md).
