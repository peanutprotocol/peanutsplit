# Split Rooms — link-based expense splitting (spike)

**Status: local spike on `feat/split-rooms` (peanut-api-ts + peanut-ui worktrees), no PR yet.**
Splitwise-quality UX with Tricount's identity model, as a Peanut product exploration: settle-up is
manual today, with a designed seam for "pay with Peanut" later.

## Product model

- **A room IS its link.** `POST /split/rooms` mints a 96-bit slug (`randomBytes(12).base64url`);
  possession of the URL is the entire access model. No accounts, no auth — trust-based inside the
  link space, like a shared photo album.
- **Join by picking a name.** First visit to `/room/{slug}` asks "Who are you?" — pick an existing
  member or add yourself. Identity is per-device `localStorage` (`peanut-split:member:{slug}`).
  A "sailing trip" starts working as a group immediately, even while people are still joining.
- **Rooms have a base currency; expenses have their own.** Foreign expenses are converted at a
  reference rate locked at creation. Splits are EQUAL or EXACT. Balances are net-per-person.
  Settle-up suggestions use the minimum number of transfers at up to 18 non-zero balances, then
  deterministic greedy netting above that threshold.

## Running locally

Runs beside the standard dev stack (API :5050 / UI :3050) on **API :5051 / UI :3051**:

```bash
cd /workspaces/sandbox/mono
API_PORT=5051 UI_PORT=3051 \
  API_REPO=$PWD/worktrees/peanut-api-ts-feat/split-rooms \
  UI_REPO=$PWD/worktrees/peanut-ui-feat/split-rooms \
  engineering/qa/lib/servers.sh api up   # then: ui up
```

Entry point: **http://localhost:3051/room**. `servers.sh` injects the sandbox env (localhost
`DATABASE_URL`, provider mocks via `engineering/qa/mocks.mjs`).

## Architecture

### Backend (peanut-api-ts)

| Piece         | Where                                                                                | Notes                                                                                                                                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data model    | `prisma/schema.prisma` § SPLIT ROOMS                                                 | 5 models — `SplitRoom`, `SplitMember`, `SplitExpense`, `SplitShare`, `SplitSettlement` — all `@@schema("app")`, soft-delete via `deletedAt`                                                                                                                     |
| Migrations    | `prisma/migrations/20260701120000_split_rooms`, `…130000_split_share_entered_amount` | Hand-assembled additive DDL (local role can't create Prisma's shadow DB, P3014; `migrate diff --from-url` is contaminated by the dead `public` schema). Verified character-identical to `prisma migrate diff --from-empty` output. Apply with `migrate deploy`. |
| Routes        | `src/routes/split/index.ts`                                                          | TypeBox-schema'd, **unauthenticated by design**. Every mutation returns the full room snapshot so clients need no second round-trip.                                                                                                                            |
| Orchestration | `src/db/split.ts`                                                                    | `SplitError(status, message)` → clean 4xx; `computeExpense` validates payer/participants, EXACT-sum-equals-total, amount bounds (`MAX_MINOR = 10^15`); writes in `$transaction`.                                                                                |
| Money math    | `src/split/math.ts`                                                                  | BigInt minor units everywhere (stringified over the wire). Equal split = largest-remainder; balances always sum to zero; `simplifyDebts` is exact at ≤18 nonzero balances, then deterministic greedy.                                                           |
| FX            | `src/split/fx.ts`, `src/split/currencies.ts`                                         | **The Peanut-FX seam**: static USD-anchored reference table (source `reference-usd`), cross-rated via USD. Swap in live Peanut FX here later — callers don't change. Real Bridge/Manteca FX can't price arbitrary pairs (THB→EUR), hence the reference table.   |

API surface (all under `/split`): `POST /rooms`, `GET /rooms/:slug`, `POST /rooms/:slug/members`
(returns `createdMemberId` — diffing the member array is racy), `POST|PATCH|DELETE
/rooms/:slug/expenses[/:id]`, `POST …/expenses/:id/restore` (undo), `POST|DELETE
/rooms/:slug/settlements[/:id]`, `GET /currencies`, `GET /rate` (live estimate while typing).

### Frontend (peanut-ui)

- Routes: `src/app/room/page.tsx` (create) + `src/app/room/[slug]/page.tsx` — top-level,
  outside the auth-gated `(mobile-ui)` group.
- Components: `src/components/Split/` — `CreateRoom`, `RoomView` (personalized "X owes you €Y"
  balances, per-expense "you lent / you owe" line, undo snackbar, settled-up history),
  `AddExpenseDrawer` (EQUAL/EXACT, currency picker, live `≈ €77.78` foreign estimate, edit mode),
  `SettleUpDrawer` (suggested transfers, "Mark as paid", Pay-with-Peanut placeholder), `IdentityGate`.
- Data: `src/services/split.ts` + `split.types.ts` (hand-written types — `gen:api` not wired yet),
  `src/hooks/query/split.ts` (React Query; mutations seed the cache from the returned snapshot;
  8s poll gives the "people joining live" feel without websockets).
- **Same-origin proxy**: the browser calls `/_split/*`, a Next rewrite → API `/split/*`
  (`next.config.js`, same pattern as the passkey rewrite). Critical in devcontainers/previews where
  only the page origin is forwarded — calling `localhost:5051` directly renders the page but every
  API call silently dies. SSR falls back to the absolute `PEANUT_API_URL`.

### Money-correctness decisions

- EXACT shares must sum to the total or the API rejects (earlier silent reconciliation could
  produce negative shares).
- Foreign EXACT edits round-trip the **originally typed** amounts via
  `split_shares.entered_amount_minor` — re-saving a ฿3000 expense leaves base shares and balances
  bit-identical (back-converting from base re-rounds and drifted a cent per save).
- FX rate + source are stored on the expense (`fxRate`, `fxSource`) — locked at creation.

## Verification

- Unit tests: `src/split/math.test.ts`, `fx.test.ts` (API), `split-format.test.ts` (UI) — money
  math, cross-rates, formatting.
- Ad-hoc full-e2e: `peanut-ui …/e2e/split-rooms/e2e-assert.mjs` drives the real UI and asserts
  backend truth (3 joiners, mixed EUR+THB, EQUAL+EXACT, settle to zero, foreign-EXACT drift guard).
  **Not in CI** — see Known issues.
- Multi-agent QA (2026-07-01): 4 review rounds → clean; 3 real-browser QA lenses (edge, Splitwise
  parity, 390px/320px layout). Parity verdict: at-or-above Splitwise on core flows, better on
  multi-currency clarity.

## Known issues — full-project review, 2026-07-06 (8 confirmed / 2 plausible)

Ranked; none fixed yet. The first three share one root cause: **money writes have no server-side
idempotency/validation**, so guards live client-side and get hand-copied per component.

1. **Edit re-adds excluded members** (`AddExpenseDrawer` auto-include effect): editing an EQUAL
   expense that deliberately excluded someone silently re-adds them on save. Regression from the
   late-joiner fix. _Fix: skip the effect in edit mode / derive participants from an `excluded` set;
   better, omit `participantMemberIds` when all-selected so the server resolves live membership._
2. **Settlement double-record** — "Mark as paid" has no client guard (Bruddle `Button` fires
   `onClick` while `loading`) and `recordSettlement` inserts unconditionally → double-tap flips who
   owes whom. _Fix: idempotency key + server-side debt check._
3. **Poll-vs-mutation cache race** — mutations `setQueryData` without `cancelQueries`; an in-flight
   8s poll overwrites the fresh snapshot (deleted expense "reappears" under the undo snackbar).
4. **Native (Capacitor) break** — `/_split` rewrite doesn't exist in the static export; `/room` is
   not in `native-build.js` `ITEMS_TO_DISABLE` and `room/[slug]` has no `generateStaticParams`, so
   the native export build fails outright once merged. _Fix: `isCapacitor()` → absolute URL;
   exclude `/room` from the native bundle._
5. **`createdByMemberId` unvalidated** — non-UUID → 500; a member id from another room passes the
   FK and cross-links rooms.
6. **`splitFetch` lost timeout + Sentry** — raw `fetch` (no 10s abort, no error capture): a stalled
   request hangs `isPending` forever; a prod outage is telemetry-silent. _Fix: route through
   `fetchWithSentry`._
7. **Edit re-prices FX** _(plausible/latent)_ — `updateExpense` always fetches a fresh rate,
   contradicting the schema's "FX locked at creation" invariant. Masked while the reference table
   is static; breaks history the day live FX lands.
8. **0-decimal display fallback** — `formatMoney` assumes 2 decimals before `/split/currencies`
   loads; a JPY/VND room can transiently show the hero balance 100× off.
9. **No integration tests** for 9 DB-writing routes (CLAUDE.md hard line: money needs tests before
   merge). Findings 2 and 5 are exactly what the mandated error-branch/idempotency tests catch.
10. **`convertToBaseMinor` precision** _(plausible)_ — `Number` round-trip loses integer precision
    past 2^53 (reachable at ~$284B, under the 10^15 input cap); converted total is never
    bounds-checked.

Refuted in review (not bugs): the "settled up" label for members with no simplified edge to you —
internally consistent, matches Splitwise's simplify-debts convention; hand-written migration SQL —
verified drift-free against Prisma's canonical output (procedural violation only).

## Deferred (productionization checklist)

Server-side idempotency for money writes · fix the known issues above · `gen:api` typed contract ·
port the ad-hoc e2e into `e2e/flows/` + Nutcracker · integration tests · live Peanut FX in the seam
· real Pay-with-Peanut settle (`SplitSettlement.method=PEANUT` / `peanutRef` are ready) ·
shares/percent splits · websockets · reuse pass (`getInitialsFromName`, `AvatarWithBadge`,
`getFromLocalStorage`, dedupe `minorToMajor` into `split-format`).

## History

API commits: `b09cd0f0` feature → `d366d571`/`db944f29` review hardening → `df6abce8` FX tests →
`0ebac475` entered-amounts (no-drift) → `a14296d5` types → `6e93312c` live rate.
UI commits: `3f4a829d7` feature → `b1fc10ad0`/`8b90ee312` UX rounds → `00595a24e` edit prefill →
`9e9222116`/`e9c38a0d6`/`a68305001` tests/e2e → `f58f60cd2` live estimate → `48bc6f7dc`
same-origin proxy → `9127b93aa` per-expense share + settle un-clip → `56b20c2a5` double-tap +
late-joiner guards.
