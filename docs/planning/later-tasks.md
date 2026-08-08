# Deferred Tasks

These are deliberate future decisions, not active work. Do not start them automatically.

## Evaluate Buzz As A Future Communication Layer

**Status:** Deferred until the Octogent local control layer has one verified live provider role and the private Telegram operator bridge has been configured and tested.

### Purpose

Evaluate [Block Buzz](https://github.com/block/buzz) as a possible persistent workspace for human and agent conversations, channel history, searchable project events, and review discussions.

### Octogent Boundary

- Keep Octogent as the local swarm, role, approval, memory, and execution control plane.
- Treat Buzz only as a potential communication and event-history layer; do not merge repositories or replace Octogent.
- Start with an isolated local Buzz evaluation, never a public relay or production project data.

### Required Review Before Any Installation

1. Review the required Docker, Postgres, Redis, MinIO, and Rust/Node toolchain footprint.
2. Review the Nostr keypair and signed-event identity model against the operator's no-public-fingerprint preference.
3. Confirm event retention, relay exposure, agent private-key storage, and audit-log access boundaries.
4. Use a fresh local-only project identity with no personal, Telegram, provider, or production credentials.
5. Test one harmless human-to-agent message and one read-only search flow before considering an Octogent adapter.
6. Keep all provider actions, Git actions, external publication, financial actions, and user-data workflows approval-gated.

### Success Criteria

- The local evaluation can be stopped and removed without affecting Octogent state.
- No personal identity, token, private key, provider transcript, game-user data, or production repository data enters the relay.
- The team can explain a concrete benefit over Octogent's existing role inboxes, agent-to-agent handoffs, Telegram bridge, and audit history.

### Current Priority

Finish Octogent's local layer first: one real provider role, a harmless inbox/memory/handoff acceptance check, and the private Telegram operator bridge.
