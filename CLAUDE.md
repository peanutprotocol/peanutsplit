# Working rules — peanutsplit

This repo does **not** follow mono's always-PR workflow. Split is growth-owned, deliberately small, and meant to be shippable (and killable) in an afternoon. `mono/CONTRIBUTING.md` governs `peanut-ui` and `peanut-api-ts`; the rules below govern this repo and win where they differ.

Product rationale, status, milestones and the decision log live in the Notion project (linked from `mono/projects/peanut-split/`). The engineering backlog — what's built, building, queued, gated on infra, and deliberately not built — lives in [`ROADMAP.md`](ROADMAP.md). This file is the working rules only — don't restate either here.

## What's in here

```
apps/api    Fastify + Prisma + its own Postgres. All money logic: splits,
            balances, FX, settlements, and the settle-with-Peanut loop.
apps/web    The live product — Next, PWA, per-room link previews. THIS is what
            peanutsplit.com serves.
```

`main` is canonical: two apps, one of them live, nothing dead. The original
standalone UI (the settle-up screens wired to `apps/api`'s settle loop) lives on
the **`poc/original-split-ui`** branch — pull the screens from there when porting
them into `apps/web`, don't develop on it.

One seam still open: `apps/web` is outside the pnpm workspace (it brought its own
lockfile) and talks to its own database rather than `apps/api`. Collapsing those
two is the remaining merge.

## Shipping

- **Push straight to `main`.** No PR, no review gate, no waiting. `main` is unprotected on purpose.
- **A push to `main` deploys to production within ~5 minutes.** There is no CI gate in front of it. Run the checks below yourself.
- Open a PR only when you actually want a second opinion, not as ceremony.
- Commit messages explain _why_. No AI co-author lines.

## What still holds

- **Money code needs a test before it ships.** Balances, splits, FX, settlements: if it can produce a wrong number, it has a test. The pure math in `apps/api/src/split/math.ts` is where that logic belongs — testable without a database.
- **The money surface is frozen.** Split settles through an existing Peanut payment-request link. No new money-path endpoints. Split is accountless: recent rooms and member tokens stay on the device, and the room link stays the credential. No email login, passwords, OAuth, profiles, or room ownership. Push notifications are opt-in per device per room. Anything past that is a product decision, not an implementation gap.
- **No identity in analytics either** — no room slug, no member name, no amount. The slug is the room's access control; a name is what someone chose to show their friends.
- Dependencies must be ≥14 days old (`.npmrc` enforces it).
- Run `pnpm typecheck && pnpm test && pnpm format` before pushing.

## Local dev

```bash
pnpm bootstrap    # NOT plain `pnpm install` — see below
pnpm dev          # API :5051 + web :3000 (or dev:api / dev:web for one)
```

`apps/web` is not a workspace member, which has one sharp edge: running
`pnpm install` inside `apps/web` walks _up_ and installs the workspace instead,
leaving `apps/web/node_modules` missing. It needs `--ignore-workspace`, which is
what `pnpm bootstrap` does. (Docker doesn't hit this — the web image's build context
is `apps/web` alone, so there's no parent workspace file to find.) The root
scripts reach it with `--dir apps/web` rather than a filter. If you add an app, wire it into the root
`typecheck`/`test` the same way — a gate that silently covers nothing is worse
than no gate.

**Prefix every Prisma command with `env -u DATABASE_URL`.** The mono QA harness exports `DATABASE_URL` pointing at the shared `peanut_dev`, and Prisma prefers the process env over `apps/api/.env` — a migration will silently aim at the wrong database. It refuses (P3005) rather than corrupting anything, but the failure is confusing.

## Deploy

Runs on a Hetzner box via Dokploy; see the Deployment section of [`README.md`](README.md) for the topology. Two rules that bite if you don't know them:

- **The containers have no egress.** Nothing can be fetched at runtime. If code needs to reach an external host, it needs a proxy pinned to that host — not an opened network. This is why the Prisma engine is baked into the image rather than downloaded on boot.
- **`NEXT_PUBLIC_*` values are build args**, because Next inlines them into the client bundle at build time. Setting them at runtime silently does nothing; each one needs an `ARG`/`ENV` pair in `apps/web/Dockerfile` and a matching Dokploy build arg.

You don't need server access to ship — push is enough. Ask Hugo for anything infra-side (env vars, domains, database, rollback, logs).

## Before touching the money math

Read [`docs-split-rooms-spike.md`](docs-split-rooms-spike.md) — the original design doc and the 2026-07-06 review — and the "Design choices" section of [`changelog-july-25.md`](changelog-july-25.md), which explains why the settle path is shaped the way it is. Known-open issues:

- `formatMoney` assumes 2 decimals until `/split/currencies` loads, so a JPY room can flash a hero balance 100× off.
- `convertToBaseMinor` (apps/api) round-trips through `Number`, losing integer precision past 2^53.
- ~~FX re-priced on edit~~ and ~~no rate limiting~~ — both fixed 2026-07-28 (`src/server/expenses.ts`, `src/server/rateLimit.ts`).
- **The settle loop cannot complete against real Peanut, and V1 ships without it.** `apps/api/src/peanut/index.ts` assumes a signed `charge:confirmed` webhook. In `peanut-api-ts`, `CHARGE_CONFIRMED` is an enum member nothing emits, charge delivery carries no signature, and charge creation rejects any currency but USD/ARS — so the verified path could not serve a EUR or THB room even if the event existed. **Decided 2026-07-27 (Konrad): the soft launch ships the settle flow as it stands** — `apps/web`'s SettleDrawer opens peanut.me and the room records the payment on the payer's tap, unverified. Nobody is polling anything. If you are here to "finish the receipts", that is a reopened product decision, not a TODO. Polling the public `GET /charges/:chargeId` remains the cheapest route if it is reopened.
