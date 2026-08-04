# Managed App Security

Octogent manages work around the public app and website. It is not the public app's backend, database, or identity provider. That separation is intentional: an agent dashboard should never become an indirect way to access player data, production credentials, or public write endpoints.

## Boundary

- Octogent receives only the capability needed for the current, approved task.
- Normal management inputs are anonymized, aggregate metrics and approved summaries, not raw player records.
- Secrets, private keys, production credentials, browser sessions, and raw user data must not be placed in prompts, workflow definitions, memory, audit events, or source control.
- Production actions remain human-approved. The workflow registry may record and queue work, but it does not silently activate an external integration.

## Required Release Checks

These checks are requirements for the future public app, not claims about the current Block Bounce MVP. The MVP does not currently have public uploads, user-generated text, accounts, payments, or webhooks.

### User-generated content

- Render names, comments, messages, and other player text as text by default.
- Do not use raw HTML injection for player content. If rich text is truly needed, validate it on the server and use a reviewed sanitizer with regression tests.
- Enforce authorization and ownership checks on the server, never only in the browser.

### Octogent operator dashboard

- Markdown from tentacles, prompts, and conversation records is treated as untrusted input, even when it was created by an agent.
- The dashboard renders Markdown only after DOMPurify sanitization using an HTML-only profile; scripts, event handlers, unsafe URLs, and active document tags are removed.
- The behavior has a regression test for script tags, event handlers, and `javascript:` links.

### File uploads

- Keep an explicit server-side allowlist for acceptable formats.
- Verify byte size and file signature; extensions and browser-provided MIME types are not proof.
- Generate storage names on the server and store uploads outside executable/static application paths.
- Serve untrusted files from a separate origin or as downloads where appropriate, and add malware scanning when the feature and scale justify it.

### Webhooks and external callbacks

- Verify the provider's signed request against the exact raw body before parsing or acting on it.
- Check timestamps and reject stale or malformed events.
- Record event identifiers to prevent replay, and make event handling idempotent.
- Log only the minimum safe diagnostic information; never log signing secrets or full personal payloads.

### Production foundation

- Keep secrets in a reviewed secret-management mechanism, never in the repository or agent memory.
- Use secure session and authorization patterns appropriate to the selected backend, plus CSRF protection for cookie-based state changes.
- Apply rate limiting, sensible request-size limits, safe errors, dependency updates, and security headers such as a carefully tested Content Security Policy.
- Run focused security regression tests and complete a short threat model before enabling a new public surface.

## Octogent Gate

The `approval-production-app-surface` policy makes public uploads, comments, webhooks, production authentication, payment webhooks, production websites, and production-database connections wait for operator approval. The `deny-secret-exfiltration` policy rejects common attempts to reveal or upload local secrets.

The gate improves the management system's behavior. It does not replace code-level review, a real security assessment, or application-specific testing when the public backend is built.
