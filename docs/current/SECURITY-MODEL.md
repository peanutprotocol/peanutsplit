# Security and data lifecycle

This document describes the current implementation; it is not a security certification, privacy
policy, or guarantee that a particular deployment is hardened.

## Trust model

The room link is the room's bearer credential. Anyone who receives it can read the room and perform
the trust-based writes exposed by its routes. The link is designed for a group chat, not a public
post. There is no account recovery or owner override.

Member tokens are device-held secrets. They provide actor attribution for many writes and stronger
proof for social/device operations such as reactions and push subscriptions. They do not make
ordinary room writes owner-authorized.

Some handlers are slug-free, but an expense UUID alone is not a room capability. Restore is scoped
by both room slug and expense ID; a mismatched pair returns 404 without changing either room.
Reaction handlers locate the room through the expense UUID but require a valid member ID/token pair
for that room. Notification send UUIDs are unauthenticated telemetry locators that can increment only
opened/dismissed counters and return no room data. Treat expense IDs as room-related identifiers and
notification send IDs as integrity-sensitive.

Operators must avoid putting room slugs, member tokens, amounts, names, push endpoints, or receipt
images in analytics, access logs, exception payloads, or support tooling unless a documented and
consented flow requires it.

## Stored data

| Category        | Examples                                                         | Notes                                                                   |
| --------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Ledger          | names, expenses, shares, settlements, currencies                 | Room-scoped; financial rows can remain after UI deletion                |
| Capabilities    | room slug, member tokens, handoff tokens                         | Raw member tokens are returned to the client; handoff rows store hashes |
| Opaque IDs      | expense/member IDs, notification send IDs                        | Need another proof for room access; send IDs can update counters        |
| Audit           | before/after snapshots, actor device hash/ordinal                | Append-only and may retain historical financial/name values             |
| Device delivery | push endpoint, public key material, user agent                   | Sent to browser push services when enabled                              |
| Support         | message, bounded room snapshot, diagnostics, optional screenshot | Requires an explicit user review/consent flow; pruned after 90 days     |
| Receipt model   | image and extracted line items                                   | Forwarded to the configured provider; the server does not persist it    |

The installed-PWA share handoff intentionally places one receipt image in browser Cache Storage.
The logical handoff is single-use and rejected after ten minutes, but the underlying bytes can
remain on that device until a later handoff read or application startup performs cleanup. Operators
must not describe receipt images as never stored.

Browser-local storage can contain recent room links, member tokens, offline expense queues, and PWA
handoff state. A database export alone is not the full end-user data surface.

Current snapshot CSV, portable JSON, and history exports remove known credential-shaped fields and
redact the live room slug even when it is embedded, case-varied, or percent-encoded. The restore
route now requires the matching room slug as well as the expense ID, so retained relational IDs do
not reopen a room by themselves. Regression tests cover cross-room restore, raw and encoded slug
echoes, credential-shaped fields, and preserved ledger balances.

These exports are capability-stripped under the current route model, not anonymized support
artifacts. They still contain names, financial history, notes, and receipt URLs. Do not email or
attach a real export to a public report; use synthetic data, and re-audit this boundary whenever an
export field or ID-addressed route changes.

## External data flows

- FX: the supplied Compose baseline is static and makes no request. Outside that baseline, an unset
  mode enables outbound refreshes and the code currently falls back to
  `https://api.peanut.me/fx/rates` unless `SPLIT_FX_ENDPOINT` is explicit.
- Push: endpoints and encrypted notification payloads go to allowlisted browser push services.
- Receipt parsing: an image goes to OpenRouter or Gemini when explicitly configured and enabled.
- Analytics/error reporting: client events go to configured PostHog/Sentry endpoints; room secrets and money must not.

Self-hosters become responsible for their own legal notices, data-processing choices, retention,
backups, access logs, subprocessors, and user requests. The repository does not provide a complete
privacy/compliance program.

## Deployment assumptions

- Put TLS and a trusted reverse proxy in front of the application.
- Configure one explicit public origin; never derive canonical authority from an arbitrary Host header.
- Keep PostgreSQL off the public network and use unique credentials.
- Run one app replica until SSE and rate limiting have shared stores.
- Treat every secret named in `.env.example` as sensitive, not only `DATABASE_URL`.
- Add egress restrictions if receipt, push, and FX destinations must be constrained.
- Back up PostgreSQL before startup can apply new migrations or retention sweeps.

## Reporting vulnerabilities

Use the private process in the root [SECURITY.md](../../SECURITY.md). Do not include room links,
member tokens, real receipts, or personal data in a public issue.
