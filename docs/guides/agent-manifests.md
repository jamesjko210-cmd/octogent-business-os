# Agent Manifests

Agent manifests are Octogent's first native version of the useful Omnigent idea: define an agent as a portable runtime contract instead of a loose prompt.

They do not replace tentacles, terminals, or channel messages. They describe how an agent is allowed to operate inside those systems.

## What a manifest owns

An agent manifest records:

- the stable agent ID and display name
- the role, such as coordinator, executor, researcher, designer, operator, or memory
- the provider and harness, such as Codex, Claude Code, Gemini CLI, Perplexity, Notion, Stitch, or LM Studio
- the auth mode, with API-key access disabled by default
- the workspace scope, tentacle IDs, paths, and tools the agent may use
- session, agent, and server policies
- subagent slots for future delegation
- memory read/write behavior and tags

This makes agent setup inspectable before a terminal is launched.

## Why this matters

Previously, Octogent had strong product concepts but the provider role was mostly attached at launch time. Manifests give the Agent OS a stable middle layer:

- UI can show what each agent is supposed to do.
- Runtime can evaluate whether a requested action fits that agent.
- Future launchers can build terminal commands from the same source of truth.
- Research, design, execution, and memory agents can stay separate without depending only on prompt discipline.

## Policy model

Manifest policies use the same decision language as runtime policies:

- `allow`
- `requires_approval`
- `deny`

Policies are scoped as:

- `session`: current operator/session preference
- `agent`: the agent's own contract
- `server`: global Octogent rule

When multiple policies match, the strongest decision wins. A deny beats an approval requirement, and an approval requirement beats allow.

## Initial native team

Octogent currently exposes these starter manifests:

- `codex-executor`: scoped coding, tests, debugging, and repository changes
- `claude-strategist`: planning, review, decomposition, and coordination
- `gemini-research-google`: Google-family research and multimodal synthesis
- `perplexity-live-research`: current cited web research
- `notion-record-center`: durable decision/task/research capture
- `stitch-ui-production`: UI/UX concepts and prototype handoff

All starter manifests keep `apiKeyAllowed: false`.

## API

List manifests:

```bash
curl http://127.0.0.1:8787/api/agent-manifests
```

Evaluate an action against one manifest:

```bash
curl -X POST http://127.0.0.1:8787/api/agent-manifests/evaluate \
  -H "Content-Type: application/json" \
  -d '{"agentId":"codex-executor","actionType":"prompt","content":"use this API key"}'
```

## Next steps

The next implementation steps are:

- surface manifests in the Settings or Conversations UI
- attach a manifest ID to new terminal records
- enforce manifest scope during terminal launch and channel actions
- let tentacles optionally define preferred manifests for their swarms
- persist custom manifests under `.octogent/agents/`
