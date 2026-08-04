# Operating Model

Octogent uses a role-based operating model to keep agent work inspectable and reduce unsupported claims.

## Core Roles

| Role | Preferred model label | Responsibility |
| --- | --- | --- |
| Chief | GPT-5.6 Sol | Frames the goal, chooses a small safe plan, delegates reviews, and integrates evidence into a decision. |
| Executor | GPT Terra | Implements one scoped change, runs the direct checks, and records factual results. |
| Research specialist | Best source-grounded available tool | Finds current evidence and separates sources from conclusions. |
| Security specialist | Policy and security review | Reviews access, data, external side effects, and destructive-action boundaries. |
| UX specialist | Stitch or a suitable design workflow | Tests whether an operator or player flow is understandable before implementation is treated as finished. |
| Record Center | Notion and project memory | Captures verified decisions, test results, and durable handoffs. |

The preferred model labels are routing preferences. They are not provider credentials or evidence that a named model is currently launched. The Agent Directory shows actual runtime status from matching terminals; it must show `Not launched` until that terminal exists.

The Systems brain map uses **Available locally** only when Octogent can find a local CLI or configured workflow wrapper. That does not prove the account is logged in, the provider accepted a request, or a model is currently running. Treat provider authentication and response evidence as separate, operator-reviewed facts.

## Shared Memory

Every live permanent role can search the shared project-memory areas of the Obsidian vault with `octogent agent memory search "query"`. A matching live role can make a focused, audited append to its own fixed note with `octogent agent memory "concise update"`. Agents cannot choose arbitrary note paths, read unrelated personal-vault files, or overwrite unrelated material, secrets, credentials, or raw personal data. The Record Center consolidates overlapping updates so the vault remains readable and durable.

## Live Activity

A launched agent reports its current phase with `octogent agent activity <status> "concise summary"`. Each update uses one of: `planning`, `researching`, `implementing`, `testing`, `reviewing`, or `waiting`. The dashboard accepts the report only when the role-bound terminal matches the role's provider and tentacle scope and proves its private local capability. This prevents a stale, unrelated, or spoofed session from claiming work on behalf of another role.

Reports are concise project-state updates, not logs. They must not include credentials, raw user data, or large tool output.

## Standard Task Cycle

1. The Chief defines the outcome, constraints, owner, and acceptance checks.
2. Independent specialists review only the parts relevant to the task.
3. The Executor makes the scoped change and runs the direct tests.
4. The Chief compares the result with the acceptance checks and records open risks.
5. Record Center stores concise, verified learning for future work.

For work with external effects, money, personal data, publishing, deployment, or destructive changes, Octogent's approval rules still override this operating model.
