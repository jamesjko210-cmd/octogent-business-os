# Publishing To A User-Owned GitHub Repository

This guide prepares the customized Octogent Business OS for a future GitHub repository without changing a remote, creating a commit, pushing code, or storing credentials.

## Why This Is Deliberate

The current `origin` is the original Octogent upstream. It is protected by the local publishing guardrail because this workspace contains a customized Agentic OS and Block Bounce operating material. A publish must go to a repository owned or explicitly approved by the operator, never to the upstream by accident.

## What Is Already Ready Locally

- A read-only GitHub readiness check is available at `GET /api/github/publish-readiness` and in the dashboard.
- Remote Git actions are refused while `origin` is missing, points at the upstream, or has not been explicitly approved by the operator.
- The local verified session history, Record Center, developer journal, and `CHANGELOG.md` provide review evidence before a release.
- The current verified baseline is 6 core tests, 227 API tests, and 118 web tests, plus TypeScript, Biome, whitespace, and production-build checks. The production build retains a non-blocking large-chunk warning.

## Operator Checklist

1. Create an empty GitHub repository under an account or organization you control. Do not include credentials in the remote URL.
2. Review the local working tree and decide which changes belong in the first release. This workspace currently contains uncommitted project work, so the release needs a deliberate scope rather than an automatic bulk commit.
3. Provide the user-owned remote URL and explicit approval before anyone configures it. Octogent must not guess a repository owner or change `origin` on its own.
4. Set the reviewed remote through the operator-approved workflow, then supply the same reviewed value as `OCTOGENT_GITHUB_PUBLISH_ORIGIN` for the local readiness check.
5. Confirm the dashboard reports **ready** and that the displayed remote is the expected credential-redacted user-owned destination.
6. Review `CHANGELOG.md`, the relevant Record Center note, and the local session history. Run the applicable tests again for the exact commit scope.
7. Create a focused commit, inspect it, and explicitly choose whether to push. A readiness result is not permission to publish automatically.

## Boundaries

- Never use the original `hesamsheikh/octogent` upstream as this project's publication target.
- Do not put GitHub tokens, Telegram secrets, provider credentials, personal data, or raw agent transcripts in commits, docs, or remote URLs.
- Do not treat a passing test suite as proof that a provider, deployment, mobile bridge, or external service is connected.
- If a release includes public-app code, repeat the managed-app security review before publishing.

## Evidence To Keep With A Release

Record the release date, purpose, selected files, tests run, pass/fail outcome, and known limitations in `CHANGELOG.md` and the relevant Record Center entry. Keep raw prompts, credentials, and terminal transcripts out of the release record.
