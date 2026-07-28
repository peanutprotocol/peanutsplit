# Roadmap — peanutsplit

The engineering backlog and feature map, so nothing lives only in a chat session.
Product status/milestones/decision log stay in the Notion project (linked from
`mono/projects/peanut-split/`); this file is what's built, building, queued, and
deliberately not built — with enough context to pick any item up cold.

Owner of record for each open item is in brackets. Last full update: 2026-07-28.

## V1 hold — receipt scanning

The scan implementation remains in `src/components/room/scan/` for a future
stabilization pass, but its expense-drawer entry point is intentionally hidden
in v1. A real-device post-scan review could become unresponsive while the
underlying drawer remained reachable. Re-enable only after the image-decoding →
review → assignment portal lifecycle has a mobile regression test and a
real-device pass. Typed quick-add remains available.

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

## Shipped 2026-07-28, third wave

- **Splitwise import** (`/import`) — a group export becomes a room: expenses,
  payers, shares and balances, with the link moment at the end. The parser
  (`src/lib/splitwise-csv.ts`, no CSV dependency — RFC 4180 is ~40 lines and the
  repo has a 14-day release-age floor) inverts Splitwise's per-member NET back
  into payer + shares; the identity that makes it exact is the same statement as
  "the row sums to zero". Rows fronted by two people are genuinely ambiguous, so
  they become one expense per payer, cut by interval overlap so no cent is
  created or lost — balances exact, per-expense attribution flagged in the UI as
  a reconstruction. `POST /api/import` re-validates everything with zod and
  writes the whole room in ONE transaction (createMany for expenses and shares,
  FX table read once, no query in a loop). The CSV never reaches the server: the
  browser parses it and posts structured data. 103 tests, the load-bearing one
  being the round trip — parse a fixture, create the room through the real
  handler, and compare Split's balances against the file's own "Total balance"
  row — plus a Playwright spec that does the same through a real file input.
  Registered in `static-pages.ts`, linked from the footer and from
  `/splitwise-alternative` (whose FAQ used to say Split had no import).
  Known limits, all surfaced in the UI before anything is written: historic FX
  uses today's rate (Splitwise does not export the rate it used on the day), and
  settle-up rows arrive as balance-identical expenses rather than settlements.

## To light up (remaining gates)

Done 2026-07-28 and verified live: the `split-egress` squid pinhole (allowed
CONNECT-443 to push gateways + `api.resend.com`, everything else 403), VAPID
keys + `SPLIT_AUTH_SECRET` + proxy URL as runtime env, all build-arg ARG/ENV
pairs, and PostHog events confirmed arriving in project 234225 from a real
prod session. NEVER rotate the VAPID pair in place — every subscription dies
silently; a rotation needs a dual-key window.

Still gated:

- **Email** [Hugo, two small steps left]: OneSignal app **"Peanut Split"**
  (`f2137b49-b2ef-4c39-baa4-0bff5a81ef4c`, Squirrel Labs org, email-only,
  deliberately separate from Peanut's app) exists; key is on the box
  (`/root/.split-onesignal-key`) and staged in Dokploy env with
  `SPLIT_EMAIL_FROM="Peanut Split <hello@peanutsplit.com>"`, sending domain
  `mail.peanutsplit.com`. Remaining: (1) add the 8 additive DNS records at
  Namecheap (list in the 2026-07-28 session report / OneSignal email settings)
  and pass its Check Records; (2) ask OneSignal Support to enable email
  sending on the new app (new-app anti-abuse gate — a direct API send returns
  "Email sending for this app has been disabled"). Then flip
  `NEXT_PUBLIC_ACCOUNTS_ENABLED=1` (build arg) + redeploy, and re-run the
  request-link test. Optional hygiene: rotate the app key in-dashboard once
  live (its value transited an automation transcript during setup). Resend
  stays wired as the fallback transport.
- **Push exercise** [next session]: infra + UI are live; nobody has completed a
  real two-device subscribe→notify loop in prod yet. Run one before telling
  users about it.

## Shipped 2026-07-28, third wave

All five branches merged, deployed, and smoke-tested live the same day:

- **Receipt scan (code complete, v1 entry point held)** — photograph a bill →
  Gemini vision itemizes → editable review → tap-assign items → lands as a
  normal EXACT expense through the one tested money path. Images never
  persisted, receipt contents never logged, model output re-validated like any
  anonymous input. See the v1 hold above before re-enabling it.
- **Realtime + offline** — SSE poke-and-refetch (polling stretched to 45s while
  the stream is open, 8s floor otherwise, never removed); offline queue for
  expense creates only (queued settlements could double-pay).
- **Trip recap** — celebratory share card at all-settled; the shared artifact
  is the image, never a URL (a recap link would carry the room-slug credential).
- **Delight** — 8-theme catalog themed through to the OG unfurl; 6-emoji
  reactions requiring a token-proven member.
- **Splitwise import** — client-side CSV parse (the file never uploads),
  net→shares reconstruction with per-row zero-sum validation, one transaction,
  balances proven against the export's own Total balance row in tests.

A three-lens adversarial review (money/correctness · elegance/DRY ·
maintainability/security) ran the same day, and its consolidated 32-item fix
wave shipped hours later: the mid-drain queue-loss race, the queued-expense
false "all settled", the chunked-body cap bypass, missing `publish()` on
reactions/theme, one balance fold instead of two, one fake-expense
constructor, one rate limiter, the voseo→tuteo sweep, the i18n-audit
object-form blind spot, and a scroll-padding a11y fix. 690 tests.

**Queued next (wave 3.5): PWA deepening** — permanent install row in settings,
manifest `share_target` (share a receipt photo from the OS share sheet straight
into the scan flow), manifest shortcuts, apple-touch-icon + iOS splash, app
badge wiring.

Remaining candidates, ordered by expected value per effort:

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
   win. ~~Splitwise importer~~ shipped 2026-07-28 (below); export is the other
   half of the same trust argument and now the cheaper of the two.
6. **Verified settle receipts** — reopens the 2026-07-27 decision (Peanut emits
   no signed charge webhook; polling public `GET /charges/:id` is the cheapest
   route). Revisit only if day-30 shows conversion is what's broken.
7. **Cute slugs** (Konrad, 2026-07-28) — `roomSlug()` currently appends six
   Crockford base32 characters, so a room reads `ski-trip-x7k2m9`. The link is
   the thing people paste into a group chat and read aloud in a bar; it should
   look like a place, not a hash: `ski-trip-brave-otter-lamp`.

   **The constraint that decides the design: the slug IS the credential.** It is
   the room's only access control, it is redacted from telemetry (`lib/redact.ts`)
   and it is deliberately kept out of the shared recap URL. So cuteness must cost
   zero entropy, and the arithmetic is unusually kind here — 32⁶ and 1024³ are
   the *same number* (1,073,741,824). **Three words from a frozen 1,024-word list
   is an exact swap for the current tail**, no security argument needed beyond
   pointing at that identity. Two words is not: even a 4,096-word list gives
   16.8M, a 64× weakening of a credential that sits in URLs and chat logs.

   It is also an upgrade on the property `slug.ts` already cares about. The
   comment says Crockford base32 was chosen so the tail is "unambiguous when read
   aloud or typed from a screenshot" — words dodge the i/l/o/u problem entirely
   rather than routing around it.

   What the work actually is: curate and freeze the list (concrete, picturable
   nouns and adjectives; no profanity, no unfortunate adjacent pairs, and screened
   against es-419 and pt-BR now that the product is trilingual), then swap
   `randomTail()`. Keep the crypto RNG and the modulo-free selection — 1,024 is a
   power of two, so a masked 10-bit draw stays uniform exactly as the byte mask
   does today.

   Cheap, and self-contained: `apps/web/src/server/slug.ts` is the only place
   slugs are minted (callers: `server/rooms.ts`, `server/splitwiseImport.ts`).
   No migration — existing rooms keep the slugs they were issued, since this
   changes minting and not resolution. The main real cost is length: the URL
   grows by roughly ten characters, which matters most on the OG unfurl and in a
   QR code, and not at all in a pasted link. Pairs naturally with item 3 (room
   themes) — both are "the room feels like a place" work.

## Design roadmap (opened 2026-07-28)

Split shipped fast and looks it: emoji where drawings should be, a Knerd headline
nobody can read at three words, labels stacked above inputs, and a footer that is
four grey links in a row. This section is the visual pass, taken from Munin's
line — the same hand-drawn stroke set, run through the same seeded roughening
build — kept in Peanut's colours (`primary-1` yellow, `secondary-1` pink for the
Peanut mark only, cream `background`).

Order below is execution order, not importance. Status per item.

1. **Doodles as icons, emoji gone.** — *status: shipped 2026-07-28*
   Port `rough.py` and the `build.py` → generated-set pipeline from
   `munin/design/raven-doodles/`. Clean geometry in a 32-unit box, stroked at
   ~1.4–2px, `fill: none`, `stroke: currentColor`, so a drawing inherits the ink
   of whatever it sits in and needs no second asset per theme. Output is a
   TS map (`name → path`) plus a `<Doodle>` component. Everything currently
   carrying an emoji — the sixteen room emojis, the settle methods, the feature
   grid, the use-case cards — draws instead. Legibility floor learned in Munin:
   below about r2.5 a loop fills in and reads as a full stop.

2. **Footer and sitemap.** — *status: shipped 2026-07-28*
   Real Peanut logo rather than the word set in `font-display`, and the
   structure peanut.me uses: named columns, not a single row of grey links.
   Every static page Split has should be reachable from it.

3. **Language picker placement.** — *status: decided 2026-07-28 — stays in the footer, see below*
   RULED: it stays in the footer, but as a compact three-word row in the bottom
   bar rather than the full-width segmented control it was — which was the
   largest single control on the page, sitting at the very bottom of it.
   No mockup round, because the premise was wrong. Locale is already resolved
   server-side from the cookie and then `Accept-Language`, so a Portuguese
   speaker arrives in Portuguese without touching anything. The switcher is not
   the way in, it is the correction path for the minority the header guesses
   wrong — and a correction path is exactly what a footer is for. Putting it in
   the hero would cost fold space to a control most people never need, and Split
   has no header bar on the LP to put it in without inventing one.

4. **Room doodle auto-picked from the name.** — *status: shipped 2026-07-28*
   A keyword table maps what someone types ("ski", "esquí", "pizza", "airbnb")
   onto a drawing, so the room already looks like itself before anybody opens
   the picker. All three locales in one table, falling back to the peanut.
   Wired through `lib/room-emblem.ts`: the `emoji` column holds a doodle name for
   new rooms and an emoji character for every room made before the swap, and both
   are valid forever — no migration, because a rewrite could only guess which
   drawing somebody meant by 🎿. A value is a doodle if the generated set has that
   name, which is unambiguous since emoji are pictographic and doodle names are
   lowercase ASCII. `RoomEmblem` is the single render seam; `og/emblem.ts` builds
   the unfurl's image locally from the path data. Known legacy emoji resolve to
   their matching doodles and unknown stored values fall back to the peanut; text
   metadata and notifications omit the emblem entirely rather than reintroducing
   a device-specific glyph.

5. **Currency list, readable and friendlier.** — *status: shipped 2026-07-28*
   `🇧🇷 R$ BRL — Brazilian Real` is four encodings of the same fact in one line.
   Draw the symbol, show three or four currencies, and put the rest behind a
   "more" step.

6. **Knerd is for one or two words.** — *status: shipped 2026-07-28*
   The display face has no accented glyphs and no lowercase worth reading; at
   three words it stops being a headline and becomes a texture. Cap it, and set
   the rest in the body face.

7. **Inline the field labels.** — *status: shipped 2026-07-28*
   "What are you splitting" above an empty box becomes `Ski trip…` inside it.
   Halves the vertical space the form takes, which is what puts the button above
   the fold on a 390px screen.

8. **Cut superfluous copy.** — *status: first pass shipped 2026-07-28*
   Cold-read UX pass over every marketing surface; delete the lines that restate
   the line above them.

9. **A `(?)` affordance instead of a sentence.** — *status: shipped 2026-07-28*
   The slug preview and "How the link works" currently take two lines and a
   underlined link. One small drawn `(?)` beside the preview opens the same
   sheet.

10. **The form IS the first fold.** — *status: shipped 2026-07-28*
    Drop the yellow pitch band above the form and give the form the yellow
    instead, with enough weight that it reads as the subject of the page rather
    than a widget under a headline.

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
- SSE fan-out and the per-room scan quota are per-container (in-memory); a
  second replica halves poke delivery and doubles the quota. Single-replica by
  assumption; the fix is Postgres LISTEN/NOTIFY + a shared store, not caps.
- `useDeleteSettlement` (lib/queries.ts) is an exported mutation hook with no
  caller (pre-dates wave 3).
- `equalSplitMinor` (lib/money.ts) and `equalShares` (server/split.ts) are
  documented as "the same rule" with nothing pinning them — a two-line
  agreement test would close it.
- The SSE route's sink late-binding could be a `TransformStream` (simpler, real
  backpressure) — worth doing next time the file is open, not before.
- No unused-export/unused-key lint (`knip` or similar) — dead exports
  accumulate silently; wiring one in is the cheap permanent fix.
- `all_settled` fires (analytics + would-be push) for a solo room whose only
  expense nets to zero — harmless (push skips with no targets) but the event
  is semantically noisy for single-member rooms.
