# CLI Reference

## Start the dashboard

```bash
octogent
```

Starts the local API for the current project and opens the UI when bundled web assets are present.

If the current directory has not been initialized yet, `octogent` also creates or updates the local `.octogent/` scaffold automatically on first run.

## Initialize a project

```bash
octogent init [project-name]
```

Creates or updates the `.octogent/` scaffold in the current directory without starting the dashboard.

Use this when you want to initialize the project explicitly or set the project display name ahead of time. In normal use, running `octogent` inside the codebase is enough to initialize and start the app.

## List registered projects

```bash
octogent projects
```

## Create a tentacle

```bash
octogent tentacle create <name> --description "API runtime and routes"
```

Octogent must already be running for this command.

## List tentacles

```bash
octogent tentacle list
```

## Spawn a swarm

```bash
octogent tentacle swarm <tentacle-id> --swarm-id business --workspace-mode shared --agent-provider codex
```

Options:

- `--swarm-id`, `--swarm-name`, `--name`: optional namespace for running multiple swarms on the same tentacle
- `--workspace-mode`, `-w`: `shared` or `worktree`
- `--agent-provider`, `--provider`: `claude-code`, `codex`, `gemini-cli`, `perplexity`, `notebooklm`, `lm-studio`, `notion`, `stitch`, `antigravity`, or `custom`

Without `--swarm-id`, Octogent uses the original default swarm IDs such as `<tentacle-id>-swarm-parent`. With `--swarm-id business`, it uses IDs such as `<tentacle-id>-swarm-business-parent`, allowing a separate `research` swarm to run at the same time.

## Create a terminal

```bash
octogent terminal create [options]
```

Options:

- `--name`, `-n`: terminal display name
- `--workspace-mode`, `-w`: `shared` or `worktree`
- `--agent-provider`, `--provider`: `claude-code`, `codex`, `gemini-cli`, `perplexity`, `notebooklm`, `lm-studio`, `notion`, `stitch`, `antigravity`, or `custom`
- `--initial-prompt`, `-p`: raw initial prompt text
- `--terminal-id`: explicit terminal ID
- `--tentacle-id`: existing tentacle ID to attach to
- `--worktree-id`: explicit worktree ID
- `--parent-terminal-id`: parent terminal ID for child terminals
- `--prompt-template`: prompt template name
- `--prompt-variables`: JSON object of prompt template variables

Provider bootstrap commands:

- `claude-code`: runs `claude`
- `codex`: runs `codex`
- `gemini-cli`: runs `gemini`, or `OCTOGENT_GEMINI_COMMAND` when set
- `perplexity`: runs `pplx`, or `OCTOGENT_PERPLEXITY_COMMAND` when set
- `lm-studio`: runs `lms`, or `OCTOGENT_LM_STUDIO_COMMAND` when set, for Qwen/local-model workers
- `notion`: runs `OCTOGENT_NOTION_COMMAND` when set, otherwise prints setup guidance
- `stitch`: runs `OCTOGENT_STITCH_COMMAND` when set, otherwise prints setup guidance
- `antigravity`: runs `antigravity`, or `OCTOGENT_ANTIGRAVITY_COMMAND` when set
- `custom`: runs `OCTOGENT_CUSTOM_AGENT_COMMAND`

If a swarm is named `research`, or the tentacle itself is a research tentacle, and no `--agent-provider` is provided, Octogent routes each research worker by prompt intent: source/current-market questions to Perplexity, curated source-grounded comparison and Q&A to NotebookLM, durable brief/task/memory capture to Notion, Google/SEO/ecosystem questions to Gemini, and synthesis/strategy/recommendation questions to Claude.

## Open a free workflow connector

```bash
octogent connector open claude
octogent connector open notion
octogent connector open antigravity
octogent connector open gemini
octogent connector open codex
octogent connector open stitch
octogent connector open perplexity
octogent connector open lm-studio
```

This is a no-API-key bridge for tools that work best through their logged-in web apps. It opens the configured workflow URL and prints the role Octogent expects that brain to play.

URL overrides:

- `OCTOGENT_NOTION_URL`: Notion memory/project workspace
- `OCTOGENT_ANTIGRAVITY_URL`: Antigravity workspace
- `OCTOGENT_GEMINI_URL`: Gemini workspace
- `OCTOGENT_CODEX_URL`: Codex workspace
- `OCTOGENT_STITCH_URL`: Google Stitch UI/UX workspace
- `OCTOGENT_PERPLEXITY_URL`: Perplexity workspace
- `OCTOGENT_NOTEBOOKLM_URL`: NotebookLM workspace
- `OCTOGENT_LM_STUDIO_URL`: Qwen / LM Studio workspace

No-key research workflow command examples:

```bash
export OCTOGENT_PERPLEXITY_COMMAND="node scripts/perplexity-workflow.mjs"
export OCTOGENT_NOTEBOOKLM_COMMAND="node scripts/notebooklm-workflow.mjs"
export OCTOGENT_NOTION_COMMAND="node scripts/notion-workflow.mjs"
```

## List terminals

```bash
octogent terminal list
```

Shows each terminal ID, lifecycle state, recorded process ID when available, lifecycle reason, and display name.

## Start, stop, or kill a terminal

```bash
octogent terminal start <terminal-id>
octogent terminal stop <terminal-id>
octogent terminal kill <terminal-id>
```

`start` explicitly starts a prepared terminal's local shell. A successful shell start does not prove
that its AI provider is authenticated or responsive. `stop` closes an active session or sends
`SIGTERM` to the recorded process for a stale terminal. `kill` uses `SIGKILL`.

## Prune inactive terminal records

```bash
octogent terminal prune
```

Removes terminal records whose lifecycle state is `stale`, `stopped`, or `exited`. It does not remove active sessions.

## Send a message

```bash
octogent channel send <terminal-id> "message"
```

Inside an Octogent-managed terminal, the CLI uses `OCTOGENT_SESSION_ID` and its private local capability automatically. Outside one, it sends as `operator` for direct human-to-agent messages. Supplying `--from` alone cannot impersonate another terminal.

## List messages

```bash
octogent channel list <terminal-id>
```

## Send a handoff to a permanent role

```bash
octogent agent message <role-id> "message"
```

This is for a live, Octogent-managed agent to hand work to a named permanent role. It requires the
active terminal's private local capability and an explicit permanent-role binding. Human operators
should continue to use the Conversations or Agent Directory role inbox instead.

## Report current agent activity

```bash
octogent agent activity testing "Running the scoped Block Bounce regression checks."
```

## Queue a safe operator update

```bash
octogent agent reply "Focused tests passed; review is ready."
```

This command works only inside a live permanent-role terminal with its private local capability. It queues one local, redacted, 1,000-character update for the operator; it does not send a Telegram message. A trusted Telegram operator retrieves updates with `/updates` or `/updates <role-id>`.

Valid statuses are `planning`, `researching`, `implementing`, `testing`, `reviewing`, and `waiting`.
This command works only inside a live, role-bound terminal. It uses the terminal's private local
capability, redacts common credentials from the summary, and updates the Agent Directory and Project
Swarms with the role's current phase. It cannot report activity for another role.

## Append a role memory update

```bash
octogent agent memory "Verified test passed; the remaining limitation is provider authentication."
```

This command works only inside a live, role-bound Octogent terminal. It uses the terminal's private local capability and writes a redacted, dated append to that role's fixed Obsidian note. It cannot select an arbitrary vault path or overwrite unrelated notes.

## Append shared team memory

```bash
octogent agent memory share "Verified cross-role handoff or decision."
```

This appends a bounded, credential-redacted entry to the fixed `Octogent/Shared/Agent Timeline.md` note in the configured vault. It works only inside a matching live role terminal and does not permit caller-selected Obsidian paths or personal-vault edits.

## Search shared project memory

```bash
octogent agent memory search "ranking playtest"
```

This command works only inside a live, role-bound terminal. It searches the shared project-memory areas of the configured Obsidian vault and returns redacted snippets with relative note paths. It cannot read arbitrary personal-vault files or choose a filesystem path.
