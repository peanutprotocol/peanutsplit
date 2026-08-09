# Roadmap — peanutsplit

The engineering backlog and feature map, so nothing lives only in a chat session.
Product status/milestones/decision log stay in the Notion project (linked from
`mono/projects/peanut-split/`); this file is what's built, building, queued, and
deliberately not built — with enough context to pick any item up cold.

Owner of record for each open item is in brackets. Last full update: 2026-08-05.

## Code-complete 2026-08-09 — domain cutover to split.peanut.me [Hugo]

- App moves to `split.peanut.me`; `peanutsplit.com` becomes a redirect shell for
  app paths (302 now, 301 later) and keeps serving marketing. Host-aware
  redirects live in `src/proxy.ts` over the pure table in
  `src/lib/cutover-redirects.ts`; device state (`ps:*` localStorage) crosses
  origins through the `/handoff` postMessage bridge, write-if-absent; an
  installed legacy PWA gets a dismissible reinstall banner. Inert everywhere but
  the two production hosts, so the code ships safely ahead of DNS. Decision
  record: `apps/web/docs/SEO-DOMAIN-DECISIONS.md` (2026-08-09 update). Old-origin
  service-worker retirement ships separately.

## Code-complete 2026-08-06 — exact-zero Former-member lifecycle

- A used active member whose authoritative room-currency balance is exactly zero
  can now be marked Former without deleting any ledger or social history. The
  room-locked transition keeps at least one active person, invalidates the old
  identity proof, drops push, writes audit history, and has short Undo plus
  durable same-ID reactivation with token rotation.
- New activity, identity, counts, and share art use the active roster. History,
  exports, recap, balances, and settlements use the full ledger directory.
  Historical corrections can reopen a Former balance and keep it settleable.
- Open money forms survive identity recovery. Offline expenses blocked by a
  membership change remain durable until reviewed: role remapping preserves
  exact amounts/weights and per-room ordering; only Retry success or explicit
  Discard removes the draft.

**State:** code-complete on `qa/qa-sesh-former`; production verification and
deployment remain separate release gates. Canonical invariants are in
[`member-removal-design.md`](./member-removal-design.md).

## Code-complete 2026-08-04 — append imports to an existing room

- Room settings now opens `/r/[slug]/import`, where a reviewed Splitwise or
  Split Pro export can be appended without replacing the room link, currency,
  roster, or existing ledger. Source people must be mapped one-to-one to an
  existing person or to a new provisional person created atomically with the
  expenses. The global `/import` create-a-new-room flow is unchanged.
- Each successful append gets an immutable `ImportBatch`, a server timestamp,
  and millisecond-distinct expense timestamps. A room-scoped canonical source
  fingerprint makes exact and concurrent retries successful no-ops while
  allowing genuinely different imports into the same room. Changed exports are
  appended in full; the review warns that partially overlapping history can
  therefore duplicate because the supported source projections have no stable
  expense IDs.
- The append path uses the ordinary exact-money/FX builder inside one
  room-locked transaction and emits one audit/realtime event only after a real
  commit. PostgreSQL integration coverage includes populated-ledger
  preservation, rollback, concurrency, replay, missing-room refusal,
  target-currency conversion, audit attribution, precise ordering, and rooms
  whose existing roster already exceeds the per-file 20-person parser cap.

**State:** code-complete on `feat/import-existing-room`; production verification
and deployment remain separate release gates.

## User-visible — receipt scanning

The camera/gallery scanner is live in public production.
Its expense-drawer entry point is the small camera/sparkle action inside the
amount row; opening it requests the camera immediately and keeps upload in the
bottom pullup. An installed Android PWA also advertises an image-only share
target, so a receipt can be sent from Photos, Gallery or Files directly into a
room's scanner. That OS route intentionally bypasses the provider-terms note on
the camera screen; Konrad accepted that product trade-off on 2026-08-05.

**Owner: Konrad.** Decided 2026-07-28 (Hugo): the v1/v2 boundary —
`splitV2Enabled()` and everything behind it (scan and Splitwise import)
— is Konrad's call to flip, and nobody else's. Konrad explicitly requested the
production activation on 2026-08-05. The release Dockerfile now bakes the flag
on so an absent or stale Dokploy build arg cannot silently keep the public
artifact dark; rollback is a source revert plus the ordinary main deploy.

**Historical status 2026-07-28, second pass.** The tap trap was root-caused and
fixed while the flag remained off. Three defects made the one symptom, all of
them in how a `document.body` portal coexists with a modal Radix layer:

1. The expense drawer is a modal Radix layer, so while it is open Radix sets
   `document.body { pointer-events: none }` and re-enables pointer events only
   inside its own content. The scan overlay is portalled to `document.body` (it
   must be — vaul transforms the sheet, and a `position: fixed` child of a
   transformed ancestor is positioned against that ancestor), so it was a
   sibling of that content and inherited `none`: drawn on top, taking no taps,
   with every tap falling through to the live drawer underneath. Fixed with
   `pointer-events-auto` on the overlay root.
2. Radix decides "outside" by containment, so the first tap that DID land was an
   outside interaction and dismissed the drawer — which clears the URL state,
   so the reviewed bill came back to a sheet that no longer existed and took the
   user's form with it. Fixed by vetoing that one interaction by TARGET
   (`onPointerDownOutside` on `DrawerContent`), not by a state flag: Radix
   dispatches it on the click after the pointer-down, by which time any
   `scanFile`-shaped guard has already cleared.
3. The read could deadlock before the review ever appeared. A ref that
   remembered "already scanned this file" meant a remount cancelled the first
   read and skipped the second, leaving "Reading the bill…" forever. Fixed by
   memoising the PROMISE rather than a flag — one vision call per photo, and
   whichever run is alive applies it.

The mobile regression test is `apps/web/e2e-v2/scan.spec.ts`, run with
`pnpm --dir apps/web e2e:v2` against its own flag-on dev server
(`playwright.v2.config.ts`, port 3101 — a build-time flag cannot be a project in
the v1 config, and the v1 suite asserts the absence of what this one drives).
Verified as a real gate: reverting the `pointer-events-auto` fix fails it with
all nine viewport probes landing outside the overlay.

**Release verification 2026-08-05.** The rebased flag-on dark suite passes all
13 Chromium journeys. It covers camera lifecycle and upload fallback, modal
focus/inert ownership, retry and cancellation, Back/Forward symmetry,
contextual receipt-row names and post-delete focus, draft-only handoff, and the
single ordinary expense write. A flag-on production Docker build is also a CI
gate.

**Activation hardening 2026-08-05.** OpenRouter requests now require providers
with data collection denied and zero data retention. Direct Gemini stays
disabled unless the operator explicitly confirms paid-tier handling. The API
accepts at most two scans concurrently, before body reading, and the prepared
image ceiling is 4 MiB. The installed Android app now advertises an image-only
Web Share Target on the same build-time flag as the scanner. Commit `3d02268` is
live, its public capability probe answers `enabled: true`, and a synthetic
two-line EUR receipt passed the production provider/proxy path with the exact
total while leaving the QA room with zero saved expenses. Real iOS/Android
camera, permission, rotation and background lifecycle verification is still
required before the capability can be called production-verified.

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
- **Web-push backend (live since 2026-07-29 — VAPID + proxy are set in prod;
  the two-device loop below is still unexercised):** subscriptions bound to proven members
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
- **Push UI** — gated by VAPID build args: six-state push opt-in row (never
  burns iOS's permission one-shot), token-proven subscribe with rollback on
  server failure.
- **Infra** — `split-egress` squid pinhole live on the box and verified
  (push gateways and configured model providers only, port 443 CONNECT,
  everything else 403); VAPID keys set as runtime env; all `NEXT_PUBLIC_*`
  build args now have Dockerfile ARG/ENV pairs (the missing PostHog pair was
  found and fixed — a configured build arg the Dockerfile doesn't declare is
  silently dropped).

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

## Shipped 2026-07-28/29 overnight (Konrad)

- **Hardening wave** — request-body caps on all JSON routes, serialized
  settlement decisions / joins / push caps, idempotent money retries,
  non-negative exact-share reconciliation, offline-queue lease + bounded
  retries, cross-tab offline recovery, stale-ledger mutation guards, payer
  tokens kept off the organizer's device, analytics contract made literally
  identifier-free, join gate given real dialog semantics.
- **Landing rework** — the room link as the landing-page story, approved copy
  pass, doodle-native design system, marker testimonial portraits, and the
  group-chat handoff shipped from `feat/pass-the-link-landing`.

## Shipped 2026-07-29, product-audit wave

- **CSV + JSON export** — download the room's ledger from room settings:
  members, expenses, exact shares, frozen FX, settlements (with the optional
  Peanut receipt link), balances and suggested transfers. The room slug is
  never embedded in the files; free-form fields are escaped so spreadsheets
  treat them as text, not formulas. A plain warning states that anyone with
  the room link can export. Round-trip tests prove exported balances match
  the room.
- **Audit fix wave** — atomic payer creation with pristine-identity cleanup,
  documentary receipt links on Peanut settlements, locale-safe amount parsing
  (rejects `0,123`-style pseudo-grouping), landing continuity (paste a room
  link to re-add it, manageable recent rooms), one reduced-motion policy,
  release-state vocabulary in `docs/release-states.md`.

## App icon — shipped 2026-07-30

**This work is finished. Nothing about the icon is open.**

Split used to run the Peanut mascot on brand yellow, inside a white disc, inside
a bordered rounded square. The mascot's own colour was 4.0% of the 512px file, so
it was a smudge at launcher size and gone at 16px — and it was Peanut's mark, on
a home screen that holds both apps.

Konrad drew the replacement: a thumbs-up on a black-ringed pink disc
(`primary-1` `#FF90E8`). Shipped with it:

- `apps/web/src/assets/logos/split-mark.svg` — the artwork. Two ids the
  generator depends on: `ground` (the disc) and `mark` (the thumb).
- `apps/web/scripts/generate-icons.mjs` (`pnpm icons`) draws it two ways.
  **disc** — the mark as designed, ring against the frame, transparent outside —
  for everything that takes a transparent PNG: launcher, install prompt, tab.
  **flat** — disc dropped, its pink filling the tile, thumb inside the safe zone
  — for everything a platform masks into a square: Android maskable, iOS
  apple-touch. A mask eats an edge ring first, which is why those two differ.
- `src/app/favicon.ico`, which never existed. Disc at 32 and 48, flat at 16,
  every size rendered rather than downscaled. The old `src/app/icon.png` was a
  byte copy of the 192 launcher icon; it now has its own art.

Two decisions, both Konrad's, both closed:

- **The theme colour stays Peanut yellow** (`#FFC900` in `manifest.ts` and in
  `layout.tsx`'s viewport). The icon carries the distinction from Peanut on its
  own. Do not follow the icon to pink.
- The five drawn peanut candidates that preceded the logo are deleted. They were
  exploration, and the logo answered the question.

Gate at `a6c5479`: typecheck clean, prettier clean, 1118/1118 tests pass.

## To light up (remaining gates)

Done 2026-07-28 and verified live: the `split-egress` squid pinhole (allowed
CONNECT-443 to push gateways and configured model providers, everything else
403), VAPID keys + proxy URL as runtime env, all build-arg ARG/ENV pairs, and
PostHog events confirmed arriving in project 234225 from a real prod session.
NEVER rotate the VAPID pair in place — every subscription dies silently; a
rotation needs a dual-key window.

Still gated:

- **Push exercise** [next session]: infra + UI are live; nobody has completed a
  real two-device subscribe→notify loop in prod yet. Run one before telling
  users about it.

## Deferred until demand or measured scale — decision 2026-08-04

Peanut Split is an experiment with almost no users. Do not build production
machinery for hypothetical scale. Reopen these items only at the stated trigger.

- **Deployment gates and deploy-failure automation:** `main` must deploy
  directly. Revisit gates or a release-control project at tens of thousands of
  users, or after repeated missed failures make the cost real.
- **Anonymous room management:** a separate capability could rotate a share
  link or delete a room without accounts. Keep this as an idea until roughly
  1,000 rooms, product-market fit, a real user request or a legal obligation.
  Review mockups before adding the flow. This deferred idea does not authorize
  schema fields, states, routes, guards or other scaffolding before the item is
  reopened and approved for implementation.
- **Scale machinery:** defer distributed quotas, data retention and
  partitioning, full CSP enforcement, a blocking browser matrix on every
  deployment, multi-replica realtime, database-wide integrity redesign and full
  telemetry. Reopen at roughly 1,000 rooms or when measurements show the
  specific bottleneck.
- **Firefox mobile test harness:** the 2026-08-04 focused run passed 20/23. The
  three remaining failures are not credible product regressions in the current
  setup: one times out resizing the viewport before navigation, one misses a
  synthetic slide gesture and one misses a synthetic long-press. The project
  currently spreads Playwright's iPhone 14 descriptor and then overrides only
  `browserName` to Firefox, even though Firefox does not support Playwright's
  mobile emulation. Before claiming Firefox mobile coverage, use the native
  Desktop Firefox descriptor with an explicit narrow viewport, separate
  synthetic gesture tests from the semantic journeys, and spot-check the two
  gestures on a real Firefox device. Reopen before browser CI becomes a gate or
  when Firefox-specific user demand makes the coverage valuable.

## Deferred product-direction decisions — merge audit 2026-08-04

The post-merge audit found five surfaces where separate releases now express
different product directions. Do not resolve these as incidental bug fixes.
Reopen each item in a product review with mobile mockups and the evidence named
below.

- **Yellow or pink as the primary brand field:** the design system assigns
  yellow to primary actions and fields. It reserves pink for Peanut attribution
  and rare delight. The default landing hero instead uses pink as its full
  primary field. Decide which rule owns marketing surfaces before the next
  landing redesign or wider brand review.
- **Operational import or acquisition journey:** `/app` is the accountless
  operational home, but its Import action opens the indexed `/import` marketing
  page. Decide whether app users need a focused import shell or whether one
  acquisition route should serve both contexts. Reopen before adding another
  app-home tool or when import funnel data shows a navigation cost.
- **Room scope or device scope in settings:** the room-coloured card groups
  shared room settings with device-local push and identity controls. A separate
  “This device” row sits below it. Decide whether the sheet groups by room
  context or by who can see each change. Reopen before adding another setting
  or after a user reports a scope surprise.
- **Discoverable reactions or a hidden gesture:** reactions are available by a
  long-press, while the explicit reaction control appears only on keyboard
  focus. Decide whether reactions are a visible social feature or an optional
  discovery. Reopen when reaction use can be measured or before adding another
  gesture-only action.
- **Return to the ledger or continue importing:** after an existing-room import,
  “Import another file” is primary and “Go to room” is secondary, despite the
  duplicate-history warning. Decide whether repeat batch import is the main
  workflow. Reopen after initial import usage or before the next importer pass.

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

**Wave 3.5 (PWA deepening) — shipped 2026-07-30**, except the real-device
passes below. The installed app is called Split rather than the repo's name;
the launcher carries shortcuts; the install row lives permanently in settings
with one owner for the `beforeinstallprompt` event and five honest states; and
an app badge is raised when a push arrives for a device that was away. A
receipt-photo OS share target is now advertised to installed Android PWAs. Its
provider-terms-screen bypass was explicitly accepted; physical OS share-sheet
and killed-app lifecycle verification remain open.

Still open, and NOT closed by any automated check:

- **Real-device install pass** [Konrad] — the install row, the shortcuts, the
  iOS Safari sheet and the splash have been driven headless only. Chromium's
  `beforeinstallprompt` and iOS's absence of it are exactly what a headless run
  cannot tell you apart.
- **Real-device share-target pass** [Konrad] — an OS share sheet handing a photo
  to an installed PWA cannot be exercised from Playwright at all.
- **Push exercise** — unchanged, see "To light up" above.
- An OS share is parked in this device's Cache Storage while Split chooses a
  room. Reads reject it after 10 minutes and the next app boot collects an
  expired entry, but Cache Storage cannot physically self-delete while the PWA
  never runs again. A killed-app retention check remains part of the Android
  lifecycle gate.

## Achievement and shareable moments (proposed 2026-07-29)

Goal: maximize organic sharing without turning money into a leaderboard or
leaking a room credential. There are two distinct loops:

- **Private acquisition:** a useful room-link share into the group chat recruits
  the people who belong in that room.
- **Public expression:** a redacted image card lets somebody celebrate the trip,
  their crew or their alter ego without granting access to the ledger.

The existing pieces are enough for a focused first pass: persisted member
personas, expense and settlement attribution, reactions, currencies and dates,
the all-settled celebration, the recap renderer, native file sharing and push.
Do not build a separate global profile while Split remains accountless.

Every achievement should have the same three surfaces:

1. **Immediate:** one short in-room celebration when the threshold is crossed.
2. **Persistent:** an achievement shelf in the existing ongoing/final recap.
3. **Shareable:** a branded image handed to the native share sheet. Public
   variants hide money and names by default.

Ranked moments, by expected share desire, recipient conversion, eligibility and
social safety:

1. **`WRAPPED` — end-of-trip story deck.** Expand the settled recap into three
   to five individually shareable cards: result, group stats, currency passport,
   alter-ego cast/personal award, and the clean landing. Reuses the strongest
   emotional moment and the existing recap pipeline. Recommended first.
2. **`CREW` — crew assembled.** Celebrate meaningful roster thresholds (3, 5,
   8, 12), show the persona lineup, and offer the existing invite link with copy
   such as “The crew is five strong. Who is missing?” This is the strongest
   direct acquisition loop; do not fire on every join.
3. **`ALTER-EGO` — positive personal awards.** One signature role per member
   and trip, starring their persona: Trip Starter, Ledger Legend, Currency
   Hopper, Hype Crew, The Closer, or First Mover. Award contribution and
   coordination, never debt, spending power or payment speed.
4. **`PASSPORT` — multi-currency milestones.** Celebrate 2, 3 and 5 currencies
   with a stamp-style card: “Three currencies. One clean split.” Strong for
   travel identity and safe to share without amounts.
5. **`RESCUED` — Splitwise import victory.** On successful import, celebrate
   the number of expenses and people brought over with balances intact. This is
   narrow but a sharp switching/acquisition story.
6. **`TAMED` — expense-count milestones.** Mark 10, 25, 50 and 100 saved
   expenses with “25 receipts tamed.” Celebrate bookkeeping completed rather
   than money spent; no push for routine thresholds.
7. **`CLEAN-LANDING` — settlement result.** Share a factual coordination card
   such as “Seven people. Three payments. All square.” Do not claim transfers
   were “saved” without a defensible counterfactual.
8. **`GROUP-LORE` — crowd-favourite expense.** A row that earns at least five
   reactions becomes group lore. Its description stays group-only unless the
   sharer explicitly includes it in the external card.
9. **`UP-TO-DATE` — prompt logging.** A quiet badge for several days of expenses
   entered close to their expense dates. Lower priority: useful habit, but the
   definition must not reward spending every day or punish a quiet trip.
10. **`FIRST-SPLIT` — first successful room handoff.** A creator-only onboarding
    moment once another person joins their first locally remembered room. Cheap,
    but less expressive than the group achievements above.

Recommended first package: **`WRAPPED + CREW + ALTER-EGO + PASSPORT`** —
**shipped 2026-07-30.** Six cards come off one frame behind a single metered
route (`/r/<slug>/card/<kind>`), achievements are read from what the room
already holds rather than from a new table, and every unlock has the three
surfaces above: the in-room moment, the recap shelf, and a PNG handed to the
share sheet. The remaining moments (`RESCUED`, `TAMED`, `CLEAN-LANDING`,
`GROUP-LORE`, `UP-TO-DATE`, `FIRST-SPLIT`) stay queued behind share telemetry,
as planned.

Known items carried out of that wave:

- On a settled recap the deck and the shelf both drew PASSPORT and ALTER EGO.
  Fixed 2026-07-30 by standing the shelf down on whatever the deck draws — a
  reversible product judgment, see `shelfKinds` in `achievements-contract.ts`.
- `/r/<slug>/opengraph-image` has a pre-existing 80-character name overflow.
  It predates this wave and is NOT a card-route bug, but the fix has a
  seven-consumer blast radius (every OG surface shares the name-fitting path),
  so it wants its own pass rather than a patch inside this one. [Konrad]
- `ART_BY_KIND` reads like a dispatch table and is not one — the route picks
  art by kind directly. It is live as a completeness check (a seventh kind
  fails the card test through it) and dead as a dispatcher. Leave it or rename
  it; do not "wire it up".

The current file-share path is privacy-safe but not clickable. A later
**`CAPSULE`** phase can mint an optional, revocable, immutable and read-only
public achievement URL under a second random token. It must have no route back
to the writable room, must never contain the room slug, and must default to no
names or amounts. Its only action is “Start your own split.” This is the
external conversion multiplier, but it is a separate privacy/product decision,
not something to smuggle into the card implementation.

Guardrails:

- No daily spending streaks, biggest-spender badges, debtor rankings, fastest-
  payer awards, or public descriptions by default.
- Never share `/r/<slug>` outside the intentional private invite flow; the slug
  remains the room credential.
- One share prompt per meaningful milestone/session. Unlocks may accumulate in
  the recap shelf without interrupting the ledger.
- Track `achievement_seen`, `achievement_share_opened` and
  `achievement_shared` with achievement type and delivery tier only. Preserve
  the existing analytics rule: no slug, member, description, amount or currency.

Remaining candidates, ordered by expected value per effort:

1. ~~**Trip recap share card**~~ — shipped 2026-07-28, see above. Numbering
   left alone so the other items keep the IDs they were discussed under.
2. **Bill photo → itemized split** — snap a receipt, a vision model itemizes,
   assign items to people. Splitwise paywalls OCR; this is the sharpest "all
   premium features free" attack. Needs: one more allowlisted egress host + an
   API key + capture/itemize/assign UI. A real build, not a button.
3. **Room themes** — user-picked palette/motif (today hash-derived), which also
   themes the OG unfurl. Small.
4. **Expense reactions** — tap-to-react emoji on expenses. Social warmth with
   no chat surface. Small.
5. ~~**CSV export**~~ — shipped 2026-07-29 (audit wave, below): CSV + JSON
   download from room settings.
6. **Verified settle receipts** — reopens the 2026-07-27 decision (Peanut emits
   no signed charge webhook; polling public `GET /charges/:id` is the cheapest
   route). Revisit only if day-30 shows conversion is what's broken.
7. ~~**Readable, strong room links**~~ — updated 2026-08-04: a room keeps the
   readable name stem and appends a 128-bit opaque base64url capability, for
   example `ski-trip-R7LxQ3TBJV_uQ2PMhzc8rw`. This replaces the 30-bit
   three-word tail for new rooms. Existing three-word and six-character links
   still resolve so issued links do not break.

   The hero, pass-the-link stage and proof rail read one `SLUG_TAIL_HINT`
   constant. They show a short opaque run so the readable stem remains visible
   at 375px. The share screen shows and copies the complete link.

   Left open, found in review: the settings link row now ellipsises. Its
   `truncate` is load-bearing — `SettingRow.tsx` documents the overflow it fixed
   — so the row hides the end of the tail, which is the part that identifies the
   room. Copy and share are unaffected, and `LinkMoment` still shows the whole
   link because it wraps with `break-all`. Truncating from the middle would show
   both ends; that is a design call, not a bug fix.

## Design roadmap (opened 2026-07-28)

Split shipped fast and looks it: emoji where drawings should be, a Knerd headline
nobody can read at three words, labels stacked above inputs, and a footer that is
four grey links in a row. This section is the visual pass, taken from Munin's
line — the same hand-drawn stroke set, run through the same seeded roughening
build — kept in Peanut's colours (`primary-1` yellow, `secondary-1` pink for the
Peanut mark only, cream `background`).

Order below is execution order, not importance. Status per item.

1. **Doodles as icons, emoji gone.** — _status: shipped 2026-07-28_
   Port `rough.py` and the `build.py` → generated-set pipeline from
   `munin/design/raven-doodles/`. Clean geometry in a 32-unit box, stroked at
   ~1.4–2px, `fill: none`, `stroke: currentColor`, so a drawing inherits the ink
   of whatever it sits in and needs no second asset per theme. Output is a
   TS map (`name → path`) plus a `<Doodle>` component. Everything currently
   carrying an emoji — the sixteen room emojis, the settle methods, the feature
   grid, the use-case cards — draws instead. Legibility floor learned in Munin:
   below about r2.5 a loop fills in and reads as a full stop.

2. **Footer and sitemap.** — _status: shipped 2026-07-28_
   Real Peanut logo rather than the word set in `font-display`, and the
   structure peanut.me uses: named columns, not a single row of grey links.
   Every static page Split has should be reachable from it.

3. **Language picker placement.** — _status: decided 2026-07-28 — stays in the footer, see below_
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

4. **Room doodle auto-picked from the name.** — _status: shipped 2026-07-28_
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

5. **Currency list, readable and friendlier.** — _status: shipped 2026-07-28_
   `🇧🇷 R$ BRL — Brazilian Real` is four encodings of the same fact in one line.
   Draw the symbol, show three or four currencies, and put the rest behind a
   "more" step.

6. **Knerd is for one or two words.** — _status: shipped 2026-07-28_
   The display face has no accented glyphs and no lowercase worth reading; at
   three words it stops being a headline and becomes a texture. Cap it, and set
   the rest in the body face.

7. **Inline the field labels.** — _status: shipped 2026-07-28_
   "What are you splitting" above an empty box becomes `Ski trip…` inside it.
   Halves the vertical space the form takes, which is what puts the button above
   the fold on a 390px screen.

8. **Cut superfluous copy.** — _status: first pass shipped 2026-07-28_
   Cold-read UX pass over every marketing surface; delete the lines that restate
   the line above them.

9. **A `(?)` affordance instead of a sentence.** — _status: shipped 2026-07-28_
   The slug preview and "How the link works" currently take two lines and a
   underlined link. One small drawn `(?)` beside the preview opens the same
   sheet.

10. **The form IS the first fold.** — _status: shipped 2026-07-28_
    Drop the yellow pitch band above the form and give the form the yellow
    instead, with enough weight that it reads as the subject of the page rather
    than a widget under a headline.

## Landing-page follow-up backlog (opened 2026-07-29)

Follow-up to the pass-the-link hero on `feat/pass-the-link-landing`. These are
queued improvements, not descriptions of the current shipped page. The bar is
the energy and responsiveness of peanut.me: Split should feel playful before
anyone has made a room, without turning the first fold into another product
mockup or pushing the real creation form out of reach.

1. **Remove the decorative utility header.** — _status: implemented on
   `feat/landing-follow-up` 2026-07-29_ — **[Konrad]**
   Delete the entire `PEANUT SPLIT` / `4 FRIENDS · 1 LINK` strip from the hero.
   Do not replace it with another slogan, navigation bar, or spacer. The
   headline, real room form, and group-chat handoff already identify and explain
   the product; the extra strip is visual housekeeping masquerading as content.

   **Done when:** the utility row and both strings are absent in every locale;
   its height is reclaimed rather than left blank; the headline, handoff, form,
   and primary CTA still fit the agreed desktop and mobile folds; the footer,
   document title, and metadata continue to identify Peanut Split.

2. **Run every UI icon through the doodle engine.** — _status: engine
   consolidated and source audit added on `feat/landing-follow-up` 2026-07-29;
   audit widened to all of `src` and every route swept in a browser at 375×667
   and 1280×800 on `feat/landing-sweep` 2026-07-30 — no stray icon found. Two
   items stay open: the 44px tap floor (below) and the real-device pass_ —
   **[Konrad]** Inventory the whole
   product, not only the landing page. Replace
   remaining library icons, emoji used as controls, hand-authored one-off SVGs,
   Unicode arrows/checks, and other interface glyphs with named drawings from
   the generated `design/doodles` → `doodles.ts` pipeline. The WhatsApp,
   Telegram, Messenger, and Messages marks around the new hero are included:
   move their geometry into the engine and render them through `<Doodle>`
   instead of keeping a parallel `MessagingDoodle` component. Third-party marks
   should remain recognisable but inherit Split's loose line and stroke weight.
   Photos, content illustrations, flags, and the Peanut wordmark are not UI
   icons and are outside this conversion.

   **Done when:** every route has been swept at mobile and desktop sizes; all UI
   icon call-sites share the typed doodle set and inherit `currentColor`; there
   is no second icon system left for new code to copy; tap targets remain at
   least 44px even when the drawing is visually smaller; a source-level audit
   catches new emoji, raw icon SVGs, or legacy icon-component imports.

   **Open — the 44px tap floor.** Six drawn controls measure under it: the
   reaction opener (28px) and each reaction option (32px) in `ReactionBar`, the
   copy-invite button (36px) in `ShareDrawer`, the character opener (20px tall)
   in `RoomHeader`, and the two full-width rows that are 20px and 33px tall. The
   obvious fix — an invisible hit area around each drawing — makes adjacent
   reaction targets overlap, so the wrong reaction gets picked. Growing the
   drawn control instead changes the density of the expense list. Konrad picks
   which trade the reaction row takes; the other four are safe to grow.

3. **Rewrite “How the link works” and make “free forever” consistent.** —
   _status: implemented with an enforceable copy audit on
   `feat/landing-follow-up` 2026-07-29_ — **[Konrad]** Rewrite `LinkExplainer` in plain, human
   language: short concrete sentences, one fact at a time, no synthetic
   reassurance, no repeated setup, and no copy shaped like an objection the
   page invented so it could answer it. Remove negative loss framing such as
   `If everyone loses it, the room is gone` (and the Spanish/Portuguese
   equivalents). Explain the positive behaviour instead: opened rooms stay
   listed on this device, the room travels through its group link, and Split
   records the maths without touching the money. Keep the access model honest:
   anyone with the room link can open the room.

   Audit every user-facing `free` / `gratis` / `grátis` claim across the product,
   landing copy, FAQ/read-more copy, metadata, alternatives, and editorial
   content. Whenever the claim is about Peanut Split, say **free forever** (with
   a natural equivalent in each locale), not merely “free.” Do not rewrite
   unrelated uses such as cash being fee-free or quoted competitor copy; record
   those deliberate exceptions so the audit stays enforceable.

   **Done when:** the explainer reads naturally aloud in en / es-419 / pt-BR;
   none of its headings lead with losing, failure, or a hypothetical worst case;
   the privacy and trust model remain factually exact; every Peanut Split price
   promise says “free forever”; catalog parity, content rendering, and the
   user-facing copy audit pass.

4. **Give the landing page the app's motion, sound, and haptic vocabulary.** —
   _status: first motion map and implementation complete on
   `feat/landing-follow-up` 2026-07-29; every automated contract re-verified
   against a production build on `feat/landing-sweep` 2026-07-30 — quiet on
   passive scroll, sound only after a gesture, complete final frame in both
   reduced-motion paths, no overflow, CTA in the fold at 375×667 and 390×844.
   peanut.me comparison and real-device feel
   pass pending_ — **[Konrad]** Start with a motion map rather than sprinkling
   unrelated loops over the page. Choreograph the room-link handoff, people
   joining, channel doodles arriving, proof scenes entering the viewport,
   doodles reacting, button press/squash states, FAQ opening, room examples, and
   the final CTA as one playful sequence. Benchmark the implemented feel
   directly against peanut.me on phone and desktop before sign-off.

   Reuse the product primitives: `useMotionAllowed()` and the
   `.reduce-animations` path for motion, and `useFeedback()` for sound/haptics.
   Haptics belong to real taps and successful actions, never passive scroll or
   autoplay; sound must begin only after a user gesture and continue to respect
   the existing sound setting. Prefer one-shot, causal motion with a readable
   final frame over perpetual background movement.

   **Done when:** the full page has intentional motion and feedback beats rather
   than only an animated hero; touch interactions feel alive on iOS and Android;
   hover/focus interactions have an equivalent desktop response; reduced-motion,
   animations-off, sound-off, and haptics-off modes all remain complete and
   quiet; there is no layout shift, horizontal overflow, blocked control, or
   below-fold primary CTA at the supported viewports; Playwright covers the
   reduced-motion and final-state contracts and a real-device pass covers feel
   and performance.

   Implementation map: `docs/landing-motion-map.md`.

## Share package cleanup (2026-07-29)

**Shipped:** the "Download room card" and "Download invite text" buttons are
gone from `LinkMoment`. Both were nonsense as shipped — a raw 1200×630 `.svg`
file and a two-line `.txt` file, verified with Playwright download interception.
No messenger accepts a pasted SVG, so the download dead-ended the handoff it
was supposed to help. The share drawer now has one primary action (native
share, which falls back to clipboard) plus the inline copy row and the
manual-copy textarea fallback. `SHARE_PACKAGE_METHODS` shrank to
`native | clipboard`; the five `room.link.download*` keys left all three
locales.

**Corrected 2026-08-06:** a private room invite is URL-first again. Its native
payload is localized text plus the exact room URL and never a PNG attachment;
some iOS share targets accept image + URL and silently deliver only the image.
The URL still has a room-specific 1200×630 visual through its existing
`/r/<slug>/opengraph-image` metadata route. Creation and room load proactively
warm that same-origin image, whose browser/shared-cache lifetime is five minutes
with a short stale-while-revalidate window. Preview failure never blocks the
room or the share. Public achievement/recap keepsakes remain a separate,
explicitly labelled image-only action with no URL, text or title in the native
payload. `share_completed` therefore stays `native | clipboard`; there is no
invite `card` method to add.

The empty-room hierarchy was corrected in the same pass: Share room remains the
sole primary share action until at least one real expense exists. A roster-only
CREW unlock waits rather than presenting a competing image-share moment before
the ledger has earned one.

**Queued — semi-done feature audit, remaining surfaces:** [Konrad]
A 2026-07-29 Playwright walk covered landing, room view, and the share drawer
before it was cut short. Not yet audited for label-vs-behavior gaps:
settle/balance drawers, member management, join flow on a fresh device, and
the PWA install surface. (`RecapShareButton` was checked in code and is
healthy — it shares a PNG; its download is a last-tier fallback, not a labeled
button.) Method that worked: drive each control headless, intercept
downloads/clipboard, and compare against the label's promise.

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

- **Private feedback retention scheduler:** report writes and every production
  container start delete `FeedbackReport` rows older than 90 days. Add a daily
  Dokploy/Postgres job using the same cutoff so the policy remains time-bounded
  even if a container runs for more than 90 days without a deploy or a new
  report. **Owner: Konrad. Done when:** the daily job is visible in operations,
  one deliberately expired canary row is removed, and screenshots, diagnostics,
  messages, and room snapshots are all covered by the same row deletion.

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
- SSE fan-out and the per-room scan quota are per-container (in-memory); a
  second replica halves poke delivery and doubles the quota. Single-replica by
  assumption; the fix is Postgres LISTEN/NOTIFY + a shared store, not caps.
- `useDeleteSettlement` (lib/queries.ts) is an exported mutation hook with no
  caller (pre-dates wave 3).
- **The content stylebook describes more gates than it has.** Found in review
  2026-07-30. `content.test.ts` really does enforce the counting rules and about
  six of §11.1's ~40 never-strings — a page saying `unlimited`, `fewest
transfers` or `live exchange rate` fails. The rest do not exist: a page can
  ship `truly seamless`, `world-class`, `split bills not friendships`, `any
currency`, `150+` or any es/pt-BR never-string and pass clean, and the
  em-dash cap, the co-presentation rule and the banned-concession-title rule
  are unenforced (the Tricount page carries 6 em-dashes against a cap of 3).
  Worse, `content.ts`'s `Frontmatter` has no `type`, `claims`, `cast` or
  `competitorClaims`, and `parseDoc` builds from an explicit key list — so
  those keys are silently DISCARDED and every §11.2/§11.3 rule keyed on them
  is unrunnable. Either implement them or mark those rows human-review-only; a
  rulebook that names a gate it does not have stops the next reviewer looking.
  The `_system/stylebook.md` header also links six files that do not exist in
  this repo, including the `intent-queries` list §6.15 says every FAQ question
  must come from — so no FAQ on the new pages is checked against anything.
- The competitor-claims register calls itself exhaustive but is missing a row
  for the `"tricount does the math for you"` quote the comparison page uses.
  The quote is verbatim (confirmed on tricount.com 2026-07-30); the register
  is what is incomplete.
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
