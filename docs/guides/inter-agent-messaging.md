# Inter-Agent Messaging

Octogent has a simple local channel system for messages between terminals. This is the first
communication layer for the agentic OS: agents can talk to agents, and the operator can talk to a
specific agent without opening that terminal directly.

## What channels are

Channels are queues keyed by target terminal ID. Sending a message does not write to the target
tentacle files, but it does create a persistent channel record in
`.octogent/state/channel-messages.json`.

Use them for short coordination:

- ask for review
- report completion
- hand off a finding
- point another agent to a file or risk

It is not a replacement for proper context files.

## Permanent role inboxes

Use a role inbox when the human operator or another live permanent role is addressing a stable responsibility such as **Codex Executor**, **CEO Command**, or **Research Triad**. The Conversations view and `POST /api/agents/:agentId/inbox` both use this durable layer. A role stays visible even when it has no terminal, and a queued instruction does not launch a provider or terminal.

When an exact role-bound terminal reaches an idle prompt boundary, Octogent delivers the oldest queued messages and records the specific terminal ID. It never injects an inbox message while the agent is processing or waiting for permission. Agent-origin role messages require the sender's active local capability and an explicit permanent-role binding. Terminal channels remain useful for active session-to-session coordination; role inboxes are the stable way to address a responsibility across temporary terminals.

## Delivery model

When a message is sent, Octogent:

1. verifies the target terminal record exists
2. appends the message to that terminal's queue
3. marks it as undelivered
4. persists the queue to `.octogent/state/channel-messages.json`
5. injects pending messages into the target PTY when the target session is idle

Delivered messages are written into the terminal input as lines like:

```text
[Channel message from <from-terminal-id>]: <content>
```

If the target terminal is not running, the message waits until that session exists and becomes idle.
If the API restarts first, the message is reloaded from the persisted channel log.

## CLI usage

Send a message:

```bash
octogent channel send <terminal-id> "Need review on the parser change"
```

When one managed terminal is messaging another, the CLI reads its session ID and private local
capability automatically. Do not copy a sender ID from another terminal:

```bash
octogent channel send <target-terminal-id> "DONE: parser change is ready"
```

The API accepts an agent-origin message only when its `OCTOGENT_SESSION_ID` and private
`OCTOGENT_CHANNEL_CAPABILITY` identify an active managed terminal. Outside a managed terminal, the
CLI sends as `operator`, which is how a human sends a direct instruction to an agent.

List messages:

```bash
octogent channel list <terminal-id>
```

Send a handoff to a permanent role from a managed agent terminal:

```bash
octogent agent message <role-id> "The verified handoff is ready."
```

This command cannot run outside an active managed terminal. The API derives the sender role from
the verified terminal record rather than trusting text supplied by the caller.

## API usage

- `POST /api/channels/:terminalId/messages`
- `GET /api/channels/:terminalId/messages`

## Current Behavior

- messages are stored in memory and persisted to `.octogent/state/channel-messages.json`
- messages persist across API restarts
- delivery state is tracked by the API
- delivered messages record `deliveredAt`
- agent-origin messages require the sending terminal's active private local capability; a supplied
  `--from` ID alone cannot impersonate another agent
- agent-to-role messages require the same capability plus a terminal bound to a permanent role;
  the durable inbox records the sending role and terminal ID
- idle and stop hook events can trigger delivery
- listing messages shows queued and delivered messages

## Practical rule

Use channels for active coordination. If a decision, test result, or handoff must become project
truth, also write it into the relevant tentacle files or Record Center.
