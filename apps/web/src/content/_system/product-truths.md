---
last_verified: 2026-07-30
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

## rated-currencies-158

**claim:** A room can use any of 162 catalog currencies. Split can automatically convert expenses
across 158 of them. CUC, KPW, SVC and XSU have no feed rate and work only when the expense and room
use the same currency. The indicative conversion rate is frozen onto the expense when it is created.

**safe:** "162 room currencies" · "158 currencies, converted at the day's rate" · "the rate is
indicative, not your bank's" · "the rate is fixed when the expense is added, so history does not
move"

**unsafe:** "any currency converts" · "all 162 currencies convert" · "150+" · "live rate" ·
"real-time rate" · anything implying the number moves after the expense is saved

**source:** `apps/web/src/lib/currency-catalog.ts` (162 catalog entries, 158 with `hasRate`) ·
`apps/web/src/lib/currency-rules.ts` (identity or two rated currencies) · `apps/web/src/server/fx.ts`
(live feed → cache → static table) · `apps/web/src/server/expenses.ts` (`fxRate` locked at creation
and reused on edit)

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
