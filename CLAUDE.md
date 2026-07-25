# Working rules — peanut-split

This repo does **not** follow mono's always-PR workflow. Split is growth-owned, deliberately small, and meant to be shippable (and killable) in an afternoon. `mono/CONTRIBUTING.md` governs `peanut-ui` and `peanut-api-ts`; the rules below govern this repo and win where they differ.

## Shipping

- **Push straight to `main`.** No PR, no review gate, no waiting. `main` is unprotected on purpose.
- Open a PR only when you actually want a second opinion on something, not as ceremony.
- Commit messages explain *why*. No AI co-author lines.

## What still holds

- **Money code needs a test before it ships.** Balances, splits, FX, settlements: if it can produce a wrong number, it has a test. The pure math in `apps/api/src/split/math.ts` is where that logic belongs — testable without a database.
- **The surface is frozen.** Split settles through an existing Peanut payment-request link and a webhook receipt. No new money-path endpoints, no accounts, no identity stored in Split. If a change needs one of those, it's the wrong change.
- Dependencies must be ≥14 days old (`.npmrc` enforces it).
- Run `pnpm typecheck && pnpm test && pnpm format` before pushing.

## Local dev

```bash
pnpm install
pnpm dev          # API :5051, UI :3051 → http://localhost:3051/room
```

**Prefix every Prisma command with `env -u DATABASE_URL`.** The mono QA harness exports `DATABASE_URL` pointing at the shared `peanut_dev`, and Prisma prefers the process env over `apps/api/.env` — a migration will silently aim at the wrong database. It refuses (P3005) rather than corrupting anything, but the failure is confusing.

## Before touching the money math

Read [`docs-split-rooms-spike.md`](docs-split-rooms-spike.md) — the original design doc and the 2026-07-06 review. The ledger-integrity findings (1, 2, 3, 5, 6) are fixed; the deferred ones are still open and listed there:

- FX is re-priced on edit, contradicting "rate locked at creation". Latent while the reference table is static; breaks history the day live FX lands.
- `formatMoney` assumes 2 decimals until `/split/currencies` loads, so a JPY room can flash a hero balance 100× off.
- `convertToBaseMinor` round-trips through `Number`, losing integer precision past 2^53.
- No integration tests on the nine DB-writing routes.
