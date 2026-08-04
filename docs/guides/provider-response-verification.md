# Provider Response Verification

Octogent separates three kinds of provider evidence:

1. **Available locally**: a command exists on this Mac.
2. **Signed in locally**: a provider CLI reports a local authenticated session.
3. **Response verified**: the operator has deliberately run one constrained response check.

Only Codex has the third check today. It is intentionally manual because it uses the operator's signed-in plan.

## Codex Check Contract

In **Settings > Codex provider check**, press **Run isolated check** only when you want to spend one minimal provider request. The API accepts the action only with a fixed confirmation value and then runs a fixed Codex command with these boundaries:

- a new empty temporary working directory
- `--ephemeral`
- `--ignore-rules` and `--ignore-user-config`
- `--skip-git-repo-check`
- `--sandbox read-only`
- one fixed request for `OCTOGENT_PROVIDER_HANDSHAKE_OK`
- a 45-second process timeout and five-minute retry limit

It does not launch a role, inspect the project, use a caller-supplied prompt, send a business message, write to the repository, or retain the model response. The dashboard and audit log keep only the provider, outcome category, and safe timestamp metadata.

## Meaning Of The Result

**Response verified** means that the isolated Codex check returned the expected fixed text. It is evidence that the local CLI could authenticate and receive a basic response at that time. It is not evidence that an agent has been launched, that a role can complete a real project task, or that another provider is connected.

If the check fails, inspect local Codex login and plan access before retrying. Do not bypass the five-minute limit or add a custom prompt to the endpoint.
