# Peanut Split — historical build spec

> **HISTORICAL BUILD SPEC — 2026-07-25. DO NOT IMPLEMENT VERBATIM.**
>
> This file preserves the overnight build brief and its reasoning. The current
> source, working rules, reviewed product decisions and
> [`docs/release-states.md`](../../../docs/release-states.md) supersede its
> imperative language. In particular:
>
> - room previews may contain the accepted member/expense/total context;
> - analytics are identifier-free — never send a slug or slug hash;
> - rooms remain accountless, trust-based bearer links;
> - user-uploaded room media and account claiming are not approved follow-ups.

## Mission

Accountless, link-based expense splitting — as good as Splitwise, free forever, no monetization.
It is an **acquisition funnel and exposure play** for Peanut (playful, high-trust fintech neobank).
Settlement happens anywhere (cash, bank, any app); Peanut is _one option among equals_ on the
settle screen. Trust and delight are the product.

**Hard guardrail (agreed):** Peanut appears in exactly two places — one settle option among
equals, and a quiet "powered by Peanut" mark. No interstitials, no nav tab, no un-dismissable
banners, no feature degraded to favor the Peanut path, manual settlement never framed as
untrustworthy.

## Product principles

1. **Zero friction:** no signup, no email, no KYC. Create room → share link → done. The room slug
   IS the credential (unguessable). Impersonation within a trusted circle is tolerated by design
   (category norm: Kittysplit, Splid).
2. **Legible maths:** every balance derivable on screen. Cents reconcile visibly. Never "trust us".
3. **The link is the product:** invite links, OG previews, and the share moment get first-class
   design.
4. **Anonymous:** identity lives in localStorage. Adding any login, ownership or
   account recovery system is a new product decision, not an implementation follow-up.
5. **Mobile-first PWA:** 390×844 is the design target; installable from day one; Capacitor-ready
   structure (no Node APIs in client code).

## Stack (locked)

| Layer         | Choice                                                                                                                                                                                                                                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework     | Next.js 16 (App Router) + React 19, TypeScript `strict`                                                                                                                                                                                                                                                          |
| Styling       | Tailwind CSS **3.4 + JS config copied from peanut-ui** (its 649-line `tailwind.config.js` holds the whole design system incl. `.btn-*`/`.shadow-*` component classes — copy, strip legacy aliases + dark mode, then diverge). postcss: `postcss-import` + `tailwindcss/nesting` + `tailwindcss` + `autoprefixer` |
| DB            | Postgres 16 + Prisma (BigInt columns for money)                                                                                                                                                                                                                                                                  |
| Data fetching | @tanstack/react-query v5; URL state via nuqs                                                                                                                                                                                                                                                                     |
| Motion        | `motion` (ex-framer), `@number-flow/react`, View Transitions API, `vaul` (sheets), `sonner` (toasts)                                                                                                                                                                                                             |
| Mascot        | Peanut animated WebPs copied from `peanut-ui/src/assets/mascot/` (no Lottie exists — `peanut-cheering.webp` = settle celebration, `peanut-waving-hello.webp` = landing/join, `peanut-thinking.webp` = empty states, `peanut-sad.webp` = errors)                                                                  |
| PWA           | `@serwist/next` (same as peanut-ui) + explicit `/manifest.webmanifest` route backed by `src/lib/pwa-manifest.ts`                                                                                                                                                                                                  |
| Avatars       | In-house non-human alter egos (animals, snacks, monsters), stable by member name until the room recasts them; no inferred human appearance or external avatar system                                                                                                                                              |
| i18n          | next-intl — locales `en`, `es` (es-419 tone), `pt-BR`                                                                                                                                                                                                                                                            |
| OG images     | `next/og` ImageResponse (satori, built in — no extra dep)                                                                                                                                                                                                                                                        |
| Tests         | vitest (unit: maths, fx, api handlers), Playwright (e2e)                                                                                                                                                                                                                                                         |
| Analytics     | PostHog (EU host, env-driven key) + Sentry (env-driven DSN) — both no-op when unset                                                                                                                                                                                                                              |
| Deploy        | Docker (Next standalone output) → Dokploy; see README for the live topology; local dev via docker-compose postgres                                                                                                                                                                                               |

Package manager pnpm. `.npmrc` MUST contain `minimum-release-age=20160` (supply-chain floor).
Pin to well-established versions; if pnpm rejects a too-fresh version, pick an older minor.

## Repo layout

```
peanut-split/
  docs/SPEC.md                 ← this file
  prisma/schema.prisma
  src/
    app/
      (marketing)/page.tsx     landing
      new/page.tsx             create room
      r/[slug]/page.tsx        THE room (join gate renders here on first visit)
      r/[slug]/opengraph-image.tsx
      api/...                  route handlers (contract below)
      manifest.webmanifest/route.ts  sw.ts    PWA
    components/ui/             primitives (Button, Card, Field, Sheet, …) — design-system agent owns
    components/room/           room feature components — flows agent owns
    server/                    domain logic: money.ts, split.ts, fx.ts, db.ts, roomState.ts
    lib/                       client helpers: identity.ts (localStorage), api client, analytics
    styles/                    tailwind theme, fonts
  e2e/                         Playwright specs
  public/fonts/  public/icons/
  Dockerfile  docker-compose.yml  .github/workflows/ci.yml
```

**File ownership (collision avoidance):** core-domain agent owns `prisma/`, `src/server/`,
`src/app/api/`; design-system agent owns `src/components/ui/`, `src/styles/`, `public/fonts/`;
flows agent owns `src/app/(app routes)`, `src/components/room/`, `src/lib/`; growth agent owns
marketing page, OG, PWA files. Do not edit outside your area; if you need a change there, note it
in your final report instead.

## Data model (Prisma, schema `split`)

```prisma
model Room {
  id         String   @id @default(uuid())
  slug       String   @unique            // e.g. "ski-trip-R7x..." — readable stem + 128-bit opaque tail
  name       String
  emoji      String?                     // room emoji, default 🥜-adjacent fun set
  currency   String                      // display/settle currency, ISO 4217
  coverUrl   String?                     // legacy dormant field; uploads are not approved
  createdAt  DateTime @default(now())
  members    Member[]
  expenses   Expense[]
  settlements Settlement[]
}

model Member {
  id        String   @id @default(uuid())
  roomId    String
  name      String
  token     String   @unique             // server-issued secret, returned once, held in localStorage
  userId    String?                      // claim hook — null until account linking ships
  createdAt DateTime @default(now())
  removedAt DateTime?
  room      Room     @relation(...)
}

model Expense {
  id            String   @id @default(uuid())
  roomId        String
  description   String
  amountMinor   BigInt                   // in `currency`
  currency      String                   // may differ from room currency
  paidById      String                   // Member
  splitMode     SplitMode                // EQUAL | EXACT
  date          DateTime @default(now()) // user-editable expense date — DISPLAY IT
  category      String?
  createdAt     DateTime @default(now())
  deletedAt     DateTime?                // soft delete → 6s Undo
  shares        ExpenseShare[]
}

model ExpenseShare {
  id                 String  @id @default(uuid())
  expenseId          String
  memberId           String
  amountMinor        BigInt              // ALWAYS in room currency (post-FX)
  enteredAmountMinor BigInt?             // EXACT mode: verbatim in expense currency — no-drift re-save
}

model Settlement {
  id          String   @id @default(uuid())
  roomId      String
  fromId      String   // Member
  toId        String   // Member
  amountMinor BigInt   // room currency
  method      String?  // "cash" | "bank" | "peanut" | null
  note        String?
  createdAt   DateTime @default(now())
  deletedAt   DateTime?
}

model FxRate {
  id        String   @id @default(uuid())
  base      String
  quote     String
  rate      Decimal
  fetchedAt DateTime @default(now())
  @@unique([base, quote])
}

// Historical claim-hook sketch. Current room behavior has no account endpoints:
model User { id String @id @default(uuid()); createdAt DateTime @default(now()); accounts AuthAccount[] }
model AuthAccount { id String @id @default(uuid()); userId String; provider String; providerId String; @@unique([provider, providerId]) }
```

## Money rules (non-negotiable — reference implementation exists)

**Reference:** `/home/hugo/Projects/Peanut/inbox/peanut-split/mock-api/server.mjs` — a verified
reconstruction (passes the original author's e2e 10/10). Port its semantics exactly:

- Minor-unit **strings** on the wire, **BigInt** internally and in DB. A float never touches money.
- Currency decimals respected (JPY/COP = 0). The generated catalog recognises 162 currency codes;
  156 support automatic conversion in a connected deployment. The mock's 12 core currencies are
  the static outage/dev fallback, not the production catalog.
- FX conversion: integer maths at `RATE_SCALE = 1e18`, round half-up. The wider scale is required
  for the smallest crosses in the 162-code catalog; the persisted expense rate remains
  `Decimal(24,12)` and unsafe zero/overflow crosses are unavailable.
- EQUAL split: base + remainder spread one unit at a time; shares sum to total **exactly**.
- EXACT split: store `enteredAmountMinor` verbatim in expense currency; residue after FX goes on
  the largest share; re-opening and re-saving a foreign-currency expense must not drift balances.
- Balances: sum over non-deleted expenses/settlements; suggested transfers via greedy
  minimal-transfer (≤ n−1 transfers).
- Live FX: directly fetch Peanut's public
  `https://api.peanut.me/fx/rates?base=<room currency>` display-sell snapshot server-side. Each row
  is the backend-selected quote-to-room pair, preserving Peanut UI's all-provider-or-all-reference
  choice; Split inverts that row into room-units-per-quote and never crosses independently selected
  live rows. The request is bodyless and sends no credential. Cache each base separately for 24h in
  FxRate. If refresh fails, cached rows remain usable only while the producer's `generatedAt` is
  under seven days old; after that Split materializes the mock's 12-rate static table in the target
  base. Rates are indicative — label them so.

## Import compatibility boundary

- Supported and fixture-tested: canonical Splitwise group CSV, Split Pro friend CSV, and Split
  Pro account JSON. Unknown CSVs fail closed; they are never guessed into a ledger format.
- Settle Up is **not** currently supported. Its Android app can export CSV, but there is no
  versioned schema in this repository and no real export fixture to prove balances. Add an
  adapter only with a redacted source file and a round-trip/balance fixture; marketing and UI
  must not claim compatibility before that lands.
- A single separator followed by three digits in a 3-decimal currency (`1,234` or `1.234`) is a
  1000× ambiguity without locale metadata. The parser rejects that row instead of guessing;
  repeated grouping and mixed grouping-plus-decimal forms remain supported.
- Parsed minor-unit amounts are bounded to PostgreSQL signed BIGINT before preview, and history
  folding must prove its actual opening-balance rows plus retained history fit the 500-expense
  API ceiling.

## API contract (route handlers under `src/app/api/`)

Same envelope philosophy as the reference: mutations return the **full RoomState** so the client
seeds its cache in one hop. Errors: `{ error: { code, message } }` with correct HTTP status.

```
GET    /api/currencies                          → { currencies: [{code, symbol, decimals, name}] }
GET    /api/rate?from=EUR&to=USD                → { rate }
POST   /api/rooms {name, emoji?, currency, creatorName} → RoomState + creator memberToken
GET    /api/rooms/:slug                         → RoomState
POST   /api/rooms/:slug/members {name}          → RoomState + memberToken
POST   /api/rooms/:slug/expenses {…}            → RoomState
PATCH  /api/rooms/:slug/expenses/:id {…}        → RoomState
DELETE /api/rooms/:slug/expenses/:id            → RoomState   (soft delete)
POST   /api/expenses/:id/restore                → RoomState   (undo)
POST   /api/rooms/:slug/settlements {fromId,toId,amountMinor,method?,note?} → RoomState
DELETE /api/rooms/:slug/settlements/:id         → RoomState
```

`RoomState = { room, members[], expenses[+shares], settlements[], balances: {memberId → netMinor},
suggestedTransfers[] }` — shapes per
`/home/hugo/Projects/Peanut/worktrees/peanut-ui-feat/split-rooms/src/services/split.types.ts`
(adapt names where this spec differs; this spec wins).

Member creation responses include `token` once. Client sends `X-Member-Token` on mutations;
server uses it for **attribution only** (who added what), never authorization — the slug is the
credential. Slug: kebab-cased name + `-` + 3 words from a frozen 1,024-word list (crypto random,
masked 10-bit draw). 1024³ === 32⁶, so the tail carries the same 30 bits the old base32 one did.

Rate limiting (deploy wave): per-IP token bucket on room/member creation — 20/hour, in-memory.

**Ops endpoints (learned the hard way in production — required):**

- `GET /healthcheck` — flat liveness, no DB, no SSR, must answer in ms (default health paths that
  render SSR get instances health-killed under load).
- `GET /readiness` — 200 only after `SELECT 1` succeeds; used as the Dokploy/Traefik health check
  so a cold container never receives traffic (prevents ~1 min of 502s per deploy).

## Frontend architecture

- **Identity:** `src/lib/identity.ts` — localStorage `ps:member:<slug>` =
  `{memberId, token, name}`; `ps:recent` is the device-local room list. The
  shared room link, not an account or device cookie, is the recovery mechanism.
- **Name selection:** first visit to `/r/[slug]` with no stored identity → selection UI _over a
  live preview of the room_. Choose which existing ledger name is yours on this device or add a
  name. This is a local viewpoint, not ownership, permission, or a claimed/unclaimed lifecycle.
  The room page remains the route; see `docs/ROSTER-IDENTITY.md`.
- **URL state (nuqs):** open drawers/steps/selected expense are URL params — every mid-flow state
  shareable and back-button correct. `useState` only for ephemeral UI.
- **React Query:** mutations return RoomState → `setQueryData` immediately; 8s
  `refetchInterval` + refetch on focus for liveness. Optimistic add for expenses (rollback on error).
- **Undo:** soft-delete + 6s Sonner toast with Undo → `/restore`.

## Design system

**Peanut-family, but yellow.** Primary `#FFC900` (peanut-ui `yellow-1`), warm ink `#211C17`,
1.5px pen-like borders, compact warm-ink shadows (`shadowSize` idiom), and friendly corners
(`rounded-sm` starts at 12px) on `bg-white`/warm neutrals. Pink `#FF90E8` may appear ONLY inside
the "powered by Peanut" mark and the Peanut settle option. Copy token values + display fonts
from peanut-ui (recon report gives exact paths), then diverge freely — no dependency on
peanut-ui.

Typography: Peanut's chunky display face for headings/numbers, a clean sans for body. Numbers
always tabular (`font-variant-numeric: tabular-nums`).

**Six signature moments** (polish wave owns these; flows wave leaves hooks):

1. Link appears after room creation — presented like being handed something (ticket/card motif,
   one-tap copy + native share).
2. Someone joins — avatar pops into the roster live (spring scale-in on poll diff).
3. Expense lands — balances **count** to their new values (NumberFlow), list item springs in.
4. Split detail — per-person cents visibly reconcile to the total (the anti-"trust me" moment).
5. Settle — the debt row collapses with weight; settled state feels physical.
6. All settled up — full celebration moment (mascot/confetti), explicitly screenshot-worthy.

## Achievements

Achievements are a bounded product surface: optional, shareable keepsakes
derived from coordination already recorded in the room. Crew milestones count
ledger names rather than joins; Passport counts saved expense currencies; and
personal awards reflect positive administrative or social actions. They never
read amounts, balances, debts, payment speed, or spending power.

There are no points, rankings, leaderboards, streaks, levels, negative awards,
locked-item grids, or prompts to do more work for the next reward. Only one
achievement moment may interrupt a room per browser session. Ledger correction
prompts take precedence, and All settled remains the primary completion
celebration and the lead recap card. The full product contract is
`docs/ACHIEVEMENTS.md`.

Every screen has designed loading (skeletons), empty (illustrated, with a next action), and error
states. 60fps target on mid-range Android: animate `transform`/`opacity` only.

**Sound + haptics (polish wave, small but differentiating):** a 3–4 sound palette synthesized
with Web Audio (no audio files) using physical metaphors, not musical tones — a soft "pencil tick"
on expense add, a "wood thunk" on settle, a small handbell on all-settled. Master gain ≤0.3,
retrigger throttle ~60ms, warm the iOS audio thread with a silent oscillator on first gesture.
Every sound paired with a semantic haptic (`use-haptic`); sound and haptics are independent
settings, both default ON, persisted in localStorage.

## Growth layer

- **OG image per room:** `opengraph-image.tsx` — room emoji + name, member avatar row, "n expenses ·
  total". The invite unfurl in WhatsApp/iMessage/Telegram is a designed artifact.
  Satori constraints (from prior post-mortems): every multi-child flex container needs explicit
  `display:flex`; no grid, no `gap`, no CSS transforms beyond translate/rotate; inline styles only;
  register only the fonts you ship and strip non-ASCII room names to a safe fallback rather than
  rendering tofu. Set `Cache-Control` ~1h on the image response; renders must stay stateless
  (unbounded in-memory OG caches have leaked ~40MB/locale in production — don't add one).
- **robots:** disallow `/r/*` for `*`; allow `Twitterbot`, `facebookexternalhit`, `WhatsApp`;
  `noindex` meta on room pages. Landing page fully indexable.
- **PWA:** manifest (name, icons, standalone, theme `#FFC900`), Serwist service worker —
  **NetworkOnly for `/api/*`** (a stale RoomState is worse than a spinner; a prior app shipped a
  soft-lock bug from NetworkFirst on state endpoints), CacheFirst for hashed `/_next/static`,
  NetworkFirst (3s timeout) for navigations. Installation is a retention affordance, not an
  activation gate: Device settings always provides a native action or truthful browser-menu
  guidance. The room has one contextual guidance slot — identity/recovery, first expense,
  post-activation Share, active forms, latecomer review, fresh All settled and achievements all
  outrank Install; Install is the inline fallback once none is active and the interaction is quiet.
  Temporary blockers suspend the same exposure, while competing-prompt refusals defer it.
  Dismissals use an exponential backoff (24h→48h→…→30d cap) in localStorage. iOS gets a how-to
  sheet (no `beforeinstallprompt` there; detect iPadOS-as-Mac via
  `maxTouchPoints > 1 && /Mac/`). [WebKit 17.2+ copies cookies but no other local storage into a newly
  installed iOS/iPadOS web app](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/), so
  opening the iOS instructions arms a 24-hour, one-time server handoff: an opaque host-only cookie
  names a hashed transient row containing only the room, optional active member, and hash of the
  exact proof presented. The installed `/app` launch copies that narrow state into its own
  localStorage, verifies it, enters the room, and acknowledges/deletes the row in the background.
  It never creates an account, device map, or analytics link. Older WebKit and failed transfers
  fall back to reopening the room link once in the installed app.
- **Share:** native `navigator.share` with clipboard fallback that MUST NOT be swallowed by a
  silent catch (known bug in the reference UI).
- **Landing:** one screen — what it does, create CTA, "your rooms" if localStorage has any,
  quiet "powered by Peanut" footer.

## Historical analytics event list

The event names below are historical context. Current analytics are literally
identifier-free: no room slug, slug hash, member name or amount.

`room_created, room_joined, expense_added, expense_edited, settlement_recorded, settle_sheet_opened,
share_opened, share_completed, link_copied, pwa_prompt_shown, pwa_installed, peanut_option_shown,
peanut_option_clicked` — the last one is THE metric (funnel into peanut.me with UTM
`utm_source=split&utm_medium=settle`).

## Quality gates (CI on every push)

`pnpm typecheck` · `pnpm test` (vitest) · `pnpm lint` · `pnpm build` · Playwright e2e
(create → share → second-browser join → expenses incl. foreign-currency EXACT → balances →
settle → undo → all-settled) against a docker-composed stack.

## Deploy

Dockerfile: multi-stage, `output: "standalone"`, node:22-alpine, prisma migrate deploy on boot.
Deployed via Dokploy with a dedicated Postgres service; nightly dumps ride the host's existing
backup job. Health check → `/readiness`. **The live topology, the isolation model and the two
build-time gotchas live in [`README.md`](../../../README.md) — not here**, so there is one
description of the deploy rather than two that drift.

## Historical appendix — unshipped auth/claim proposal

This is not the current roadmap and is not approved for implementation. The
dormant schema hooks above remain only to avoid rewriting member history if
identity is reconsidered. These notes preserve the earlier proposal's known
hazards:

- Sealed-cookie session (no DB session table), maxAge 10y (default session cookies die when iOS
  kills the pinned PWA → forced re-login).
- One `setSessionForUser()` chokepoint; `requireUserId()` verifies the user row still exists and
  clears stale cookies.
- Claim = **row flip, not data sweep**: find guest identity by device-id cookie, flip it into the
  account atomically. A prior implementation type-forced the fields a claim must set
  (an omitted field once stranded 562 accounts on placeholder names).
- OAuth auto-link ONLY onto already-email-verified rows (pre-hijack guard, `oauth-link.ts`).
- Apple form_post is cross-site: fold state into an HMAC-signed `state` param, `SameSite=None`
  only for the CSRF double-submit cookie. Google needs `prompt: 'select_account'`.
- Passkeys: platform authenticator, `residentKey: 'required'`; passkey-only accounts have no email.
- Log `signup-no-claim` with `hadDeviceId` — the greppable metric for stranded anonymous history.
- iOS Safari↔PWA identity handoff must not rely on CacheStorage or localStorage: WebKit installs
  have an isolated data container. The shipped PWA flow uses the narrow, short-lived cookie +
  hashed-row handoff described in the Growth layer instead.
