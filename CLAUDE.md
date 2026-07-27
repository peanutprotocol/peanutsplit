# Working rules — peanutsplit

This repo does **not** follow mono's always-PR workflow. Split is growth-owned, deliberately small, and meant to be shippable (and killable) in an afternoon. `mono/CONTRIBUTING.md` governs `peanut-ui` and `peanut-api-ts`; the rules below govern this repo and win where they differ.

Product rationale, status, milestones and the decision log live in the Notion project (linked from `mono/projects/peanut-split/`). This file is the working rules only — don't restate them there or here.

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
- **The surface is frozen.** Split settles through an existing Peanut payment-request link. No new money-path endpoints, no accounts, no identity stored in Split. If a change needs one of those, it's the wrong change.
- **No identity in analytics either** — no room slug, no member name, no amount. The slug is the room's access control; a name is what someone chose to show their friends.
- Dependencies must be ≥14 days old (`.npmrc` enforces it).
- Run `pnpm typecheck && pnpm test && pnpm format` before pushing.

## Local dev

```bash
pnpm setup        # NOT plain `pnpm install` — see below
pnpm dev          # API :5051 + web :3000 (or dev:api / dev:web for one)
```

`apps/web` is not a workspace member, which has one sharp edge: running
`pnpm install` inside `apps/web` walks *up* and installs the workspace instead,
leaving `apps/web/node_modules` missing. It needs `--ignore-workspace`, which is
what `pnpm setup` does. (Docker doesn't hit this — the web image's build context
is `apps/web` alone, so there's no parent workspace file to find.) The root
scripts reach it with `--dir apps/web` rather than a filter. If you add an app, wire it into the root
`typecheck`/`test` the same way — a gate that silently covers nothing is worse
than no gate.

**Prefix every Prisma command with `env -u DATABASE_URL`.** The mono QA harness exports `DATABASE_URL` pointing at the shared `peanut_dev`, and Prisma prefers the process env over `apps/api/.env` — a migration will silently aim at the wrong database. It refuses (P3005) rather than corrupting anything, but the failure is confusing.

## Deploy

Runs on a Hetzner box via Dokploy; see the Deployment section of [`README.md`](README.md) for the topology. Two rules that bite if you don't know them:

- **The containers have no egress.** Nothing can be fetched at runtime. If code needs to reach an external host, it needs a proxy pinned to that host — not an opened network. This is why the Prisma engine is baked into the image rather than downloaded on boot.
- **`SPLIT_API_URL` and `NEXT_PUBLIC_*` are build args**, because Next freezes `rewrites()` and inlines public env at build time. Setting them at runtime silently does nothing.

You don't need server access to ship — push is enough. Ask Hugo for anything infra-side (env vars, domains, database, rollback, logs).

## Before touching the money math

Read [`docs-split-rooms-spike.md`](docs-split-rooms-spike.md) — the original design doc and the 2026-07-06 review — and the "Design choices" section of [`changelog-july-25.md`](changelog-july-25.md), which explains why the settle path is shaped the way it is. Known-open issues:

- FX is re-priced on edit, contradicting "rate locked at creation". Latent while the reference table is static; breaks history the day live FX lands.
- `formatMoney` assumes 2 decimals until `/split/currencies` loads, so a JPY room can flash a hero balance 100× off.
- `convertToBaseMinor` round-trips through `Number`, losing integer precision past 2^53.
- **No rate limiting** on the unauthenticated settle-intent endpoint — 300 rows were created in 2.9s during review.
- **The settle loop cannot complete against real Peanut yet.** `apps/api/src/peanut/index.ts` assumes a signed `charge:confirmed` webhook; Peanut emits no such event today and its charge webhooks are unsigned. Polling the public `GET /charges/:id` is the workable V1.
