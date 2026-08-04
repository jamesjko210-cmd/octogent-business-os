# Publishing To A User-Owned GitHub Repository

The customized Octogent Business OS is publicly versioned at `https://github.com/jamesjko210-cmd/octogent-business-os` on `main`. This guide preserves the safeguards for reviewing a future release, changing that destination, or publishing another user-owned copy without storing credentials.

## Why This Is Deliberate

The original Octogent upstream remains protected by the local publishing guardrail. This customized workspace publishes only to the operator-owned repository above. Any future destination must be owned or explicitly approved by the operator, never the upstream by accident.

## What Is Already Ready Locally

- A read-only GitHub readiness check is available at `GET /api/github/publish-readiness` and in the dashboard.
- Remote Git actions are refused while `origin` is missing, points at the upstream, or has not been explicitly approved by the operator.
- The local verified session history, Record Center, developer journal, and `CHANGELOG.md` provide review evidence before a release.
- The current verified baseline is 6 core tests, 236 API tests, and 125 web tests, plus TypeScript, Biome, whitespace, and production-build checks.

## Operator Checklist

1. Review the local working tree and decide which changes belong in the release. The release needs a deliberate scope rather than an automatic bulk commit.
2. Confirm the dashboard and Git remote still identify the expected credential-redacted user-owned destination.
3. Review `CHANGELOG.md`, the relevant Record Center note, and the local session history. Run the applicable tests again for the exact commit scope.
4. Create a focused commit, inspect it, and explicitly choose whether to push. A readiness result is not permission to publish automatically.
5. If changing the remote or creating another public copy, obtain the owner-approved URL first and repeat the full destination review. Do not guess a repository owner or modify `origin` automatically.

## Boundaries

- Never use the original `hesamsheikh/octogent` upstream as this project's publication target.
- Do not put GitHub tokens, Telegram secrets, provider credentials, personal data, or raw agent transcripts in commits, docs, or remote URLs.
- Do not treat a passing test suite as proof that a provider, deployment, mobile bridge, or external service is connected.
- If a release includes public-app code, repeat the managed-app security review before publishing.

## Evidence To Keep With A Release

Record the release date, purpose, selected files, tests run, pass/fail outcome, and known limitations in `CHANGELOG.md` and the relevant Record Center entry. Keep raw prompts, credentials, and terminal transcripts out of the release record.
