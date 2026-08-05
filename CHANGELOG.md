# Changelog

This log records verified Octogent changes before they are committed and published to a user-owned GitHub repository. It is not a substitute for Git history; it gives the operator a readable session-level record.

## Unreleased

### Added

- Terminal deletion and reviewed stale-terminal pruning now automatically remove only queued handoffs that have become undeliverable. Delivered handoffs remain durable history, and each cleanup writes the existing local audit event.
- Agent Directory now includes **Clean up ended agents**, a reviewed bulk release for stale, stopped, or exited temporary terminal records. It does not remove permanent roles, role inboxes, shared memory, or audit history.
- Project Swarms now protects the default Game Business and Research lanes while allowing an operator to remove a finished custom swarm through an explicit confirmation. A custom lane cannot be removed while one of its assigned roles is prepared, ready, waiting, or working. Removing an eligible lane preserves permanent roles, terminal records, inboxes, shared memory, and audit history.
- Agent Directory and Project Swarms now show the timestamp of a live role's last capability-checked activity report, so an operator can distinguish a recent report from an older status summary.
- Every Project Swarm card now summarizes its active goals, active workflows, open workflow runs, and blocked goals from the existing durable Goal and Workflow registries. Explicit role ownership takes priority; older unassigned goals are safely matched through an assigned role's permanent tentacle so existing work remains visible.
- Every Project Swarm card now lists up to three current goals, placing blocked work before review and active work. This gives the operator the goal titles behind the operational counts without adding a new workflow or execution control.
- Project initialization now migrates every missing durable local state record into its normalized project directory, including goals, workflows, memory, role messages, audit records, activity, and transcripts. Existing normalized records are never overwritten during migration.
- Goal Command Center now lets the operator assign or reassign an existing goal to a permanent role. The API validates the role, updates the goal's matching tentacle, writes a safe owner-assignment audit event, and never launches the role.
- Project Swarm cards now name the permanent role responsible for each displayed current goal, so the dashboard shows both the work and its accountable agent in one view.

### Verification

- Latest handoff-lifecycle regression passed: API 239/239 tests and API TypeScript, plus full Biome and `git diff --check`.
- Latest swarm-operations audit passed: core 6/6, API 237/237, and web 128/128 tests. Core/API/web TypeScript checks, the web production build, full Biome, and `git diff --check` passed.

## 2026-08-05 - Public Repository Baseline

### Published

- Published the verified Octogent Business OS baseline to the user-owned public repository: `https://github.com/jamesjko210-cmd/octogent-business-os`.
- Initial published commit: `d22601c204e604b94deeffc0fb4acd17e0cfae41` (`feat: establish Octogent Business OS harness`).
- Confirmed GitHub visibility is `PUBLIC` and the default branch is `main`.

### Verification

- Before publication: core 6/6, API 229/229, and web 118/118 tests passed; all TypeScript checks, web production build, full Biome check, and `git diff --check` passed.
- Publication verification confirmed the repository URL, `main` default branch, and the exact commit SHA through GitHub CLI.

### Added

- Safe API query audit metadata. The request audit now retains only bounded, allowlisted routing values and redacts all other query values, preventing prompt, session, credential, or arbitrary user content from entering the durable audit trail.
- Explicit Codex provider-response verification. Settings now offers a manual, rate-limited isolated check after local Codex sign-in is verified. It runs a fixed one-line prompt in a fresh temporary directory with read-only sandboxing, no project or user rules, no tool request, and no stored response text. The API requires a fixed confirmation value and records only safe requested/completed audit metadata.
- Local Codex sign-in evidence. The Systems brain map now distinguishes a discovered command from a locally authenticated Codex CLI session using `codex login status`; it does not make a model request or claim that a provider response succeeded.
- Agent Directory API and Systems dashboard cards for 13 permanent operating roles, including a plain-language purpose, launch reason, scoped provider/tentacle, and real terminal-derived status.
- Durable, scoped agent activity reporting. A live matching terminal can report `planning`, `researching`, `implementing`, `testing`, `reviewing`, or `waiting`; unrelated or stopped terminals are rejected.
- First constrained execution adapter: only a claimed Codex Game QA workflow can run the two fixed local Block Bounce Node test files. It cannot accept arbitrary commands, paths, arguments, shell text, or network targets.
- Workflow dashboard action for the claimed Game QA run: **Run allowlisted checks** records a safe local outcome after the worker claim.
- Workflow dashboard action for a queued run: **Claim only eligible worker** selects a terminal only when exactly one live, manifest-matched, idle worker exists; it refuses ambiguous or unavailable assignments.
- Prepared role lifecycle. A registered permanent-role terminal now reports `prepared` until the operator explicitly starts its local shell; a running shell becomes `ready` while provider connection remains unverified. Duplicate role preparation is rejected.
- Provider connection evidence. Each permanent role now separately shows whether its provider is not started or has only an unverified local shell, preventing model preference labels from being mistaken for a connected provider.
- CLI lifecycle parity. `octogent terminal start <id>` deliberately starts a prepared terminal from the command line using the same guarded local action as the dashboard.
- The Persistent Second Brain skill now gives scoped agents the shared Obsidian vault rule; Record Center consolidates overlapping durable notes.
- Durable agent channels now redact common credentials before persistence, audit logging, or terminal delivery, and reject messages over 4,000 characters.
- Permanent role inboxes in the Agent Directory. Operators can queue a message for a named role before its model terminal starts; delivery requires an explicit role-to-terminal binding and keeps the message local, durable, and redacted.
- Role terminal registration. Creating a role terminal records its exact role, provider, and tentacle without launching a model; generic or wrong-scope terminals cannot impersonate a role for activity or inbox delivery.
- Authenticated agent-to-agent channel senders. Managed terminal shells receive a private local capability, and the API rejects a claimed agent sender without the matching active capability. Operator messages remain capability-free.
- Project Swarms dashboard layer. The Systems view now separates the initial Game Business and Research workstreams, explains each purpose, and shows live aggregate role counts from the Agent Directory.
- Live swarm-activity previews. Each workstream card now shows up to three real working, waiting, or ready roles and their current activity summaries, ordered by attention level.
- Default orchestration protocol: GPT-5.6 Sol is the Chief preference, GPT Terra is the Executor preference, and targeted research, security, UX, testing, and memory roles provide independent evidence when needed.
- Full permanent-role policy coverage. All 13 Agent Directory roles now have matching manifests with provider, tentacle, tool, path, memory, and approval boundaries; obsolete placeholder manifest identities were removed.
- Manifest-enforced role registration. The Agent Directory requests each role's approved workspace mode, while the API independently rejects provider, tentacle, or workspace mismatches.
- Finished-worker cleanup. Ready role terminals can now be released from the Agent Directory through an explicit destructive confirmation without removing the permanent role or durable project records.
- Local release and session-history documentation for future GitHub updates.
- GitHub publishing-readiness guardrail. The Activity view now reports whether the configured remote is eligible for a future human-approved publish and blocks the original upstream repository by default. The same guardrail refuses remote Git actions, including push, sync, pull-request creation, and merge, until a user-owned remote is explicitly approved. It redacts credential-like remote URL fragments.
- Goal Command Center in Settings. Operators can create durable goals, choose a permanent role owner, set success criteria and constraints, track status, and record completion evidence. Ownership is validated against the permanent roster and completion cannot be recorded without evidence.
- Exact role workflow handoffs. Workflow creation validates a permanent manifest-backed owner and tentacle; workflow claims and the local executor require the exact role-bound terminal. Goal-linked runs are durable, policy-checked, visible in Goal Command Center, and limited to one unfinished run per goal. Role prompts now receive only goals owned by that role.
- Role-first Conversations. The Conversations view now lists every permanent role, including unlaunched roles, and sends through each role's durable inbox. Bound-terminal delivery remains visible without treating a terminal as the role itself.
- Cross-agent handoff feed. Conversations now includes a read-only recent-handoffs panel backed by `GET /api/channels`, so the operator can see durable agent-to-agent coordination without gaining a new execution or delivery control.
- Permanent-role agent handoffs. A live role-bound terminal can now queue a capability-checked handoff for another named role with `octogent agent message <role> <message>`. The durable inbox records the derived sending role and preserves idle-only delivery across temporary terminal replacement.
- Shared Memory Center. Settings now exposes a read-only local search view for durable decisions, research, and handoffs. The memory store now redacts common credentials on write and scrubs valid legacy entries before returning or retaining them.
- Inactive-role cleanup. Agent Directory now exposes a reviewed release action for stopped or stale role terminals before offering a replacement, preventing invisible historical records from blocking the next scoped launch.
- Telegram operator bridge. A dedicated local long-polling bridge accepts `/roles` and `/agent <role-id> <message>` from explicitly allowlisted chats, then routes messages only through the durable permanent-role inbox. It stores no bot token or chat ID in dashboard responses, role records, or audit payloads, and it never exposes terminal capabilities or transcripts to Telegram.
- Verified session history. Settings now shows a read-only timeline derived from the append-only audit, including role or terminal, scoped provider/tentacle, lifecycle outcome, and safe evidence count. It excludes prompts, message bodies, terminal capabilities, process IDs, tool output, and credentials.
- Shared Obsidian retrieval. A live role can use `octogent agent memory search <query>` to retrieve redacted snippets only from project-managed vault areas. The role cannot choose a vault path, read unrelated personal notes, or write outside its own fixed role note.
- Capability-bound activity reporting. Live roles can use `octogent agent activity <status> <summary>` to keep Agent Directory and Project Swarms current. The API rejects spoofed updates and redacts common credentials in status text.
- On-demand Telegram operator updates. A matching live role can use `octogent agent reply <message>` to queue a bounded, credential-redacted local report. A trusted Telegram chat retrieves those reports only with `/updates` or `/updates <role-id>`; agents cannot choose recipients or send autonomous Telegram messages.
- Local agent-report review. Settings now shows the most recent safe reports from the same durable queue used by Telegram `/updates`, so desktop and mobile operator views share one read-only source of truth.
- Shared Obsidian team timeline. Any matching live permanent role can append a credential-redacted, attributed project handoff or decision through `octogent agent memory share <message>`; the fixed shared path prevents arbitrary personal-vault editing.
- Local publication preparation. The README now identifies this workspace as the customized Octogent Business OS and preserves upstream attribution. A user-owned GitHub publication checklist documents the required review, remote approval, evidence, and security boundary before any future Git operation.
- Dashboard workspace code splitting. Primary Agentic OS views now load only when selected, with a local accessible loading state. The production entry bundle dropped from 587 kB to 292 kB; workspace views are emitted as separate chunks.
- Honest provider readiness labels. Systems now calls a detected CLI or workflow wrapper **Available locally**, not connected, and explicitly states that login and provider response remain unverified.
- Operator-managed project swarms. Systems can now persist an additional named project lane with a purpose and selected permanent roles, without launching any terminal or changing provider access.

### Security and Integrity

- Activity records are stored locally with concise bounded summaries and require a live terminal whose provider and tentacle match the permanent role.
- Role inbox delivery requires the same explicit permanent-role binding; a shared provider or tentacle is not enough.
- Role inbox delivery waits for an exact bound terminal's idle prompt boundary. It never injects an operator message while the agent is processing or waiting for permission.
- Channel capability values never appear in snapshots, browser responses, or audit-list output. Rejected sender attempts record routing metadata only, not message content.
- The management API remains loopback-only. `OCTOGENT_ALLOW_REMOTE_ACCESS` cannot expose the unauthenticated local control plane.
- Model labels are documented as preferences only. The dashboard does not claim that a provider or model is running until a matching terminal exists.
- Prepared role terminals cannot report activity or claim a workflow. They must be explicitly started into a live local shell first; that shell is not treated as proof that the external provider authenticated or responded.
- Telegram is a human-to-role bridge, not an agent transport. External messages stay bounded and credential-redacted, while agent-to-agent coordination remains inside Octogent's capability-checked local channels.
- Agent replies require the exact live role terminal's private capability. Audit records retain only role, update ID, and content length; neither the report body nor Telegram chat IDs enter the audit trail.

### Verification

- Full regression passed: core 6, API 204, and web 112 tests. `pnpm build`, `pnpm --filter @octogent/api build`, `pnpm exec biome check .`, and `git diff --check` also passed.
- Latest Telegram bridge audit passed: core 6, API 215, and web 116 tests. Core/API/web TypeScript checks, full Biome, and `git diff --check` passed. The web production build passed with the existing non-blocking large-chunk warning.
- Scoped Obsidian role memory. Live permanent roles can append a bounded, credential-redacted update only to their own fixed Obsidian note through a private local capability. The API accepts no caller-controlled vault path and audit records expose only safe metadata. Latest local audit passed: core 6, API 219, and web 116 tests, plus TypeScript, Biome, whitespace, and production-build checks.
- Latest verified-session-history audit passed: core 6, API 222, and web 117 tests. Core/API/web TypeScript, full Biome, and `git diff --check` passed. The production build passed with the existing non-blocking large-chunk warning.
- Latest shared-Obsidian retrieval audit passed: core 6, API 223, and web 117 tests. Core/API/web TypeScript and the production build passed; the existing large-chunk warning remains non-blocking.
- Latest activity-reporting audit passed: core 6, API 224, and web 117 tests. Core/API/web TypeScript and the production build passed; the existing large-chunk warning remains non-blocking.
- Latest Telegram reply-queue audit passed: API 226 tests and API TypeScript passed. Full core, web, Biome, whitespace, and production-build verification is recorded with the implementation checkpoint.
- Latest local-report-dashboard audit passed: core 6, API 226, and web 118 tests. Core/API/web TypeScript, full Biome, `git diff --check`, and the production build passed; the existing large-chunk warning remains non-blocking.
- Latest shared-memory-timeline audit passed: core 6, API 227, and web 118 tests. Core/API/web TypeScript, full Biome, `git diff --check`, and the production build passed; the existing large-chunk warning remains non-blocking.
- The real local Game QA workflow completed: queue, safe single-worker claim, game-engine check, ranking check, recorded success, and temporary-worker cleanup.
- `pnpm lint`, `pnpm build`, and `git diff --check` passed for the implementation checkpoint.
