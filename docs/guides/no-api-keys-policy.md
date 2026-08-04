# No API Keys Policy

Octogent is no-API-key by default.

## Rule

Agents must not request, store, generate, paste, export, or use API keys unless the operator explicitly overrides this policy for one exact task.

This includes:

- OpenAI API keys
- Anthropic API keys
- Google/Gemini API keys
- Perplexity API keys
- Bearer tokens
- Secret keys
- `.env` changes that add paid model credentials

## Default Alternatives

Use these instead:

- Logged-in web apps for ChatGPT/Codex, Claude, Gemini, Perplexity, NotebookLM, Notion, and Stitch.
- Local CLIs that use the operator's existing subscription/login.
- Browser workflows with explicit human approval for external side effects.
- Local models through LM Studio/Qwen for free/private background work.
- Notion or local memory for durable records.

## If A Tool Needs An API Key

Do not proceed silently.

1. State that the tool would require API billing or a secret.
2. Offer a no-key fallback first.
3. Continue with the fallback unless the operator explicitly says to override the policy.

## Runtime Enforcement

The runtime policy `deny-api-key-workflows` denies actions mentioning API-key setup, secret keys, bearer tokens, or common model-provider API key environment variables.
