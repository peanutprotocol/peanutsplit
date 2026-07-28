# Roadmap — peanutsplit

The engineering backlog and feature map, so nothing lives only in a chat session.
Product status/milestones/decision log stay in the Notion project (linked from
`mono/projects/peanut-split/`); this file is what's built, building, queued, and
deliberately not built — with enough context to pick any item up cold.

Owner of record for each open item is in brackets. Last full update: 2026-07-28.

## Shipped (beyond the 07-25 launch state)

- **Correctness wave (2026-07-28):** service worker never caches `/api/*`
  (stale RoomState = money bug); FX rate genuinely locked at expense creation
  (edits reuse the stored rate, only a currency change re-prices); buttons obey
  the haptics setting; per-IP rate ceilings on all unauthenticated writes
  (`src/server/rateLimit.ts`); client-side Sentry with room-slug redaction
  (`src/lib/redact.ts` — slugs are credentials, they never leave the device in
  telemetry); demo script and deploy docs made honest.
- **Analytics + error tracking:** PostHog project "Peanut Split" (Squirrel Labs,
  id 234225) and Sentry project `peanut-split` exist; keys are Dokploy build
  args. `src/lib/analytics.ts` activates on `NEXT_PUBLIC_POSTHOG_KEY`;
  `src/instrumentation-client.ts` on `NEXT_PUBLIC_SENTRY_DSN`.
- **Web-push backend (dark):** subscriptions bound to proven members
  (`POST /api/rooms/[slug]/push-subscriptions`, endpoint host allowlist),
  SW push/click handlers, idempotency-ledger send pipeline
  (`src/server/push.ts`, `NotificationSend` claim rows), event triggers on
  expense/settlement/all-settled with a 3-per-room-per-day cap on expense
  pushes. Inert until VAPID env vars are set (see "To light up").

## In flight (agents running as of 2026-07-28)

- **i18n** (`feat/i18n`): en / es-419 / pt-BR via next-intl, cookie-resolved
  (`ps-locale`), no URL locale prefixes; full string extraction incl. drawers and
  install prompt; API errors become code→message client mapping; Intl-based money
  and date formatting (pt-BR "1.234,56" parsing rules); key-parity audit script
  in CI. SEO/content pages stay English (Konrad's surface). OG images stay
  English (font glyph coverage + no-cache rule in `src/server/og/fonts.ts`).
- **Accounts backend** (`feat/accounts-core`): optional email + magic link, the
  Kittysplit framing — "access your rooms from any device", never a signup wall.
  Stateless HMAC tokens (purpose-scoped, epoch-invalidated), sealed 10-year
  session cookie, scanner-safe GET-form/POST-write verify, Resend-shaped email
  adapter (inert without `RESEND_API_KEY`), `attach` links only token-proven
  memberships, `rooms` re-issues member tokens to their proven owner (the
  device-recovery feature). UI ships later, gated on
  `NEXT_PUBLIC_ACCOUNTS_ENABLED`.

## Queued — phase 2 (start as phase-1 branches merge)

- **Polish pass** [session]: expand the synthesized sound palette using the
  primitives already in `src/lib/sounds.ts` (excite/modal-stack recipes, master
  ducking, per-key retrigger throttle); haptic vocabulary (confirm/error/success
  patterns, iOS stagger emulation); animation catalog — squash-and-stretch
  bounce for the all-settled moment, pop on expense add, shake on invalid input,
  staggered list reveals; `animationsEnabled` setting (a `reduce-animations`
  class on `<html>`, decorative pseudo-elements also get `opacity: 0`, OS-level
  `prefers-reduced-motion` always wins).
- **Smart UX / currency delight** [session]: infer the proposed room currency
  from device language + `Intl` timezone (offline — the no-egress deploy can't
  do IP-geo, and doesn't need to); playful currency picker (flags/symbols,
  animated selection, inferred currencies first); currency display as a designed
  object rather than a string.
- **Auditable balances** [session]: tap a balance → drawer deriving it from the
  expenses/shares/settlements already in RoomState. The deepest unnamed
  Splitwise complaint ("it expects you to trust it") — free differentiator,
  client-only.
- **Accounts + push UI** [session]: settings-drawer entries; email save/login
  flow (gated `NEXT_PUBLIC_ACCOUNTS_ENABLED`); push opt-in with the six-state
  status model (unsupported / ios-needs-pwa / denied / default / subscribed —
  never call `Notification.requestPermission()` on iOS outside standalone, it
  burns the one-shot); "your rooms on this device" merge after login.

## To light up (infra gates)

- **Egress proxy** [Hugo or session]: split containers have no egress by
  design. A squid CONNECT-allowlist service on `split-net` + `dokploy-network`
  (allowed: `fcm.googleapis.com`, `updates.push.services.mozilla.com`,
  `*.push.apple.com`, `*.notify.windows.com`, `api.resend.com`, port 443 only)
  unblocks push + email. Config drafted; the sandbox classifier blocked the
  session from deploying it — commands are in the session report.
- **Push env** [after proxy]: `SPLIT_VAPID_{PUBLIC,PRIVATE}_KEY`,
  `SPLIT_VAPID_SUBJECT`, `SPLIT_PUSH_PROXY_URL` (runtime) +
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (build arg). Keypair already generated. NEVER
  rotate in place — every subscription dies silently; dual-key window required.
- **Email** [Hugo — the one hard external blocker]: a Resend account (or other
  provider) + DKIM/SPF/DMARC on a peanutsplit.com sending subdomain →
  `RESEND_API_KEY`, `SPLIT_EMAIL_FROM`, `SPLIT_EMAIL_PROXY_URL`. Then set
  `SPLIT_AUTH_SECRET`, flip `NEXT_PUBLIC_ACCOUNTS_ENABLED`.
- **PostHog/Sentry verification** [session]: after next deploy, confirm events
  and errors arrive; close the two Notion tasks (PostHog wiring, Sentry DSN).

## Wave 3 — build only if the day-30 read says the funnel is real

Ordered by expected value per effort:

1. **Trip recap share card** — at all-settled, a second shareable artifact
   ("Ski trip: 9 days, €2,340, María fronted the most") reusing the OG art
   system. Probably the best virality-per-effort item on this list.
2. **Bill photo → itemized split** — snap a receipt, a vision model itemizes,
   assign items to people. Splitwise paywalls OCR; this is the sharpest "all
   premium features free" attack. Needs: one more allowlisted egress host + an
   API key + capture/itemize/assign UI. A real build — the size of the accounts
   wave.
3. **Room themes** — user-picked palette/motif (today hash-derived), which also
   themes the OG unfurl. Small.
4. **Expense reactions** — tap-to-react emoji on expenses. Social warmth with
   no chat surface. Small.
5. **CSV export** — Tricount deleted theirs and users still rage; cheap trust
   win.
6. **Verified settle receipts** — reopens the 2026-07-27 decision (Peanut emits
   no signed charge webhook; polling public `GET /charges/:id` is the cheapest
   route). Revisit only if day-30 shows conversion is what's broken.
7. **Splitwise importer** — bunq's en-US play; pairs with the
   `/splitwise-alternative` page.

## Deliberately not building

Each of these either breaks "a room is a link" or adds a maintenance surface
the one-month kill condition can't justify. The bunq/Tricount post-mortem in
`mono/projects/peanut-split/competitive-2026-07-24.md` is the tie-breaker.

- **In-room messaging** — the room is born inside a group chat; WhatsApp is the
  messaging layer. Reactions (wave 3) are the allowed subset.
- **User image uploads** (group photos, backgrounds) — abuse/moderation problem
  on an unauthenticated link-credential surface with no support channel.
  Palette/emoji customization only, until post-PMF with real moderation.
- **Mandatory accounts, roles/permissions/admins** — impersonation-tolerant
  flat rooms are the design (see SPEC).
- **Budgets, analytics dashboards, AI chat agent** — a second product inside
  Split.
- **Native apps, monetization features** — out of scope for the bet.

## Known debt

- `formatMoney` can flash 2-decimal amounts for a fresh non-fallback currency
  before `/api/currencies` resolves (mitigated by the fallback catalog).
- `apps/api` (the Fastify settle-loop engine) still exists beside `apps/web`
  with its own database and schema style; collapsing them is the remaining
  merge (`CLAUDE.md` "one seam still open"). The debt ceiling and
  settle-intent flow live only there.
- Root `pnpm format` fails (`prettier-plugin-tailwindcss` resolves only inside
  `apps/web`); format per-app instead. Root prettier also wants to reformat
  `ci.yml` — leave it.
- `Settlement` has no currency column (implicitly room currency) — decide
  before any multi-currency settlement work.
- In-memory rate limiter shares one bucket for header-less clients ('unknown'
  key) — unreachable behind Traefik, but wrong if the proxy ever changes.
