# Session History Policy

Use this project-level history alongside Git commits to make ongoing AI-assisted work understandable to the operator, supervisor, and future agents.

## What To Record

For each meaningful session, add a concise entry to `CHANGELOG.md` and the relevant Record Center note with:

- date and scope
- outcome and why it was needed
- files or runtime surfaces changed
- verification performed and results
- limitations, assumptions, or required human decisions

Do not record secrets, raw user data, API keys, long terminal logs, or unverified model claims.

## GitHub Publishing Rule

Before publishing, verify that `origin` points to a repository owned or explicitly approved by the operator. Do not push Octogent changes to the original upstream repository by default. Once a user-owned remote is configured, each reviewed release should include a focused commit, the changelog update, and its test evidence.

## Current Remote Status

The current `origin` is the upstream Octogent repository. It is intentionally not treated as a publishing destination for this customized management system until the operator provides or configures a user-owned repository.

## Dashboard Readiness Check

`GET /api/github/publish-readiness` exposes a read-only status for the local GitHub dashboard. It never changes a remote, creates a commit, or pushes.

The check blocks remote Git actions when there is no `origin`, when `origin` is the Octogent upstream repository, or when a non-upstream remote has not been explicitly approved through the local runtime. Push, sync, pull-request creation, and pull-request merge requests are refused before the Git operation begins. Any credential-like portion of a remote URL is redacted from the response.

Use a token-free user-owned remote URL when it is time to configure publishing. Even when the dashboard reports ready, a human must still review commits and explicitly choose to publish.

For the complete operator sequence, see [Publishing To A User-Owned GitHub Repository](../guides/user-owned-github-publication.md).

## Local Timeline

`GET /api/sessions` and **Settings > Verified session history** provide a read-only timeline of managed terminal sessions before any remote exists. The API derives each entry from the append-only local audit and shows safe metadata only: the terminal or permanent role, provider, tentacle, start/end time, end reason, and supporting audit-event count.

The timeline deliberately excludes prompt text, message content, tool output, terminal capabilities, process IDs, and credentials. It is evidence for local review, not a replacement for a reviewed commit or an external provider transcript.
