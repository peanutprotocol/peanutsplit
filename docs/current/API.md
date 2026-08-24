# Current HTTP surface

## Status

The current HTTP route handlers live in `apps/web/src/app/**/route.ts`. The `/api/**` handlers form
an internal, unversioned product interface, not a compatibility-guaranteed public SDK. Route
handlers, validation schemas, wire types, and handler tests are authoritative.

The [generated route inventory](generated/API-ROUTES.md) lists every exported HTTP verb/path from
source. `pnpm docs:check` fails if it drifts. Request/response examples and credential semantics
remain manual and must be reviewed when a route changes.

## Conventions

- JSON is the default request and response format unless a route explicitly returns an event
  stream, redirect, text health response, XML feed, or binary/file response.
- Money crosses JSON boundaries as decimal strings or validated wire values, never a raw JavaScript `bigint`.
- Errors use the helpers in `apps/web/src/server/http.ts`; callers must handle non-2xx responses explicitly.
- Body and cardinality limits are enforced per route/validation schema, not by one global API promise.
- The room slug in `/api/rooms/:slug/**` is a bearer capability. Treat URLs and logs containing it as sensitive.

## Credential matrix

| Mechanism               | Meaning                                   | Typical use                                                     |
| ----------------------- | ----------------------------------------- | --------------------------------------------------------------- |
| Room slug               | Bearer read/write capability              | Room state and most trust-based room mutations                  |
| Expense ID              | Relational locator, not a room credential | Restore also needs the room slug; reactions need member proof   |
| `X-Member-Token`        | Optional actor attribution on many writes | Audit/history attribution; it is not general authorization      |
| Member ID + token proof | Required identity proof                   | Reactions, push subscriptions/status, install handoff identity  |
| One-time handoff token  | Short-lived recovery capability           | Browser-to-installed-PWA handoff                                |
| Notification send ID    | Unauthenticated telemetry locator         | Increment an opened/dismissed counter; never returns room state |

Holding a room link allows broad room access by design. Holding an expense ID alone does not read or
mutate its room: restore is scoped by both room slug and expense ID, while reactions also require a
valid member ID/token pair for the containing room. Member tokens do not turn ordinary room writes
into an account-owned ACL. See [SECURITY-MODEL.md](SECURITY-MODEL.md).

## Surface groups

- Room lifecycle: create/read/update rooms.
- Ledger: create/update/delete/restore expenses; create/delete settlements.
- Roster: add/update/remove/claim/reactivate/restore members.
- Import/export/history: create/import rooms, append imports, snapshot/history export, audit history.
- Social/device: reactions, push subscriptions and outcomes, install handoffs, SSE events.
- Optional tools: currencies, FX rate, receipt parsing, share target.
- Support: feedback reports.
- Operations and publication: health, readiness, PWA manifest, and RSS.
- Room sharing: dynamic card and recap-card renderers under `/r/:slug/**`.

Receipt parsing and some import/share surfaces are feature/configuration gated. A missing model key
can produce a deliberate 503; a v1 build may return 404 for v2-only routes.

## Streaming and scaling

`GET /api/rooms/:slug/events` uses server-sent events as a wakeup hint. Event state is process-local;
cross-replica writes are not pushed to clients connected to another replica. Client polling provides
eventual refresh, but multiple replicas do not have the same realtime behavior as the supported
single-replica baseline.

Rate limits are also per process. Scaling replicas multiplies allowances unless a shared store is added.

## Change rule

When adding, removing, or changing a route:

1. update validation and handler tests;
2. run `pnpm docs:generate` and review the route diff;
3. update credential, retention, idempotency, and feature-gate prose where behavior changed;
4. treat any future stable external contract as a separately versioned design decision.
