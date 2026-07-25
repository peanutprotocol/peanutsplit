# Peanut Split

A link-based expense splitter. A room **is** its link: share it into a group chat, everyone picks a name, add expenses in any currency, settle up with the fewest transfers. No accounts, no sign-up, no KYC.

Split makes the debts. Peanut settles them.

## Why this is a separate repo

Split is top-of-funnel for Peanut, not a feature inside it. It stays standalone so that:

- the sign-up wall never touches the viral loop (the whole point is that a stranger in a group chat can use it),
- its anonymous, unauthenticated routes never live inside the money API,
- it can be killed by deleting a deploy, with nothing in the core app entangled.

The only integration point is the settle screen: a "Settle with Peanut" CTA that generates an existing Peanut payment-request link, and a webhook that posts the verified receipt back into the room. No new money-path endpoints.

## Layout

```
apps/api   Fastify + Prisma + Postgres. 11 anonymous /split/* routes, money math in src/split/.
apps/ui    Next.js. /room (create) and /room/[slug] (the room).
```

## Running locally

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # point DATABASE_URL at a local Postgres
pnpm --filter @peanut-split/api db:migrate:dev
pnpm dev                                  # API :5051, UI :3051
```

Open http://localhost:3051/room.

The browser always talks to the API through the same-origin `/_split/*` rewrite (see `apps/ui/next.config.js`), so a devcontainer or preview only ever needs one forwarded port.

## Design

Peanut's design system, with `primary-1` swapped from Peanut pink to violet so Split reads as its own product. Tokens live in `apps/ui/tailwind.config.js`.

## Provenance

Extracted from the `feat/split-rooms` spike branches in `peanut-ui` and `peanut-api-ts`. The original design doc and the 2026-07-06 review findings are kept in [`docs-split-rooms-spike.md`](docs-split-rooms-spike.md) — read it before touching the money math. Known issues carried over from the spike are tracked as open work; the ledger-integrity set (idempotency on settlements, edit/exclusion, poll-vs-mutation race, member-id validation, fetch timeout) is the pre-launch bar.
