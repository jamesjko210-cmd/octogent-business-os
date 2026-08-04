# Obsidian Role Memory

Each permanent Octogent role has a safe way to retrieve shared project memory and add a dated update to the shared Obsidian vault. This makes the shared-memory rule enforceable without giving a temporary terminal unrestricted read or write access to every personal vault file.

## How A Role Retrieves Shared Memory

Inside an active role-bound terminal, search the shared project notes first:

```sh
octogent agent memory search "Block Bounce ranking playtest"
```

The search reads only the project-managed `Octogent/` and `🤖 AI Agent Memory/` areas. It returns redacted snippets, relative note paths, and match scores. It does not return arbitrary personal-vault files, raw credentials, terminal capabilities, or a caller-chosen filesystem path.

## How A Role Saves Memory

Inside an active role-bound terminal, the agent uses:

```sh
octogent agent memory "Verified decision, test result, handoff, or unresolved question."
```

Octogent verifies the terminal's private local capability and permanent role binding. It then appends the bounded, credential-redacted update to:

```text
Octogent/Agent Updates/<role-id>.md
```

For example, a Codex Executor update goes to `Octogent/Agent Updates/codex-executor.md`.

## How A Role Updates Shared Team Memory

For a cross-role handoff, decision, verified finding, or unresolved blocker that other roles should discover, use:

```sh
octogent agent memory share "Verified handoff: ranking regression is fixed; QA evidence is in the Record Center."
```

Octogent appends the update, with the derived role name, to one fixed shared note:

```text
Octogent/Shared/Agent Timeline.md
```

Every live permanent role can search this project-managed note through the normal memory search command. This is a shared append path, not permission to overwrite another role's note or edit unrelated personal vault material.

## Boundaries

- Only a live terminal bound to the matching permanent role can use its role note.
- The note path is derived by Octogent; the role cannot supply a filename or path.
- Updates are append-only, dated, bounded, and redacted for common credentials.
- Shared-team updates use one fixed timeline path; the role cannot choose a shared file or overwrite an existing entry.
- Shared-note retrieval requires the same matching live role terminal and private local capability as a write. Audit records retain only query length and result count, never the query text or result body.
- Dashboard clients and generic terminals cannot call this write path because they do not receive the terminal capability.
- Audit records contain the role, relative note path, and content length, never the update body or the absolute vault path.

The configured vault defaults to the project vault. Set `OCTOGENT_OBSIDIAN_VAULT_PATH` only if the vault moves. Do not use this value to point to arbitrary system folders.

## When To Use It

Search before knowledge-heavy work, then add a concise update after a verified decision, source-backed research finding, test result, failure lesson, or cross-role handoff. Keep detailed system-of-record material in the repository and Record Center; use role notes as concise human-readable continuity.
