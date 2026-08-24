# Current data model

## Authority

The field-level source of truth is [`apps/web/prisma/schema.prisma`](../../apps/web/prisma/schema.prisma)
and its migrations under `apps/web/prisma/migrations/`. It uses PostgreSQL schema `split`.

The [generated model inventory](generated/DATA-MODEL-INVENTORY.md) prevents the prose model list from
silently drifting. It does not replace migration SQL or the invariants implemented by server code.

`apps/api/prisma/schema.prisma` is a different schema named `app` and is not a migration source for
the current web product.

## Relationship overview

```text
Room
  +-- Member
  |     +-- Expense (payer / optional creator)
  |     |     +-- ExpenseShare
  |     |     +-- ExpenseReaction
  |     +-- Settlement (from / to / optional creator)
  |     +-- PushSubscription
  |     +-- InstallHandoff (optional)
  +-- RoomAuditEvent
  +-- ImportBatch -> Expense
  +-- FeedbackReport
  +-- NotificationSend

FxRate                          cached by base + quote
User -> AuthAccount             dormant account-linking hooks; no account endpoints
```

## Financial invariants

- Money uses `BigInt` minor units. JavaScript floating-point values are not durable money values.
- Each expense stores its original currency/amount and a frozen room-currency amount and FX rate.
- Expense shares are always stored in room currency and must sum to the expense's base amount.
- `EQUAL`, `EXACT`, `PERCENTAGE`, and `SHARES` are the supported split modes.
- Settlement amounts are room-currency minor units. A settlement is a trust-based record, not bank verification.
- Expense and settlement deletion is soft deletion through `deletedAt` so the interface can undo it.
- Audit events are snapshots rather than joins to mutable rows. A database trigger rejects audit updates/deletes.

## Identity and access fields

- A room slug contains the bearer capability used to locate and operate on a room.
- Each member has a server-issued secret token. Many mutations use it only for actor attribution.
- Reactions, push subscriptions, and other identity-sensitive operations require member proof.
- Member removal is durable roster history: `removedAt` prevents future activity while ledger relations remain.
- `User` and `AuthAccount` are dormant hooks. The current product exposes no sign-up or login endpoints.

## Lifecycle and retention

| Data                     | Current behavior                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------- |
| Rooms and active ledger  | No repository-defined automatic expiry                                             |
| Expenses and settlements | Soft-deleted; rows remain in the database                                          |
| Room audit events        | Append-only; database trigger rejects update/delete                                |
| Feedback reports         | Startup and report-time sweeps remove records older than 90 days                   |
| Install handoffs         | Short-lived; expiry checked on use and swept at startup/hourly/opportunistically   |
| Push subscriptions       | Persist until deletion, invalidation, or room cascade                              |
| Import batches           | Durable provenance; deletion is restricted where it would break expense provenance |

There is no documented whole-room erasure workflow. Do not represent a UI DELETE action, a portable
export, or a soft delete as complete erasure.

## Exports are not interchangeable

- Snapshot CSV represents current room state for human use.
- Portable JSON represents current room state with a schema version; it is not an automatic database restore.
- History export contains the append-only change record, including edit/delete snapshots.
- A database backup contains more operational state than any user-facing export.

Current snapshot and history exporters remove credential-shaped fields and redact the exact live
room slug wherever it appears in values or object keys, including case variants and raw, partial, or
fully percent-encoded URLs. Portable JSON omits the room's internal ID, slug, and analytics key;
download filenames are generic. Expense/member UUIDs remain because they are needed to preserve the
ledger graph, but an expense UUID alone can no longer restore or disclose a room: restore is scoped
by both the room slug and expense ID, and a cross-room mismatch returns 404 without mutation.

This is a capability boundary, not anonymization. Exports still contain names, amounts, notes,
receipts, and other group data, and a future field or route can change the threat model. Do not email
or attach a real export to a public issue; use synthetic data. The regression tests in
`room-export.test.ts`, `history-export.test.ts`, and `negative-space.test.ts` pin the current rule.

See `apps/web/src/lib/room-export.ts` and `apps/web/src/server/history-export.ts` before changing an
export promise.

## Migrations

For the current web application:

```bash
cd apps/web
pnpm exec prisma migrate deploy       # production-style apply
pnpm exec prisma migrate dev          # local development only
```

Take and verify a PostgreSQL backup before an upgrade. The application image applies migrations at
startup, before serving requests. Rollback can require a database restore; reverting application
code alone does not undo a migration.
