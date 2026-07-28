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

## Shipped 2026-07-28, second wave

- **Trip recap share card** — at all-settled, a second artefact: green field,
  the total as the headline, a shape-drawn SETTLED stamp, avatar row, and
  "María fronted the most". Data in `src/server/og/recapCard.ts` (one lean
  query; settled fold mirrors `roomState.balancesOf` with a drift test), art in
  `recapCardArt.tsx`, screen at `/r/[slug]/recap` (noindex, members-only).
  **The URL is never shared** — it carries the room slug, which is the room's
  credential — so "Share the story" fetches the PNG and shares the FILE
  (native → clipboard → download), with the domain printed on the card as the
  acquisition path. A public, slug-free recap URL needs a second read-only
  token; deliberately not V1. Events: `recap_viewed`, `recap_shared` (+ tier).
- **i18n** — en / es-419 / pt-BR live product-wide (cookie-resolved, no URL
  prefixes), Intl money/date formatting, error codes → localized client
  messages, CI key-parity audit. SEO pages and OG images stay English by design.
- **Polish** — whoosh/blip/error cues + master ducking, haptic vocabulary
  (confirm/error/success, iOS-tuned), squash-and-stretch all-settled, expense
  pop, error shake, drawer entrances, staggered reveals, `animationsEnabled`
  setting (OS reduced-motion always wins), standardized toast durations.
- **Smart currency** — offline inference (timezone beats language; ranked, max
  3, honest about ambiguity), suggestion chips on create, flag+symbol+localized-
  name picker over a native select, styled symbol runs, foreign-conversion
  strip in both split modes.
- **Auditable balances** — tap any balance → its complete derivation
  (paid/shares/settlements, chronological, signed, foreign originals), pair
  view that refuses to fake pairwise attribution and shows both sheets instead;
  proven by a 300-random-room property test against the server's own fold.
- **Accounts + push UI** — gated dark behind `NEXT_PUBLIC_ACCOUNTS_ENABLED` /
  VAPID build args: email save/recover panel, `?login=1` attach-and-merge
  recovery, six-state push opt-in row (never burns iOS's permission one-shot),
  token-proven subscribe with rollback on server failure.
- **Infra** — `split-egress` squid pinhole live on the box and verified
  (push gateways + email API only, port 443 CONNECT, everything else 403);
  VAPID keys + auth secret set as runtime env; all `NEXT_PUBLIC_*` build args
  now have Dockerfile ARG/ENV pairs (the missing PostHog pair was found and
  fixed — a configured build arg the Dockerfile doesn't declare is silently
  dropped).

## To light up (remaining gates)

Done 2026-07-28 and verified live: the `split-egress` squid pinhole (allowed
CONNECT-443 to push gateways + `api.resend.com`, everything else 403), VAPID
keys + `SPLIT_AUTH_SECRET` + proxy URL as runtime env, all build-arg ARG/ENV
pairs, and PostHog events confirmed arriving in project 234225 from a real
prod session. NEVER rotate the VAPID pair in place — every subscription dies
silently; a rotation needs a dual-key window.

Still gated:

- **Email** [Hugo — the one hard external blocker]: transport is chosen by env,
  OneSignal preferred (`src/server/email.ts` speaks both). Path A, OneSignal:
  create a **separate Split-only app** in the existing OneSignal account (never
  reuse Peanut's key — this container is semi-trusted and Peanut's key reaches
  Peanut's whole audience), verify a peanutsplit.com sending domain, then set
  `SPLIT_ONESIGNAL_APP_ID` + `SPLIT_ONESIGNAL_API_KEY`. Path B, Resend: new
  account + DKIM → `RESEND_API_KEY`. Either way: `SPLIT_EMAIL_FROM`,
  `SPLIT_EMAIL_PROXY_URL=http://split-egress:3128` (api.onesignal.com is
  already on the proxy allowlist), then flip `NEXT_PUBLIC_ACCOUNTS_ENABLED=1`
  (build arg) and the accounts UI appears. Everything else is wired and tested.
- **Push exercise** [next session]: infra + UI are live; nobody has completed a
  real two-device subscribe→notify loop in prod yet. Run one before telling
  users about it.

## Wave 3 — build only if the day-30 read says the funnel is real

Ordered by expected value per effort:

1. ~~**Trip recap share card**~~ — shipped 2026-07-28, see above. Numbering
   left alone so the other items keep the IDs they were discussed under.
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
- `/favicon.ico` 404s (browsers probe it regardless of the manifest icons) —
  drop a real .ico in `public/`.
- `all_settled` fires (analytics + would-be push) for a solo room whose only
  expense nets to zero — harmless (push skips with no targets) but the event
  is semantically noisy for single-member rooms.
