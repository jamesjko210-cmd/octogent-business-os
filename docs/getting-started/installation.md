# Installation

Octogent is a local Node.js project with a local API and web UI.

## Requirements

- Node.js `22+`
- at least one supported agent CLI or workflow command: `claude`, `codex`, `gemini`, `pplx`, `lms`, `antigravity`, or an `OCTOGENT_*_COMMAND` override
- `git` for worktree terminals
- `gh` for GitHub pull request features
- `curl` for the current Claude hook callback flow

Claude Code remains the default provider. Codex, Gemini CLI, Perplexity Research, NotebookLM, Qwen/LM Studio, Notion, Google Stitch, Antigravity, and a custom command provider can also be selected for terminals when their command-line tools or wrapper commands are available. Research swarms route each prompt to Claude, Gemini, Perplexity, NotebookLM, or Notion when no provider is explicitly selected. Use `OCTOGENT_NOTEBOOKLM_COMMAND`, `OCTOGENT_NOTION_COMMAND`, `OCTOGENT_STITCH_COMMAND`, and `OCTOGENT_LM_STUDIO_COMMAND` to connect local workflow launchers for those external tools.

When Systems says a brain is **Available locally**, it has found only the command or wrapper. It does not confirm an account login, a usable subscription, provider authentication, or a successful model response.

Octogent is no-API-key by default. Use logged-in apps, local CLI subscriptions, browser workflows, connectors, or LM Studio instead of API-key billing workflows unless the operator explicitly overrides this policy for one exact task.

For no-key research triad launchers, set:

```bash
export OCTOGENT_PERPLEXITY_COMMAND="node scripts/perplexity-workflow.mjs"
export OCTOGENT_NOTEBOOKLM_COMMAND="node scripts/notebooklm-workflow.mjs"
export OCTOGENT_NOTION_COMMAND="node scripts/notion-workflow.mjs"
```

## Local development install

```bash
pnpm install
pnpm dev
```

## Local global CLI install from a clone

```bash
pnpm install
pnpm build
npm install -g .
```

## npm registry install

Octogent is not published to the npm registry yet, so `npm install -g octogent` will fail with `404`.

## First run behavior

Running `octogent` inside a project directory will:

- create `.octogent/` if it does not exist
- add `.octogent` to `.gitignore` or create `.gitignore` when it is missing
- write a stable project ID to `.octogent/project.json`
- register the project under `~/.octogent/projects.json`
- move runtime state to `~/.octogent/projects/<project-id>/state/`
- choose an open local API port starting at `8787`
- open the browser unless `OCTOGENT_NO_OPEN=1`
- show a Deck setup card until the first tentacle is created

## Startup rules

- startup fails if none of `claude`, `codex`, `gemini`, `pplx`, `lms`, `antigravity`, or an `OCTOGENT_*_COMMAND` override are available
- startup warns when optional integrations like `git`, `gh`, or `curl` are missing
- startup warns for missing optional agent providers while leaving installed providers usable

## Next step

- [Quickstart](quickstart.md)
