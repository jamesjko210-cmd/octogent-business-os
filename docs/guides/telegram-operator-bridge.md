# Telegram Operator Bridge

Telegram is the human-to-agent bridge for Octogent. It does not replace agent-to-agent coordination: permanent roles continue to use local, capability-checked channels and durable role inboxes inside Octogent.

## What It Does

- Accepts messages only from chat IDs you explicitly trust.
- Queues a message for a named permanent role through the existing local inbox.
- Acknowledges that the message is queued; it does not copy terminal output, provider transcripts, capabilities, or secrets back to Telegram.
- Lets a live role submit a concise, credential-redacted operator update locally. Your trusted chat can retrieve those updates with `/updates`; agents never send Telegram messages by themselves.
- Records safe routing events in the local audit log without storing Telegram chat IDs there.

## What It Does Not Do

- It does not launch a model, approve an action, run a workflow, or bypass approval policy.
- It does not give Telegram a terminal capability or direct terminal access.
- It does not use webhooks or expose Octogent to the public internet. The local API remains loopback-only and the bridge uses Telegram long polling.
- It does not turn Telegram into an agent-to-agent transport. Agent handoffs stay in the local audited channel system.

## Setup

1. Create a dedicated bot with Telegram's BotFather and keep its token private.
2. Choose only the personal or private-group chat IDs that may operate Octogent. Do not use a broad public group.
3. Start Octogent with these environment variables set in your own shell or secret manager. Do not place them in a repository, prompt, memory entry, or `.env` file that might be committed.

```sh
export OCTOGENT_TELEGRAM_BOT_TOKEN='your-private-bot-token'
export OCTOGENT_TELEGRAM_ALLOWED_CHAT_IDS='your-trusted-chat-id'
pnpm dev
```

For multiple trusted chats, separate numeric IDs with commas. `OCTOGENT_TELEGRAM_POLL_TIMEOUT_SECONDS` is optional and is capped at 50 seconds.

The Settings screen shows the bridge state but never exposes the token or chat IDs. The bridge refuses to start if either the token or trusted-chat allowlist is missing or malformed.

## Commands

```text
/help
/roles
/agent <role-id> <message>
/updates [role-id]
```

Example:

```text
/agent codex-executor Run the focused Block Bounce regression checks and report the result in Record Center.
```

The message is bounded, redacted for common credential patterns, persisted locally, and delivered only when the exact role-bound terminal is idle. A queued message is not evidence that an AI provider is connected or currently working.

Inside a matching live role terminal, an agent can queue an operator update:

```text
octogent agent reply "Focused tests passed; the next decision is ready for review."
```

The update is capped at 1,000 characters, credential-redacted, stored in Octogent's local state, and audited without its body. It is not pushed to Telegram. From a trusted chat, request `/updates` or `/updates codex-executor` to retrieve recent safe reports. This keeps the external message user-initiated and prevents an agent from selecting recipients or sending autonomous notifications.

The same reports appear in **Settings > Telegram operator bridge > Recent agent reports**. That local read-only dashboard panel uses the same safe queue and makes it possible to review communication evidence before retrieving it from a phone.

## Security Notes

Telegram's Bot API uses an HTTPS token-authenticated interface, and it supports either long polling or webhooks for receiving updates. Octogent deliberately uses long polling because its dashboard is local-only; Telegram documents that the two delivery methods are mutually exclusive. [Telegram Bot API](https://core.telegram.org/bots/api)

Telegram is the mobile operator surface, not a replacement for local agent coordination. Permanent roles use Octogent's capability-checked local channels and durable inboxes to talk to one another. Do not put raw user data, credentials, terminal output, or provider transcripts in `octogent agent reply` messages.

If a token is ever pasted into a message, prompt, document, or commit, revoke it in BotFather before reconnecting the bridge.
