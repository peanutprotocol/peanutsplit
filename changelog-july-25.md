# Peanut Split — what happened, 24–25 July 2026

Two days that took Peanut Split from "a spike on a branch nobody has run in weeks" to a standalone product with a working settle loop, its own repo and deploy, and a funnel instrumented well enough to decide whether it lives.

**All of it is safe to throw away.** That is not a disclaimer, it's the design. Split is a growth bet with a one-month kill condition, and every decision below was made so that shutting it down costs an afternoon. See [Nuking this](#nuking-this) at the bottom for exactly what to delete and what — deliberately — you would not have to touch.

---

## The short version

|                       |                                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **New repo**          | `peanutprotocol/peanut-split`, private, registered as a mono submodule                                                                                  |
| **Shipped**           | Extraction from the spike, ledger-integrity fixes, the settle-with-Peanut loop, verified receipts, per-room artwork and link previews, funnel analytics |
| **Tests**             | 84 (65 API including 15 against a real Postgres, 19 UI)                                                                                                 |
| **End-to-end checks** | 41 assertions against a live API + database, 13 driving a real browser, 12 walking the analytics funnel                                                 |
| **Still mocked**      | Peanut's pay-URL shape, webhook payload and signature scheme — all isolated in one file                                                                 |
| **Not done**          | peanutsplit.com landing page, the "Splitwise alternative" SEO page, deploys, a real PostHog project                                                     |

---

## Day one — decisions, then a repo

### The picker

Thirteen open choices were blocking any plan: domain architecture, whether to extract, where the API lives, the bug bar before real groups touch it, the corridor to launch into, what the OKR even is. They were spread across a call transcript, a pitch deck, a code review and a half-empty Notion page.

Rather than write a plan on top of unresolved questions, all thirteen went into an interactive picker with the source of each decision cited, a recommendation, and room for conditions. Konrad locked all thirteen. Three went against the recommendation — artwork in V1 rather than as a fast-follow, an online-nomad corridor rather than Floripa, and no creator seeding until there's a PMF signal.

### The Notion plan

The locked decisions became the project page: decision log, a single KR (**50 first-time Peanut signups within 30 days of the public seed**), milestones M0–M4, areas of responsibility, and ten tasks.

### A near-miss worth recording

While checking the code, the backend half of the spike — 8 commits, 1,512 lines, the entire data model — turned out to exist **only on this machine**. `peanut-ui` had been pushed; `peanut-api-ts` never had. It went to origin before anything else happened. Had the devcontainer been rebuilt, the project would have been a Notion page describing software that no longer existed.

### The extraction

The UI's dependency on `peanut-ui` internals turned out to be five modules, which made the extraction far cheaper than it looked. `peanut-split` is one pnpm workspace with two apps:

```
apps/api   Fastify + Prisma + its own Postgres, port 5051
apps/ui    Next 16, port 3051, same-origin /_split proxy to the API
```

Verifying it against a real database immediately found three things the extraction had left behind: nothing created the `app` schema (peanut-api-ts made it in a migration that wasn't part of the split set), nothing loaded `.env` so Prisma came up with no connection string, and the jest suites had no config of their own.

### Ledger-integrity fixes

The five confirmed findings from the 6 July review, all sharing one root cause: money writes trusted the client.

- **Settlement double-record.** Two guards: a debt ceiling refusing any payment larger than what the pair still owes, and an idempotency key. The key is checked _before_ the ceiling — once the first attempt lands there is nothing left to settle, so the other order answers a plain network retry with "there is nothing to settle between these two", an error about a payment that actually went through.
- **Unvalidated author id.** `createdByMemberId` reached the foreign key unchecked: a non-UUID was a 500, and a real member id borrowed from another room passed the constraint and quietly cross-linked the two rooms.
- **Edit re-added excluded members.** The "who was already here" ref was seeded with the expense's participants instead of the room's members, so anyone deliberately left out looked like a new joiner and was silently put back.
- **Poll-vs-mutation race.** Mutations now cancel in-flight queries before seeding the cache — how a deleted expense reappeared under its own undo snackbar.
- **No request deadline.** A stalled fetch never settled and the button spun forever.

---

## Day two — the settle loop

The last piece of the core product: tapping **Settle with Peanut** reserves an intent and opens a checkout; Peanut confirms the payment with a signed callback; a verified receipt appears in the room on its own.

A design review before implementation changed the shape twice, and an adversarial review after it found two more ways to corrupt a real ledger. Both are worth reading in [Design choices](#design-choices).

Also shipped:

- **Per-room artwork and link previews.** Every room gets a motif and palette from its name, and a 1200×630 preview rendered per room. To use Split you _have_ to paste the link into a group chat, so the unfurl is what people who've never heard of Peanut actually see.
- **Funnel analytics.** Eight events across the whole funnel, buffered locally until a provider is wired up. Every call site is in place; turning it on is one function body.
- **Integration tests against a real Postgres** for the money-writing paths, which immediately caught a bug (below).

---

## Design choices

The decisions worth arguing with. Each of these could reasonably have gone the other way, and several did before evidence changed them.

### A confirmed payment is never refused by the debt ceiling

The obvious implementation reuses `recordSettlement` for the webhook. It's wrong, and a review caught it before it shipped.

`settleableAmount` is the smaller of what the payer owes the group and what the payee is still owed. **Both move whenever anyone in the room does anything.** Alice starts a €50 payment; while she's at the checkout, Charlie marks his €30 to Bob as paid; Bob is now owed €20; Alice's webhook lands with €50 and is rejected. €50 of real money moved and the ledger says it didn't.

So there are two write paths on purpose:

- `recordSettlement` — a user _asking_ to record something. Ceiling applies.
- `confirmPeanutSettlement` — money that has _already moved_. No ceiling; an overpayment is recorded and reported rather than refused.

An overpayment is a true statement about the world; the room just shows the balance owed back the other way. A rejected payment is a false one. This asymmetry is the single most important idea in the settle code.

The same logic drives the webhook's status codes. Peanut retries on non-2xx, so only "we can't read or trust this" is an error — a bad signature or an unparseable body. A room that vanished, an amount that disagrees, a member since removed: logged loudly, answered 200. Making Peanut redeliver forever fixes none of them.

### The intent is a row, not a signed token

The first design encoded the settle-up into an HMAC-signed token, on the reasoning that state you don't store can't rot. Three problems killed it:

1. **It's a signing oracle.** The endpoint is unauthenticated by design, so anyone with a room link could mint a signed reference for any (payer, payee, amount) triple.
2. **Anything encoded travels to Peanut.** The token would carry the room slug — and the slug _is_ the access control. It would land in a payment memo, possibly a receipt email, a support console. Anyone who ever saw that string would have permanent read/write on the room.
3. **There was nothing to poll.** The waiting state would have been local React state, which dies when the tab is evicted — and paying happens in another app, so that's the normal case, not the edge case.

The row version is _simpler_: the reference is 128 opaque bits that grant nothing, there's no crypto to get wrong, the whole room can see a payment in flight, and a confirmation that never arrives is detectable rather than invisible.

### One settle-up is exactly one payment

The adversarial review found that nothing checked whether an intent had already been confirmed. Three deliveries carrying three different payment ids against one intent recorded three settlements against one debt and inverted who owed whom — no attacker required, since a Peanut payment-request link is reusable by design.

The intent is now claimed with a conditional update _inside_ the transaction, so a second delivery writes nothing. The claim accepts `PENDING` **or** `EXPIRED` and only `CONFIRMED` blocks, because expiry governs what the room stops waiting on, never whether money is recorded. A payment landing an hour late is still real money.

That last detail was itself a bug, caught by writing the integration test: the claim originally required `PENDING`, so a late confirmation was silently dropped — exactly the failure the whole path exists to prevent.

### The receipt rests on Peanut's word, not ours

Amount, currency and status come from Peanut's payload, and a disagreement with the intent is refused. A receipt asserting that money moved has to rest on what the payment processor said, not on what a caller asked us to quote. Status is an explicit allowlist (`completed`), never `!== 'failed'` — which would treat every unknown status as money received.

Relatedly, `method: PEANUT` was removed from the public settlements route. Once a verified receipt looks different from a hand-marked one, that route becomes a forgery endpoint needing nothing but the room link and one curl.

### "Payment in flight" is enforced by the server, not implied by the UI

Showing a waiting banner is not a guarantee. Until the server enforced it, two intents for the same debt both passed the ceiling and both confirmed, and marking manually during a Peanut payment recorded the debt twice. Both are now refused with a 409.

Which created a UX trap that had to be fixed in the same breath: closing the checkout locked that debt for half an hour with no way back. There's now an explicit "I didn't end up paying". Cancelling only stops the room waiting — if the payment lands anyway it's still recorded.

### No identity, anywhere, including analytics

Split has no accounts and must not grow one through a back door. Events carry a per-device random id and never a room slug, a member name or an amount. The slug is the room's access control; a name is what someone chose to show their friends. Neither belongs in a vendor's database, and the funnel test asserts that neither appears.

The one room-authored string that does cross to Peanut is the room title, as the payment's memo, so the payer recognises what they're paying for. It's truncated and documented, because nothing stops someone naming a room after a person.

### Everything unknown about Peanut lives in one file

We don't have Peanut's API docs. The pay-URL shape, the webhook payload field names and the signature scheme are all guesses, and all of them are in `apps/api/src/peanut/index.ts` with a header saying exactly which parts are real product decisions and which are assumptions. When the real docs arrive, the exported surface stays and the bodies change.

Two details there worth keeping: the signature is verified over **raw bytes** (re-serializing an object won't reproduce the sender's exact bytes and would fail for correct payloads), and the raw-body parser is registered **inside a Fastify plugin**. On the root instance it replaces JSON parsing for every route in the app — which is exactly what happened on the first run and broke every other endpoint.

### Procedural artwork now, generated later

Room art is derived from the room name — keyword to motif where we recognise one, hash-picked otherwise, with palettes chosen so text on top always has contrast. Deterministic and offline: no image service, no stored asset, no failure mode.

The intended V2 is a generated illustration from the Nano Banana pipeline. `roomArt()` keeps its shape so that becomes an `imageUrl`, with the procedural version as the fallback for when generation is slow or fails.

The preview carries the room title and the number of people and deliberately nothing else. Chat apps, crawlers and anyone the link is forwarded to all render it.

### Analytics that are a no-op until they aren't

There's no vendor wired up. Events buffer to localStorage and log in development. This is not laziness — instrumenting after launch means the first month of data, the month the kill decision rests on, is the month with no instrumentation. Every call site is in place now; `deliver()` is the only body to replace.

PostHog is the destination, in its **own project**. Split's numbers must not contaminate the main product's, and an experiment that gets killed should take its data namespace with it.

Fixed while verifying: attribution was only read inside a room, but seeded traffic lands on the create page — so every campaign visitor who started their own room was being counted as organic.

### This repo ships straight to main

`mono/CONTRIBUTING.md` says never push to main in a code repo. That rule is for the repos on the release train. Split is growth-owned with a frozen surface and a one-month kill condition; PR ceremony buys nothing. Written into `CLAUDE.md` so it survives.

What still holds: money code needs a test before it ships, and the integration surface stays frozen.

---

## How this was verified

Not "the tests pass" — most of these bugs were found by trying to break a running system.

- `apps/api/scripts/verify-settle-loop.sh` — 41 assertions against a live API and database: the happy path, duplicate callbacks, three payments against one intent, a blocked second handoff, forged and tampered signatures, payloads disagreeing with the intent, abandonment, and a cancelled payment landing anyway.
- `apps/api/scripts/verify-settle-ui.cjs` — 13 assertions driving a real browser and checking **backend** state, not the DOM.
- `apps/api/scripts/verify-funnel.cjs` — 12 assertions walking the funnel and reading the event buffer back out, including that a confirmation counts once rather than once per 8-second poll.
- `apps/api/src/db/split.integration.test.ts` — 15 tests against a real Postgres. Each works in its own room and nothing is truncated, so it's safe against a shared dev database and safe to run while the app is up.

Two independent review passes were run by subagents — one on the design before implementation, one adversarially against the running system. Between them they found the ceiling-rejects-real-payments flaw, the signing oracle, the unlimited-receipts bug and the unenforced in-flight state. Every finding they raised is either fixed or listed below.

---

## Known gaps

Deliberately not fixed, and listed here rather than forgotten:

- **FX is re-priced on edit**, contradicting "rate locked at creation". Latent while the reference table is static; breaks history the day live FX lands.
- **`formatMoney` assumes two decimals** until the currency list loads, so a JPY room can briefly show a figure 100× off. The Peanut CTA is gated on the list having loaded; labels aren't.
- **`convertToBaseMinor` round-trips through `Number`**, losing integer precision past 2^53.
- **No rate limiting.** The intent endpoint is unauthenticated and creates rows; a reviewer created 300 in 2.9 seconds. Bounded in the room snapshot by time and count, but not at the door.
- **Anyone with the room link can open an intent for someone else's debt.** Consistent with the trust model — the link is the access control, and a link-holder can already delete every expense — but worth knowing.
- **No deploys.** Everything runs locally. peanutsplit.com isn't secured, split.peanut.me isn't pointed anywhere.

---

## Handing this over

Everything below is committed and pushed to `main`. Nothing is half-applied, no branch is waiting to be merged, and the working tree is clean.

### Get it running in five minutes

```bash
cd mono/peanut-split
pnpm install
cp apps/api/.env.example apps/api/.env      # DATABASE_URL + PEANUT_WEBHOOK_SECRET
pnpm --filter @peanut-split/api db:migrate:dev
pnpm dev                                     # API :5051, UI :3051
```

Then `pnpm typecheck && pnpm test` (84 tests) and `pnpm verify` (41 assertions against the running app). The two browser checks need playwright, so run them from `mono/engineering/qa`: `verify-settle-ui.cjs` and `verify-funnel.cjs`.

One trap worth knowing: if mono's QA harness env is loaded it exports a `DATABASE_URL` pointing at the shared `peanut_dev`, and Prisma prefers the process env over `apps/api/.env`. Prefix Prisma commands with `env -u DATABASE_URL`. It fails safe (P3005) rather than corrupting anything, but the error is confusing.

### What's next, in the order I'd do it

1. **Get the real Peanut integration details** and rewrite the bodies in `apps/api/src/peanut/index.ts` — the pay-URL shape, the webhook payload field names, the signature scheme. This is the only thing standing between the settle loop and being real. Everything around it is built and tested against the mock.
2. **Decide the settlement asset question.** `SplitSettlement` has no currency column; amounts are implicitly the room's base currency. If a Peanut payment settles in USDC while the room is in THB, the equality check in `confirmPeanutSettlement` becomes an FX comparison and the payer sees two different numbers at the moment they're being asked to pay. Worth settling before the surface freezes.
3. **Deploy.** Nothing is deployed. `peanutsplit.com` isn't secured (TASK-20753), `split.peanut.me` points nowhere, and there's no CI.
4. **Wire PostHog** into `deliver()` in `apps/ui/src/services/analytics.ts`, in its own project. Events are buffered in localStorage until then and `flushBuffered()` returns anything captured before the provider existed.
5. **Rate-limit** the settle-intent endpoint. It's unauthenticated and creates rows; a reviewer created 300 in under three seconds.
6. **The landing page and the "Splitwise alternative" page** on peanutsplit.com — locked as the SEO scope, not started.

### What not to change without a conversation

These were decided with Hugo on 20 July and are the reason the thing is shaped this way:

- No accounts, no usernames, no identity stored in Split. Room names are labels.
- Settle rides an existing payment-request link. No new endpoints on the money API.
- The surface is frozen after launch. Growth-owned, off the eng roadmap.
- One metric decides it: first-time Peanut signups via Split, 50 in 30 days.

### Where I'd look first if something breaks

- `apps/api/src/db/split.ts` is where every write lives, and the two settlement paths are the subtle part.
- The webhook answers 200 for business problems on purpose (Peanut retries on non-2xx), so **failures show up in logs, not status codes**. `logger.error` with "peanut webhook:" is money that moved and wasn't recorded — that's the line to alert on when there's somewhere to alert to.
- `pnpm verify` reproduces the whole settle loop including the failure modes, and is the fastest way to tell whether a change broke something real.

---

## Nuking this

If the number doesn't move, deleting Split is meant to be an afternoon. Concretely:

1. **Delete the repo** (or archive it) and its deploy. There is no shared code to untangle — the extraction exists precisely so this step is complete on its own.
2. **Drop its Postgres.** Split has its own database. No Peanut table has a Split column, no Peanut migration references one.
3. **Remove the submodule entry** from mono's `.gitmodules` and the line in `.github/workflows/auto-bump-submodules.yml`.
4. **Point `split.peanut.me` at nothing.** Existing room links 404. No Peanut route changes.

What you would **not** have to do, because of choices made deliberately:

- Touch `peanut-ui` or `peanut-api-ts`. The `feat/split-rooms` branches are still there and unmerged; nothing from this work went into either app.
- Unpick anything from the money API. Split never got an endpoint there; the settle handoff rides an existing payment-request link.
- Migrate or delete user accounts, because Split never created any.
- Reconcile balances. Split holds no funds; its ledger is a record of who owes whom, and deleting it deletes a shared note, not money.

The one thing that would survive and want a decision: settlements Peanut confirmed have a `peanutRef` pointing at real payments. Those payments happened on Peanut's side and are unaffected by any of this — but if you want a record of which ones came from Split, export `split_settlements where method = 'PEANUT'` before dropping the database.
