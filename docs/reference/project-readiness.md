# Project Readiness

This page is the honest operating-status record for the local Octogent project. It separates
working local features from choices that require the operator before they can be real.

## Current readiness

| Requirement | Status | Evidence or next requirement |
| --- | --- | --- |
| Live project swarms | Ready locally | `GET /api/swarms` and Project Swarms dashboard show Game Business and Research. |
| Named agent roles | Ready locally | Agent Directory has 13 permanent roles with plain-language purpose and launch reason. |
| Working / waiting / ready state | Ready locally | State is derived from exact role-bound terminal runtime state. |
| Current role activity | Ready locally | Live matching terminals report bounded, redacted activity through a private local capability; prepared or spoofed roles are rejected. |
| Agentic OS dashboard | Ready locally | Agents, Deck, Activity, Code Intel, Monitor, Conversations, Prompts, Settings, and Workflows are available. |
| Operator-to-agent messages | Ready locally | Conversations and Agent Directory queue messages into durable role inboxes. |
| Agent-to-agent messages | Ready locally | Managed terminals use capability-checked terminal channels and can hand off to a durable permanent-role inbox; Conversations shows the read-only cross-agent feed. |
| Shared project memory | Ready locally | Agentmemory, Record Center, and the configured Obsidian vault are the shared memory path; Settings provides a read-only Shared Memory Center. |
| Multiple project swarms | Ready locally | The swarm registry separates workstreams, and Systems can create a local named lane from existing permanent roles without launching agents. |
| Beginner-friendly role descriptions | Ready locally | Every permanent role includes purpose, launch reason, scope, memory rule, and provider evidence. |
| Temporary-agent cleanup | Ready locally | Prepared, idle, and inactive role terminals can be explicitly released; permanent roles and records remain. |
| GitHub history | Ready and publishing | The customized project is public at `https://github.com/jamesjko210-cmd/octogent-business-os` on `main`. Each verified checkpoint is committed and pushed after review; the [publication guide](../guides/user-owned-github-publication.md) documents the boundary for changing remotes or release scope. |
| Verified local session history | Ready locally | Settings projects append-only audit events into a safe, read-only timeline before any GitHub remote is configured. |
| Obsidian vault memory | Ready locally | Live permanent roles can retrieve redacted project-memory snippets, append bounded updates to their own fixed note, and contribute to one fixed shared team timeline through audited local capabilities. |
| Telegram bridge | Ready to configure | A local long-polling bridge accepts only allowlisted chats, feeds the durable role inbox, and returns concise role updates only after a trusted human requests `/updates`. It remains inactive until a private bot token and trusted chat IDs are supplied outside the repository. |
| External AI-provider integration | Not selected | The dashboard distinguishes a locally available launcher, prepared terminal, shell-started terminal, and provider-unverified state. Each real provider still needs its own reviewed login and response check. |

## Meaning of status labels

- **Ready locally:** implemented and verified inside this Mac's local Octogent runtime. It does not mean an external provider, public website, or remote service is connected.
- **Waiting for operator input:** the next step would change external state or ownership and must not be guessed.
- **Not selected:** more than one safe implementation route exists, so Octogent keeps the local contract ready without choosing a provider or storing credentials.
- **Available locally:** Octogent found a local CLI or configured workflow wrapper. It is not proof of login, provider responsiveness, or a launched model.

## Safe next decisions

1. Create a dedicated Telegram bot and configure its token plus trusted chat IDs outside the repository if mobile operator access is wanted.
2. Choose one provider integration to pilot, with no API keys stored in Octogent by default.
3. Continue committing only focused, verified changes to the public repository; do not treat a push as an approval for external provider or data actions.

## Verification baseline

The current local regression baseline is 6 core tests, 236 API tests, and 125 web tests. Core, API, and web TypeScript checks plus a full Biome check and `git diff --check` passed. The web production build passed.
