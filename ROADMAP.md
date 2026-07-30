# Roadmap — peanutsplit

The engineering backlog and feature map, so nothing lives only in a chat session.
Product status/milestones/decision log stay in the Notion project (linked from
`mono/projects/peanut-split/`); this file is what's built, building, queued, and
deliberately not built — with enough context to pick any item up cold.

Owner of record for each open item is in brackets. Last full update: 2026-07-29.

## V1 hold — receipt scanning

The scan implementation remains in `src/components/room/scan/` for a future
stabilization pass, but its expense-drawer entry point is intentionally hidden
in v1. A real-device post-scan review could become unresponsive while the
underlying drawer remained reachable. Re-enable only after the image-decoding →
review → assignment portal lifecycle has a mobile regression test and a
real-device pass. Typed quick-add remains available.

**Owner: Konrad.** Decided 2026-07-28 (Hugo): the v1/v2 boundary —
`splitV2Enabled()` and everything behind it (scan, NL entry, Splitwise import)
— is Konrad's call to flip, and nobody else's. The flip itself is one Dokploy
build arg on the web app (`NEXT_PUBLIC_SPLIT_V2_ENABLED=1`) plus a redeploy —
the marketing surface is already flag-aware and starts claiming the features
on its own.

**Status 2026-07-28, second pass.** The tap trap was root-caused and fixed, and
the entry point now renders behind `splitV2Enabled()` — the flag itself has NOT
been flipped and that decision stays with Konrad. Three defects made the one
symptom, all of them in how a `document.body` portal coexists with a modal Radix
layer:

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
all nine viewport probes landing outside the overlay. **A real-device pass is
still outstanding** and is the remaining half of the written condition.

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

Recommended first package: **`WRAPPED + CREW + ALTER-EGO + PASSPORT`**. Build
these on one reusable achievement-card system, then add the remaining moments
only when share telemetry demonstrates demand.

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
7. ~~**Cute slugs**~~ — shipped 2026-07-30: a room now reads
   `ski-trip-brave-otter-lamp`. Three words from a frozen 1,024-word list, an
   exact swap for the six Crockford base32 characters because 32⁶ and 1024³ are
   the same number. Rooms minted before it keep their tails; nothing reads the
   tail's shape. The word list and how it was screened live in
   `apps/web/src/server/slugWords.ts`.

   Left open: the landing hero still previews the tail as six dots (`-••••••`),
   which was the old tail's width. It should show three groups, and the line has
   no wrap or truncate rule, so the change needs a look at 375px first.

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

**Queued (finish the visual, don't resurrect the download):** [Konrad]

- The room-card SVG (`roomShareVisual`) still rides along in native share as an
  attached file where `canShare` accepts it. If the card should survive as a
  visual, render it to PNG (offscreen canvas) so messengers accept it, and
  re-add the e2e geometry test that was deleted with the download path
  (title-vs-doodle clearance; it lived in `e2e/landing.spec.ts`, use the share
  payload file instead of a download to capture the markup).
- Decide whether `share_completed` needs a `card` method once the PNG path
  exists.

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
