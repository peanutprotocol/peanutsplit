---
last_verified: 2026-08-22
---

# Product truths

One fact, one place. Every product claim a page makes traces to a block below, and the page uses
that block's **safe** phrasing rather than inventing its own.

The reason is a failure that has already happened here twice: a wrong number written into ten pages
survives three corrections, because the correction fixes the pages someone remembered. Prose copies
of a fact drift; a citation does not.

How to read a block: the heading is the claim ID. `claim` is the fact. `safe` is language you may
use as-is. `unsafe` is language that overstates it — some of these are enforced by `NEVER_STRINGS` in
`src/lib/content.test.ts`, and the rest are on you. `source` is the code that decides the fact, so
the next person can check it rather than trust this file.

---

## automatic-currency-conversion

**claim:** The catalog recognises 162 currency codes, and 156 of them support automatic conversion
to the room's currency at the day's indicative rate. That rate is frozen onto the expense when it
is created. Split reads Peanut's public display-sell snapshot and caches it for 24 hours; during an
outage it may use a last-known-good rate for up to seven days, then falls back to the 12 core static
rates. The 12-rate table is also the only source in dev and test static mode.

**safe:** "automatic conversion for 156 currencies" · "converted at the day's indicative rate" ·
"the catalog recognises 162 currency codes" · "the rate is indicative, not your bank's" · "the
rate is fixed when the expense is added, so history does not move"

**unsafe:** "twelve currencies" as the production feature · "multi-currency" (says nothing) · "any
currency" · "all currencies" · "150+" · "live rate" · "real-time rate" · anything implying the
number moves after the expense is saved

**source:** `apps/web/src/lib/currency-catalog.ts` (162 generated entries, 156 with `hasRate`) ·
`apps/web/src/server/fx.ts` (Peanut snapshot → 24h cache → bounded seven-day stale cache → 12-rate
static table; the module says "Rates are indicative — surfaces that show one must say so") ·
`apps/web/src/server/money.ts` (`STATIC_USD_PER_UNIT`, the 12 core fallback rates) ·
`apps/web/src/server/expenses.ts` (`fxRate` locked at creation and reused on edit)

---

## room-size-20

**claim:** Copy says up to twenty people. The cap is real per imported source file only: a Splitwise
import over twenty source members is rejected, and over 500 expenses is truncated. Appending a
valid file to an existing room does not impose a 20-person cap on that room's accumulated roster.
Joining through the room link has no member cap at all — `POST /api/rooms/[slug]/members` does not
check one.

**safe:** "up to twenty people" · "a group, not a conference"

**unsafe:** "unlimited" · "any size group" · "no limit on people" · a number above twenty

**source:** `apps/web/src/lib/splitwise-csv.ts` (`MAX_MEMBERS = 20`, `MAX_EXPENSES = 500`) ·
`apps/web/src/app/api/import/route.ts` and `apps/web/src/app/api/rooms/[slug]/import/route.ts`
(enforce both per-file limits) ·
`apps/web/src/app/api/rooms/[slug]/members/route.ts` (no cap — open dev item, and the reason "up to
twenty" is a copy promise rather than a product guarantee)

---

## offline-creates-only

**claim:** Adding an expense works offline. It is queued on the device, survives a reload and a PWA
restart, and is sent in the order it was typed when the connection comes back. Nothing else is
queued: editing, deleting and recording a settlement all fail immediately and ask you to retry.

**safe:** "add an expense with no signal and it sends itself later" · "the queue is on your device" ·
"settling up needs a connection"

**unsafe:** "works offline" without saying which part · "full offline mode" · anything implying a
settlement or an edit can be made offline

**source:** `apps/web/src/lib/offline-queue.ts` — the module's own line is "ONLY EXPENSE CREATES ARE
QUEUEABLE", and it gives the reason: a create replayed late is still a true fact, an edit replayed
overwrites somebody silently, and a settlement replayed is a double payment recorded as fact.

---

## netting-is-bounded-exact

**claim:** For rooms with 18 or fewer non-zero balances, the suggested payment plan uses the minimum
possible number of transfers. Above that boundary, it uses a deterministic greedy plan so settlement
generation stays bounded as the exact search space doubles with every additional balance.

**safe:** "two or three transfers instead of twenty" · "a short payment plan" · "it nets the debts
down"

**unsafe:** Unqualified "fewest transfers" · "minimum number of transfers" · "optimal" · "the
smallest possible number of payments" — the interface does not expose which solver path was used

**source:** `apps/web/src/server/settlement.ts` (`suggestedTransfers`) and
`apps/api/src/split/math.ts` (`simplifyDebts`), including their shared
`EXACT_SETTLEMENT_MAX_NONZERO_BALANCES` boundary and deterministic greedy fallback

---

## settle-is-a-record

**claim:** Split moves no money and takes no custody. Settling marks a debt as paid because somebody
tapped to say it happened. The tap is the record. Nothing is verified against a bank, and the Peanut
settle path opens peanut.me and then records the payment on the payer's tap like any other.

**safe:** "settle however you like — cash, a bank transfer, Peanut — and record it" · "Split records
the payment, it does not make it" · "Split does not verify with any bank and cannot"

**unsafe:** "confirmed" · "verified" · "guaranteed" · anything implying the Peanut route is safer or
more trustworthy than cash · anything implying Split holds or moves funds

**source:** `peanutsplit/CLAUDE.md`, decision 2026-07-27: the soft launch ships the settle flow
unverified — the drawer opens peanut.me and the room records the payment on the payer's tap. Nothing
polls anything. Also `copy.ts`: "'settle however you like' must never imply the Peanut path is safer
than cash."

---

## link-is-the-key

**claim:** There are no accounts. The room link is the credential: whoever holds it can open the room
and add to it. Recent rooms and member tokens live on the device. Lose the link and lose the room.

**safe:** "the link is the key" · "no email, no password, no download" · "if the group loses the link,
the room is gone" · "there is no login and no password recovery"

**unsafe:** "unguessable" · "private" or "secure" as a bare adjective · "encrypted" · anything
claiming the link cannot be shared onward or guessed — we do not make claims about slug entropy

**source:** `peanutsplit/CLAUDE.md` (accountless by design; the slug is the room's access control) ·
`apps/web/src/lib/recent-rooms.ts` · the concession already written into
`src/content/alternatives/tricount-alternative/en.md`

---

## free-forever

**claim:** Split costs nothing and has no paid tier. It exists to introduce people to Peanut, which
is how it is paid for. There are no ads.

**safe:** "free forever, with nothing to upgrade to" · "no paid tier to sell you" · "Peanut makes it
to introduce people to Peanut, which is how Split gets paid for"

**unsafe:** the bare word "free" (reads as a trial) · "free tier" · "free plan" · "currently free" ·
any wording that implies a paid Split exists or could

**source:** `apps/web/scripts/marketing-copy-audit.mjs` — this one is mechanically gated: every
"free", "gratis" and "grátis" in the catalogs, the content tree and the marketing copy has to sit
next to the forever commitment or the audit fails. `copy.ts` states the intent: "Free forever is a
promise, not a growth line."

---

## no-app

**claim:** Split is a website. It installs as a PWA if the phone offers to, but there is no app store
listing and nothing to download.

**safe:** "no app store, no account" · "it is a website, so it works anywhere" · "adding it to your
home screen is a phone feature, not an install"

**unsafe:** "the app" for Split · "download Split" · "install the app"

**source:** live product copy — the landing page and the comparison pages already say this, and it is
the pitch, so "the app" (peanut.me's own house style) is unusable here.

---

## live-room-stream

**claim:** Every open room holds an event stream. A change on the server pokes the stream and the
phone refetches the room, so other people see it within seconds and nobody reloads. Polling never
stops: every 45 seconds while the stream is open, every eight seconds while it is not. A dropped
stream reconnects in the background with full-jitter backoff from one second, doubling to a
30-second ceiling. Balances are recomputed from the full list on every fetch.

**safe:** "shows up on the other phones a second or two later" · "no refresh, no tap" · "checks every
45 seconds as a backstop while the stream is open" · "about every eight seconds when the stream is
down" · "reconnects in the background with a growing, randomised delay"

**unsafe:** "instant" · "real-time" as a guarantee · "never misses an update" · "no polling" · a fixed
number of seconds for a reconnect · anything implying the stream carries the data (it only says when
to ask)

**source:** `apps/web/src/lib/queries/reads.ts` (`LIVE_POLL_MS = 45_000`, `FALLBACK_POLL_MS = 8_000`)
· `apps/web/src/lib/realtime.ts` (`BASE_BACKOFF_MS = 1_000`, `MAX_BACKOFF_MS = 30_000`,
`backoffDelay` full jitter) · `apps/web/src/app/api/rooms/[slug]/events/route.ts` (the poke carries
no data)

---

## receipt-scan-30-a-day

**claim:** A room can scan 30 bills a day. The limit is a token bucket of 30 per room over 24 hours
that refills gradually, counted per container, so it is roughly a day, not a midnight reset. It is
a ceiling on what one room can cost in model calls, not a tier.

**safe:** "a room can scan up to 30 bills a day" · "a limit on the cost of running it, not a tier you
can buy your way out of"

**unsafe:** "unlimited scans" · "30 per person" · "resets at midnight" · anything implying a paid
tier lifts it

**source:** `apps/web/src/server/receipt.ts` (`ROOM_SCAN_LIMIT = { capacity: 30, windowMs: 24h }`,
and the comment on why it is a bucket) · `apps/web/src/app/api/rooms/[slug]/receipt-parse/route.ts`
(`enforceRoomScanLimit`, after the per-IP limiter)

---

## receipt-photo-handling

**claim:** The photo goes to a Gemini model, over OpenRouter when that key is set (the request
demands `data_collection: deny` and zero data retention from the provider) or directly to Gemini
only when the operator confirms a paid-tier project. The server keeps no image, merchant name or
line, and logs none of it. The model's arithmetic is re-summed and compared with the printed total.
A photo shared into the installed Android app is parked on the device in Cache Storage, handed to
one room once, rejected after ten minutes, and an expired copy is cleared on the next app boot.
Only the expense the person approves is saved.

**safe:** "Split sends the photo to Gemini for reading, either through OpenRouter or directly" ·
"its server does not save the image or extracted lines" · "single-use and rejected after ten
minutes" · "what Split saves is the expense you approve" · "Google's paid-tier terms allow
temporary logging for abuse monitoring"

**unsafe:** "processed on your device" · "never leaves your phone" · "encrypted" · "deleted" as if
Split had stored it · any retention period stated for Google or a provider beyond their own terms

**source:** `apps/web/src/server/model.ts` (transport choice, `provider: { data_collection: 'deny',
zdr: true }`, `SPLIT_GEMINI_PAID_TIER_CONFIRMED`, nothing persisted or logged) ·
`apps/web/src/server/receipt.ts` (image never persisted, sum recomputed beside the model's total) ·
`apps/web/src/lib/shared-receipt.ts` (`SHARE_TTL_MS = 10 min`, `takeSharedReceipt` one-shot,
`sweepSharedReceipt` on boot)

---

## offline-queue-30

**claim:** The offline queue holds at most 30 expenses per device, across rooms. Past that the
oldest draft that is not blocked for review is dropped and the person is told; if all 30 are
blocked, the new one is refused. The queue drains one expense at a time in the order typed.

**safe:** "thirty expenses per device" · "up to thirty of them" · "past that the oldest is dropped
and you are told" · "sends in the order you typed, never in parallel"

**unsafe:** "unlimited" · "thirty per room" · any guarantee that nothing is dropped · any number
other than thirty

**source:** `apps/web/src/lib/offline-queue.ts` (`MAX_QUEUED = 30`, `appendQueued` evicts the
oldest unblocked draft and returns it so the UI can say so, sequential drain)

---

## recap-card

**claim:** The recap is shared as a PNG, never as a URL, because the recap URL carries the room
slug and the slug is the credential. The file is named `peanut-split-recap.png` and the card prints
the product domain, not the room address. It shows the room's total spend, expense count, people
count, day count, recorded payments and who fronted the most; it shows no per-person balance. The
settled stamp appears only when the room has at least one expense and every net balance is zero.
The recap screen renders for an unsettled room as a recap so far; the share button renders only
once the room is settled.

**safe:** "shared as an image instead" · "the card shows what the group spent and who fronted the
most, not what anyone owes" · "a settled stamp once everybody is square" · "an empty room is not
settled, it is empty" · "the share button waits for settled"

**unsafe:** "share the recap link" · "anonymous" · "the card shows balances" · "settled" on a room
with open balances or no expenses

**source:** `apps/web/src/lib/recap.ts` (the image-not-link argument, `RECAP_FILE_NAME`) ·
`apps/web/src/components/room/RecapShareButton.tsx` (`navigator.share({ files })`) ·
`apps/web/src/server/og/recapCard.ts` (`isSettled`: expenses present and every balance `0n`; the
card fields) · `apps/web/src/server/og/recapCardArt.tsx` (stamp only when settled; printed domain)
· `apps/web/src/app/(product-shell)/r/[slug]/recap/page.tsx` and
`apps/web/src/components/room/WrappedDeck.tsx` (share button inside the settled-only deck)
