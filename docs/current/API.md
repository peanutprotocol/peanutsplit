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

## Cross-origin callers

The iOS and Android apps load the product from inside the binary and call this API cross-origin (see
[NATIVE.md](NATIVE.md)). `apps/web/src/lib/cors.ts`, applied in `apps/web/src/proxy.ts`, answers CORS
for exactly two origins:

| Origin                  | Caller                    |
| ----------------------- | ------------------------- |
| `capacitor://localhost` | the iOS app (WKWebView)   |
| `https://localhost`     | the Android app (WebView) |

- **Paths:** every `/api/**` route, plus the share-card images `/r/:slug/card/:kind` and
  `/r/:slug/recap/card`.
- **Excluded:** `/api/install-handoff` and `/api/rooms/:slug/install-handoff`. They are bound to a
  `__Host-` cookie and check the exact request `Origin` themselves, so they stay same-origin only.
- **Preflight in the proxy:** an `OPTIONS` request from an allowed origin gets `204` with
  `Access-Control-Allow-Origin: <origin>`, `Access-Control-Allow-Methods: GET, POST, PATCH, DELETE`,
  `Access-Control-Allow-Headers: Content-Type, X-Member-Token`, `Access-Control-Max-Age: 600` and
  `Vary: Origin`. It never reaches a handler or a rate-limit bucket.
- **Other methods** get `Access-Control-Allow-Origin: <origin>`,
  `Access-Control-Expose-Headers: Content-Disposition` and `Vary: Origin`, also on error responses
  (`403`, `429`, `500`), so the app reads a rate limit as `RATE_LIMITED`, not as a network error.
- **No credentials:** never `Access-Control-Allow-Credentials`, never `*`. The apps send no cookie; the
  member token travels in `X-Member-Token` or the body, as on web.
- Any other origin gets no CORS headers, and the behaviour is the same as before.
- `SPLIT_CORS_TEST_ORIGINS` (comma-separated) adds origins for the cross-origin e2e suite only. Never
  set it in production. `*` and `null` in it are ignored.

Two static files are public on purpose: `/app-config.json` (the app version gate) carries
`Access-Control-Allow-Origin: *`, and `/.well-known/apple-app-site-association` is served as
`application/json` with no redirect, as iOS requires.

Native push uses the existing push-subscription routes. The body carries
`{ transport: 'apns' | 'apns-sandbox' | 'fcm', token, memberId, memberToken }` in place of the web
`endpoint` and `keys`. Without server credentials for that transport the route answers
`503 NATIVE_PUSH_UNAVAILABLE`.

## Backward compatibility with shipped app builds

**API routes stay backward compatible with every shipped app build.** The store apps have no
over-the-air updates. An old binary keeps calling the live API for months, and production changes with
every push to `main`.

- Add fields; do not remove or rename a field an app build reads or sends.
- Keep accepting every request body a shipped build sends. A new required field needs a default.
- Keep error codes stable; the app maps them to copy.
- If a break cannot be avoided, raise `minBuild` for the affected platform in
  `apps/web/public/app-config.json` in the same push. Builds below it show **Update Split** and a way to
  open the room in the browser.

## Change rule

When adding, removing, or changing a route:

1. update validation and handler tests;
2. run `pnpm docs:generate` and review the route diff;
3. update credential, retention, idempotency, and feature-gate prose where behavior changed;
4. check the change against [the compatibility rule](#backward-compatibility-with-shipped-app-builds);
5. treat any future stable external contract as a separately versioned design decision.
