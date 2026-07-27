# Peanut Split

A link-based expense splitter. A room **is** its link: share it into a group chat, everyone picks a name, add expenses in any currency, settle up with the fewest transfers. No accounts, no sign-up, no KYC.

Split makes the debts. Peanut settles them.

## Why this is a separate repo

Split is top-of-funnel for Peanut, not a feature inside it. It stays standalone so that:

- the sign-up wall never touches the viral loop (the whole point is that a stranger in a group chat can use it),
- its anonymous, unauthenticated routes never live inside the money API,
- it can be killed by deleting a deploy, with nothing in the core app entangled.

The only integration point is the settle screen: a "Settle with Peanut" CTA that hands off to an existing Peanut payment-request link, and a webhook that posts the verified receipt back into the room. No new money-path endpoints.

**Everything we don't yet know about Peanut's API lives in one file**, `apps/api/src/peanut/index.ts` — the pay-URL shape, the webhook payload and the signature scheme are all documented guesses. When the real docs arrive, that file's exported surface stays and its bodies change; nothing else needs to move.

## Layout

```
apps/api   Fastify + Prisma + its own Postgres, port 5051
  src/split/       pure money math — splits, balances, minimal transfers, FX
  src/db/split.ts  every write. Two settlement paths, deliberately (see below)
  src/peanut/      the entire Peanut integration, mocked and documented
  src/routes/      /split/* (anonymous, proxied) and /webhooks/* (signed, not proxied)
apps/web   Next — the live product at peanutsplit.com (PWA, per-room previews)
```

### The one thing to understand before changing the settle code

There are **two** ways a settlement gets written, and they are not interchangeable:

- `recordSettlement` — someone _asking_ to record a payment ("I paid another way"). A debt ceiling refuses more than the pair actually owes.
- `confirmPeanutSettlement` — money Peanut says has _already moved_. **No ceiling.** Balances routinely shift between a payment starting and confirming, and refusing there would mean real money moved while the ledger denies it. An overpayment is recorded and reported instead.

`changelog-july-25.md` has the full reasoning under "Design choices".

## Running locally

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # point DATABASE_URL at a local Postgres
pnpm --filter @peanut-split/api db:migrate:dev
pnpm dev                                  # API :5051, UI :3051
```

Open http://localhost:3051/room.

**Prefix Prisma commands with `env -u DATABASE_URL`** if you have mono's QA harness env loaded — it exports a `DATABASE_URL` pointing at the shared `peanut_dev`, and Prisma prefers the process env over `apps/api/.env`.

### See it with something in it

```bash
./scripts/demo.sh
```

Starts both apps and seeds a room that looks like a real trip — four people, two currencies, five expenses, and one settle-up already confirmed by Peanut — then prints the URL. You arrive as a stranger and pick a name, same as anyone following a shared link.

### Checking it works

```bash
pnpm typecheck && pnpm test    # 84 tests; the API suite includes 15 against a real Postgres
pnpm verify                    # 41 assertions against a running API + database
```

`pnpm verify` needs the app up and `PEANUT_WEBHOOK_SECRET` set. There are two more checks that drive a real browser and need playwright, so they live as scripts rather than in `pnpm test`: `apps/api/scripts/verify-settle-ui.cjs` (the settle flow, asserting backend state) and `apps/api/scripts/verify-funnel.cjs` (every analytics event). Run them from a directory that has playwright installed, e.g. `mono/engineering/qa`.

To exercise the settle loop without Peanut:

```bash
pnpm --filter @peanut-split/api simulate:webhook <reference> <amountMinor> <currency>
```

That signs a real payload and posts it at the real route — there is deliberately no "simulate" endpoint in the app, since one that skips signature checks is a ledger-write primitive one missing env var away from production.

The browser always talks to the API through a same-origin rewrite rather than a second host, so a devcontainer or preview only ever needs one forwarded port.

## Design

Peanut's design system, with `primary-1` swapped off Peanut pink so Split reads as its own product. Tokens live in `apps/web/tailwind.config.js`; pink is reserved for the "powered by Peanut" mark.

## Where the decisions live

- `changelog-july-25.md` — what was built, and **why each design call went the way it did**. Read "Design choices" before changing the settle path or the analytics.
- `CLAUDE.md` — working rules for this repo (it ships straight to main; money code still needs a test).
- `docs-split-rooms-spike.md` — the original spike design doc and the 2026-07-06 review.

## Provenance

Extracted from the `feat/split-rooms` spike branches in `peanut-ui` and `peanut-api-ts`. The original design doc and the 2026-07-06 review findings are kept in [`docs-split-rooms-spike.md`](docs-split-rooms-spike.md) — read it before touching the money math. Known issues carried over from the spike are tracked as open work; the ledger-integrity set (idempotency on settlements, edit/exclusion, poll-vs-mutation race, member-id validation, fetch timeout) is the pre-launch bar.

## Deployment

Live at **https://peanutsplit.com**, on a Hetzner box via Dokploy: `split-org-web`
(public, serves `apps/web`) → `split-org-api` (never published) → Postgres.
**Pushing to `main` deploys within ~5 minutes**, with no CI gate in between —
the tradeoff this repo already chose by shipping straight to main.

The deploy assumes **the code in this repo is untrusted**, so containment is the
network, not the review:

- The containers sit on `split-net`, an overlay created `--internal`. They get
  one interface and **no default route** — nothing outside that network is
  reachable. Only the proxy reaches in, and only the public app is routable.
- They run as a non-root user with no docker socket and no host mounts, capped at
  1 CPU, and 512MB–1GB of memory.
- The only secret either holds is its own `DATABASE_URL`. No Peanut credentials.

Two consequences worth knowing before changing anything:

- **The app has no egress.** That is free today because nothing is fetched at
  runtime (FX is a static table). The day the settle loop has to reach peanut.me,
  it needs a proxy pinned to that host — not an opened network.
- **`SPLIT_API_URL` is a build arg**, because Next freezes `rewrites()` into
  `routes-manifest.json` at build time. Setting it only at runtime silently
  leaves `/_split/*` pointed at localhost.
