# Orchestrating Child Agents

Octogent uses child terminals to split work into parallel streams.

## How spawning works

A child agent is a normal terminal record with `parentTerminalId` set. The relationship is stored in the terminal registry and shown in the UI; the child still has its own terminal ID, lifecycle state, transcript, workspace mode, and optional worktree.

Deck creates child agents from todo items by resolving prompt templates. The prompt receives the tentacle name, tentacle ID, path to `.octogent/tentacles/<tentacle-id>/`, todo text, terminal ID, API port, workspace guidance, and parent terminal ID when a parent exists.

Child agents use the provider selected for the swarm. A Codex, Gemini CLI, Perplexity Research, Qwen/LM Studio, Notion, Google Stitch, Antigravity, or custom parent will generate child terminal commands with the same `--agent-provider` value so workers stay on the requested tool family. Research swarms are the exception: if no provider is selected, Octogent routes each research prompt to Claude, Gemini, or Perplexity based on the prompt intent.

## When to use child agents

Use child agents when:

- tasks are independent enough to run in parallel
- the parent can define clean scopes
- each task fits one tentacle or one todo item
- the expected file overlap is low or worktree mode is available

Do not use them when the work is too entangled and the agents will overwrite each other.

## Recommended workflow

1. create or pick a tentacle
2. write or refine `CONTEXT.md`
3. break the work into checkbox items in `todo.md`
4. spawn worker terminals from those items
5. review results in the parent terminal
6. use channel messages when workers need to coordinate
7. update `todo.md` only after reviewing the result

## Shared vs worktree

Use `shared` when:

- the tasks are read-heavy
- the changes are small
- you want fast setup

Use `worktree` when:

- the tasks touch overlapping files
- you want clean git isolation
- you expect larger code edits

In shared mode, workers all run in the main workspace and are told not to commit. This is faster but relies on careful scoping and review.

In worktree mode, each worker gets a branch named `octogent/<worker-terminal-id>` under `.octogent/worktrees/<worker-terminal-id>/` and is told to commit its work. The parent coordinator is responsible for merging branches, running tests, and updating tentacle state.

## Parent coordinator behavior

When a swarm has more than one target item, Octogent creates a parent terminal like `<tentacle-id>-swarm-parent`. Named swarms use a namespaced parent such as `<tentacle-id>-swarm-business-parent`, which lets separate business, research, or coding swarms run against the same tentacle at the same time. The parent prompt contains:

- the list of worker terminal IDs and assigned todo indices
- commands for creating each worker terminal
- communication instructions for `octogent channel send`
- a completion strategy for shared mode or worktree mode
- the final requirement to review, test, and update tentacle docs/todos

The parent is intentionally not a magic scheduler. It is an agent session with explicit instructions and a visible terminal. That makes orchestration inspectable and interruptible.

## Worker limits and identity

Each parent can have up to 9 child terminals. If a swarm has more incomplete todo items than that, Octogent uses todo order as priority order and defers the overflow.

Worker terminal IDs are derived from the tentacle ID, optional swarm namespace, and todo index. Duplicate detection is scoped to the namespace: Octogent refuses to start a second `business` swarm for the same tentacle, while allowing a separate `research` swarm to run beside it.

## Limits

- PTY sessions do not survive API restarts
- channel messages persist across API restarts, but important decisions still belong in tentacle files
- delegation quality depends on the quality of `CONTEXT.md` and `todo.md`
- shared-mode workers can still collide in files, because shared mode is not git isolation
- worktree-mode workers still need a human or parent merge step before their work reaches the base branch
