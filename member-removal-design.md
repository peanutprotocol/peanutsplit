# Removing a member from a PeanutSplit room

> **Decision update — 2026-08-03:**
> [`docs/ROSTER-IDENTITY.md`](docs/ROSTER-IDENTITY.md) supersedes any language
> here that implies a roster entry is waiting to be claimed. A room name is a
> ledger participant. Selecting it on a device is only a viewpoint, not
> ownership, permission, activation, or roster completion.

- **Status:** approved design as of 2026-07-29; not implemented
- **Scope:** the live `apps/web` product first; `apps/api` parity is called out separately
- **Primary goal:** protect a room from accidental member additions without changing its financial history

## Recommendation

Ship a deliberately narrow first version:

> Prevent new ghosts by staging an inline person until the expense saves, and
> allow an existing roster entry to be soft-removed only when it has no
> persisted footprint. Neither path ever deletes or rewrites financial history.

For V1, "no persisted footprint" should mean both:

1. **No financial footprint:** the member is not a payer, expense-share
   participant, or either side of a settlement, including on soft-deleted rows.
2. **No attribution, social, or subscribed-device footprint:** the member did
   not author an expense or settlement, react, or enable push.

The first condition is the non-negotiable ledger guard. The second keeps the
feature honestly scoped to accidental cleanup in an ownerless room. If the
second condition proves too strict, the next feature should be an explicit
**former member** state, not a looser delete.

This predicate is a conservative, database-observable proxy for an accidental
entry. It cannot prove that nobody intentionally joined under that name. A real
person who joined but did nothing is indistinguishable from a typo in the
current model and remains removable under the room's flat trust model. If that
is unacceptable, the product needs creation provenance such as
`INLINE_PAYER | JOIN`, or a one-use removal capability returned only with the
inline creation response.

The main prevention and cleanup UX should be:

- stage an inline payer locally, then atomically create the member and expense
  on Save; cancelling creates no member;
- a **People in this room** drawer in room settings for later cleanup;
- a clear blocked state with the affected history explained;
- a 10-second Undo after removal plus a durable, collapsed **Removed people**
  section.

If atomic staged creation cannot ship immediately, **“Added Bea · Undo”** is a
transitional mitigation. It must undo both the server member and every local
reference in the open expense draft; server-only removal leaves an invalid
draft.

Do not call this banning, kicking, or revoking access. PeanutSplit is link-based:
someone who still has the room link can still open the room and add or claim a
name. V1 removes a roster entry from future splits; it does not remove a human's
access.

## Why this feature is needed

The current expense flow persists a new payer immediately. Closing or cancelling
the expense drawer does not roll that member back
([`ExpenseDrawer.tsx`](apps/web/src/components/room/ExpenseDrawer.tsx#L158-L180)).
That leaves a ghost name in the room.

The ghost is not merely visual. For an untouched EQUAL expense, the client means
“everyone at save time,” and the server expands that to every room member
([`expense-form.ts`](apps/web/src/lib/expense-form.ts#L23-L32),
[`expenses.ts`](apps/web/src/server/expenses.ts#L62-L79)). An accidental member
can therefore start receiving shares in later expenses unless someone notices
and manually excludes them every time.

Once that happens, unused-only removal correctly blocks. Therefore removal alone
is a time-sensitive cleanup tool, not complete accidental-add protection.
Staging the inline member and creating the member plus expense atomically is the
prevention layer.

The schema already anticipates soft removal with `Member.removedAt`, but the
field is not used by any current route or query
([`schema.prisma`](apps/web/prisma/schema.prisma#L44-L67),
[`roomState.ts`](apps/web/src/server/roomState.ts#L10-L34)). There is only a
member `POST` route; no remove or restore route exists
([`members/route.ts`](apps/web/src/app/api/rooms/[slug]/members/route.ts)).

## Product truths that constrain the design

### 1. There is no room owner or administrator

The room link is the room credential. The product deliberately has no accounts,
roles, or ownership. Most writes are allowed to anyone holding the link. Member
tokens prove a small set of identity-sensitive actions, but even an existing
member can be claimed locally without a token
([`JoinGate.tsx`](apps/web/src/components/room/JoinGate.tsx#L26-L34),
[`identity.ts`](apps/web/src/lib/identity.ts#L1-L21)).

This means the product cannot honestly answer “who has permission to kick
someone?” without introducing a new authorization model. The narrow unused-only
cleanup fits the existing flat trust model because it is reversible and changes
no money.

### 2. A roster identity and a person's access are different things

Soft-removing member ID `m1` can:

- exclude `m1` from new payer and participant selectors;
- invalidate `m1`'s proof token;
- delete `m1`'s push subscriptions;
- remove `m1` from active counts and invitation artwork.

It cannot stop the human from following the shared link, claiming another
existing name, or adding a new one. Actual eviction would require one of:

- rotating the room slug and redistributing a new link;
- per-person invitations or credentials;
- accounts plus room roles.

Those are separate product decisions and are out of scope for accidental-add
protection.

There is also no pending, per-person invitation entity today: sharing the room
link does not create a Member. If invitations are introduced later, **Cancel
invite** should revoke the pending credential without creating a member
tombstone.

### 3. Financial history must remain legible

The authoritative balance is:

```text
member net
  = expenses they paid
  - their materialized expense shares
  + settlements they sent
  - settlements they received
```

That fold lives in
[`roomState.ts`](apps/web/src/server/roomState.ts#L46-L76). Every expense's
shares must reconstruct its room-currency total exactly
([`expenses.ts`](apps/web/src/server/expenses.ts#L81-L82)).

Removal must preserve these invariants:

1. Every expense's shares still sum exactly to its base amount.
2. All member balances still sum to zero.
3. Every non-zero balance belongs to a named ledger identity.
4. Every suggested transfer names two identities that can still be shown and
   settled.
5. Deleted-but-restorable rows remain explainable.
6. A member who is inactive for future work cannot silently become a participant
   in a new write.
7. The removal check and a competing money write cannot both win.

### 4. Hard deletion is not safe

The current Prisma relations cascade from a member into paid expenses, expense
shares, settlements, reactions, and push subscriptions
([`schema.prisma`](apps/web/prisma/schema.prisma#L68-L92),
[`schema.prisma`](apps/web/prisma/schema.prisma#L99-L121),
[`schema.prisma`](apps/web/prisma/schema.prisma#L121-L154),
[`schema.prisma`](apps/web/prisma/schema.prisma#L187-L203)). Authorship
relations use `SetNull`, but that still destroys attribution.

Deleting one member row can therefore delete:

- a whole expense that member paid;
- that member's share from an expense somebody else paid;
- a settlement involving them;
- social and notification history.

That is not member removal. It is an unreviewed rewrite of everyone else's
ledger. Even a currently unused member should be soft-removed because soft
removal provides Undo and avoids depending on today’s relation graph remaining
simple forever.

### 5. Filtering a historical member out of the current balance fold is unsafe

`balancesOf()` initializes its map from `room.members` and ignores a debit or
credit whose member ID is absent from that map
([`roomState.ts`](apps/web/src/server/roomState.ts#L60-L75)). Therefore this
implementation is wrong:

```text
load only members where removedAt is null
+ retain their old expenses and settlements
+ run balancesOf()
```

It can leave a creditor without a debtor, make the balances no longer sum to
zero, produce incomplete transfers, or falsely show that nothing remains to
settle.

The narrow V1 avoids this problem because an eligible member has no financial
references. Any broader “former member” feature must explicitly separate the
**active roster** used for future splits from the **ledger directory** used for
history, balances, and settlement.

## Terms

The UI and implementation should keep five operations distinct:

| Operation                            | Meaning                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------- |
| **Remove unused person**             | Hide a pristine roster entry from future use; reversible; V1 proposal.                        |
| **Leave / mark as former**           | Stop future participation while preserving historical or outstanding balances; later feature. |
| **Forget “who I am” on this device** | Clear local identity only; the existing “I’m not {name}” action already does this.            |
| **Ban / revoke access**              | Stop a human opening the room; impossible with the current shared-link model.                 |
| **Merge duplicates**                 | Combine two member identities after financial activity; separate correction workflow.         |

Using “remove” for all five would create false expectations and dangerous
implementation shortcuts.

## Decision flow

```text
Inline name has not been saved
  ├─ Cancel/clear ─► discard local name; no Member row exists
  └─ Save ─────────► atomically create Member + expense

Member row already exists
  └─ Server checks all live and soft-deleted dependencies
       ├─ No persisted footprint ─► soft-remove from active roster (V1)
       └─ Any persisted footprint ─► keep active and explain why (V1)
            ├─ Future: exact net is zero ─► mark Former
            ├─ Future: net is non-zero ───► settle first or Former with balance
            └─ Actually a duplicate ──────► separate merge workflow
```

This separates prevention, lifecycle, and correction. They must not be hidden
behind one destructive “Remove” action.

## Options

### Comparison

| Option                                                    | What happens to history                                              | Settlement rule                               | UX value                                    | Risk / cost                                                      | Verdict                                |
| --------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------- |
| Prevention: stage inline creation                         | No member or expense exists until Save; Save creates both atomically | Not applicable before Save                    | Eliminates the current cancel-created ghost | Requires a combined transactional save path                      | **Required companion**                 |
| 1. Remove only a pristine member                          | Nothing changes                                                      | No balance can exist                          | Directly fixes ghost/accidental additions   | Narrow; a real but inactive member may be blocked                | **Recommended V1**                     |
| 2. Remove anyone with no financial footprint              | Non-financial attribution remains                                    | No balance can exist                          | Slightly more flexible than option 1        | Can remove a real author/reactor/subscriber in an ownerless room | Possible later relaxation              |
| 3. Mark a historical member Former when their net is zero | All rows remain; member shown as Former in history                   | Exact room-currency member net must be `0`    | Cleans old trip/household rosters           | Old edits/deletes/restores can recreate a balance                | Good V2 with a former-member model     |
| 4. Mark as former even with an outstanding balance        | All rows and the balance remain visible                              | Former member stays in settle flow until zero | Handles someone leaving before settlement   | More states and copy; cannot revoke their link access            | Most complete long-term model          |
| Workflow: clear net first, then mark Former               | Same as option 3                                                     | Guide the group to record a real payment      | Clear sense of financial closure            | Can trap cleanup; a recorded settlement may be disputed          | Recommended path, not an absolute gate |
| Correction: merge a duplicate identity                    | Rows are explicitly transformed with a preview and audit             | Net result must be preserved exactly          | Repairs true duplicates                     | High complexity; collisions and self-settlements                 | Separate advanced correction           |
| Correction: transfer responsibility                       | Adds an explicit liability-transfer fact                             | Obligation moves; no payment is claimed       | Models an agreed reassignment               | Requires consent/audit semantics                                 | Separate future model                  |
| 7. Remove from every expense and recompute                | Past rows and everyone’s balances change                             | Recomputed debt replaces original intent      | Looks convenient for a mistaken inclusion   | Destroys audit truth; FX/EXACT edge cases                        | Reject as normal removal               |
| 8. Hard-delete and rely on cascades                       | Expenses/shares/settlements disappear                                | Debt can vanish                               | Technically small                           | Catastrophic ledger corruption                                   | **Never**                              |
| Access-control alternative: ban a person                  | No direct ledger effect                                              | Independent                                   | Matches “kick” expectations                 | Impossible with a reusable shared link and no accounts/roles     | Out of scope until auth changes        |

### Option 1 — pristine-only soft removal

This is the safest interpretation of “protect against accidental adds.”

Eligibility:

- no expense where the member is payer;
- no expense share for the member;
- no settlement where they are sender or recipient;
- include live and soft-deleted rows in every check;
- for the strict V1, also no authored write, reaction, or push subscription.

Successful removal:

1. Set `removedAt` in a room-locked transaction.
2. Defensively delete push subscriptions in the same transaction. Strict
   eligibility normally proves none exist, but this closes migration/race
   anomalies and becomes required if eligibility is later relaxed.
3. Exclude the member from the active join roster, new expense payer list,
   EQUAL/EXACT participant lists, active counts, and invite artwork.
4. Treat their token as invalid for attribution, reactions, and push.
5. Publish the room update after commit.
6. Show “Bea removed” with Undo.
7. Keep the member row as the reversible tombstone.

Blocked removal:

- explain that the person has room history;
- show counts of affected expenses/payments;
- link to the affected records where practical;
- do not imply that settling alone will make removal possible under this strict
  policy.

Advantages:

- no money changes;
- simple mental model;
- directly targets the existing ghost-member bug;
- safe to undo;
- no “former member” UI is required.

Limitations:

- a member who appeared in one old expense remains active even after their net
  later returns to zero;
- it is cleanup, not a complete member lifecycle;
- deleted-but-restorable history still blocks removal.

### Option 2 — financial-footprint-only guard

This is the user's suggested rule in its pure form:

> Allow removal if the member is not part of any expense or settlement.

It is financially safe if “part of” includes payer, share, settlement sender,
and settlement recipient across both live and soft-deleted rows.

The difference from option 1 is that an identity could have authored expenses
for other people, reacted, or enabled push without holding a balance itself. A
link-holder could then remove that real identity from the roster.

This may be acceptable if:

- removal stays visibly reversible;
- non-financial attribution retains the tombstoned name;
- push is disabled;
- the product accepts the room's existing flat-trust moderation model.

This is not merely a predicate relaxation in the current wire model. If the
removed member disappears from `state.members`, authored writes and reactions
can no longer resolve their ID to a name. Preserving attribution requires the
historical identity directory/status-bearing member shape described below.
Therefore this option belongs with the Former-member work, and it is not the
recommended starting point.

### Option 3 — mark Former when this member's net is zero

A used member with exact net balance `0` can become **Former**.

Settlement meaning:

- PeanutSplit currently folds every expense into the room currency at its
  locked FX rate. “Zero” is therefore exact `0n` in the one room-currency
  ledger—not a floating tolerance and not a separate test in each expense
  currency.
- Historical expenses and settlements remain unchanged.
- The former member is excluded from new expenses but remains resolvable by
  name in old activity and derivations.

The hard part is what happens after they become Former:

- deleting or restoring an old expense can make the former member non-zero;
- changing an amount or split can make the former member non-zero;
- deleting a settlement can reopen debt.

There are three coherent policies:

1. **Freeze affected history.** Simple accounting, frustrating correction UX.
2. **Allow edits and automatically surface the former member again in balances
   and settlement when non-zero.** Honest and flexible; more UI state.
3. **Reactivate before any edit that changes their financial contribution.**
   Explicit, but adds ceremony.

If this option is built, policy 2 best matches PeanutSplit's auditable,
correctable ledger. A “Former · owed €42.50” section is more truthful than
silently blocking a legitimate correction.

### Option 4 — mark as former now, settle later

The member stops participating in future expenses immediately, even with a
non-zero balance.

Logical result:

- they disappear from the active join roster and future participant defaults;
- they remain in balance cards or a dedicated Former section while non-zero;
- they remain an endpoint of suggested transfers and recorded settlements;
- their old expenses remain fully readable;
- when their exact balance reaches zero, they collapse into historical display
  only.

This is the cleanest long-term model because “is still part of future group
spending” and “still has accounting history” are genuinely different facts.

It is not an access-control feature. The former person still has the room link.
Their push and proof token can be disabled, but they can rejoin under the
current trust model.

The UX cost is substantial:

- Active and Former sections;
- former-member labels throughout history;
- settlement copy for a person no longer active;
- rules for reactivation and old-expense edits;
- clearer stale-device behavior.

### Supporting workflow — clear this member's net, then mark Former

This is a UX path layered on option 3 or 4, not a distinct data model.

When a used member has a non-zero balance:

```text
Bea is owed €42.50.

[Settle first]    [Keep Bea active]
```

If the broader former-member model exists, an additional action can be:

```text
[Mark as former and keep the balance]
```

“Settle first” should be the recommended path because it leaves the room clean.
It should not be the only possible path in a future moderation or self-leave
feature: a disputed debt, missing person, or access concern should not force the
group to record a payment that did not happen.

Critically, do not invent a settlement to make removal pass. A Settlement row
asserts that money moved. Member lifecycle must not manufacture one.

### Correction workflow — merge a duplicate identity

If “Bea” and “Bea phone” are the same human and both already have history, the
real task is **merge identities**, not remove one.

An atomic merge would need to:

- reassign payer references;
- combine shares if both IDs occur on one expense while preserving both base and
  entered amounts;
- resolve the unique `(expenseId, memberId)` constraint;
- convert settlements between the two IDs into an explicit reviewed outcome
  rather than an invalid self-settlement;
- resolve duplicate reactions;
- drop or deliberately rebind push channels;
- preview every balance before and after;
- retain an audit event saying which identity was merged and by whom.

This can be valuable, especially after imports, but it is a separate,
high-judgment correction flow.

### Correction workflow — transfer responsibility

“Transfer Bea's balance to Alex” is not a merge and is not a settlement. It
changes who accepts an obligation without claiming that money moved. If the
product ever supports it, it needs an explicit liability-adjustment or
responsibility-transfer row, a before/after preview, an actor/audit record, and
clear consent semantics. It must never be implemented by fabricating a payment
or silently rewriting old expense shares.

### Option 7 — remove from expenses and recompute

An automated cleanup wizard could remove the member from every share and
redistribute totals among the remaining participants. It sounds convenient but
changes the economic meaning of old expenses.

Questions with no universal answer:

- If the removed member paid, who becomes the payer?
- For an EQUAL expense, is their share spread across everyone originally
  included or everyone active today?
- For an EXACT expense, who absorbs their exact amount?
- If the expense used foreign currency, how are entered amounts and converted
  base amounts preserved?
- What happens to settlements that were recorded against the old balances?

This must never be a side effect of “Remove.” At most, offer a separate
**Fix accidental participation** workflow that:

- lists every affected expense;
- requires an explicit correction for each;
- previews before/after balances;
- preserves locked FX;
- gives no generic “recompute everything” shortcut;
- records an audit reason.

The ordinary removal guard succeeds only if corrections genuinely remove every
database reference. Some blockers deliberately cannot be edited away in V1:
authorship remains attribution, deleted rows still count, and settlements remain
audit history. Do not promise that this workflow always ends in removal.

## Recommended V1 behavior in detail

### State model

Use the existing `removedAt` timestamp.

```text
ACTIVE
  └─ remove, if pristine ─► REMOVED_UNUSED
                               └─ undo / same-name restore ─► ACTIVE
```

Do not introduce `FORMER` in V1. A financially referenced member remains ACTIVE
and receives a blocked explanation. This avoids pretending the current
one-roster wire model can safely represent historical inactive people.

### Who can remove

Recommended V1: any person holding the room link can remove an eligible unused
entry, subject to the existing write rate limit.

Why:

- the room has no owner or admin;
- tokenless claiming is an intentional product behavior;
- the action cannot change money;
- the action is undoable;
- the person cannot truly be banned and can rejoin.

A transitional Undo immediately after eager inline payer creation may carry a
one-use undo nonce returned with that creation. The current member token is only
bearer proof of possession of the creation response; it is not device-bound and
does not prove who created the entry. Do not describe it as creator or device
authorization.

If the team does not accept link-level removal, authorization must be decided
before implementation. “Only admins” is not a usable requirement because no
admins exist.

### Last member and self-removal

- Block removal of the last active member in V1. It does not help the
  accidental-add case and creates empty-room/default-payer edge states.
- Self-removal can be allowed when another active member remains. The success
  response must clear or invalidate the local identity and reopen the join gate.
- Keep **“I’m not {name}”** as a separate device-only action; it does not alter
  the room roster.

### Name reuse and Undo

Do not create a second member ID for the same removed accidental entry.

- Show Undo for 10 seconds. Short Undo clears `removedAt` on the existing row
  and preserves the token so the same device's proof works again.
- Keep tombstones in a collapsed **Removed people** section in the People
  drawer. A deliberate Restore reuses the ID but rotates the old token; restoring
  from settings must not assign the restorer the restored person's identity.
- A later same-name join shows **“Bea was removed. Reactivate Bea?”** rather
  than doing it silently. Confirmation reuses the member ID, rotates the old
  token, and returns the fresh token only to that join response.
- Repeated DELETE, repeated Restore, and an Undo that loses a race to an already
  completed reactivation are successful no-ops returning fresh state.
- Case-insensitive duplicate detection must distinguish ACTIVE from
  REMOVED_UNUSED; today it searches every row
  ([`rooms.ts`](apps/web/src/server/rooms.ts#L51-L71)).

Reusing the row avoids an accumulating graveyard of indistinguishable “Bea”
identities. A one-use Undo nonce or a server-enforced short `removedAt` window
must distinguish token-preserving Undo from later token-rotating reactivation.

V1 does not need a durable membership event log because eligible removal changes
no money or historical attribution. `removedAt` records the current state;
clearing it deliberately erases the cleanup transition. If auditability becomes
a requirement, add `MembershipEvent(ADDED, REMOVED_UNUSED, RESTORED, at,
actorId?)`; in an ownerless room the actor is unknown unless a valid member
token was supplied.

### Suggested copy

People drawer:

```text
People in this room

Bea
Checking…

Bea
No saved room activity
[Remove]
```

Confirmation:

```text
Remove Bea from this room?

Bea has no saved room activity. They will no longer
appear in new splits. Anyone with the room link can still join again.

[Remove Bea]  [Cancel]
```

Success:

```text
Bea removed.  [Undo]
```

Blocked:

```text
Bea has room history

This version removes only people with no saved activity. Bea's records will
stay unchanged.

[View visible history]  [Done]
```

Only offer **View visible history** when the server identifies activity the
current UI can open. A blocker that exists only in soft-deleted history,
authorship, reactions, or push should get neutral explanatory copy, not a
misleading correction link. Never instruct the user to edit valid financial
history merely to unlock removal.

Stale identity:

```text
Your name is no longer on this room's list.

Choose your name or join again.
```

Avoid “access revoked,” “kicked,” or “banned.”

### Placement

Add a **People in this room · N** row to the existing room settings drawer in
[`RoomHeader.tsx`](apps/web/src/components/room/RoomHeader.tsx). It should open a
dedicated People drawer rather than putting destructive actions beside sound,
haptics, language, and theme controls.

`RoomHeader` should receive an `onManagePeople` callback. `RoomScreen`, which
owns the full `RoomState`, should close settings, drive `?people=1`, and render
the `PeopleDrawer` with state and identity/token context. This preserves the
existing URL/back-button drawer model instead of putting roster mutations
inside the header.

The preferred inline flow does not create a member when the name is typed:

```text
New payer: Bea

[Save expense]  [Cancel]
```

Save must atomically create Bea and the expense under the same room transaction;
Cancel simply discards local state. Sequential “create member, then create
expense” still leaves a ghost if the second request fails.

If the current eager creation temporarily remains, show **“Added Bea · Undo”**.
That Undo is a compound client action. After server removal succeeds:

- restore the previous/default active payer;
- remove Bea from `participantIds` and `exactInputs`;
- rerun validation;
- if Bea held a non-zero EXACT allocation, leave that amount explicitly
  unallocated for the user rather than redistributing it.

If expense Save or another device's write wins the race, Undo receives
`MEMBER_HAS_HISTORY`, keeps the member, and explains that the now-saved expense
must be reviewed. The same stale-draft recovery is required for an online draft
left open while another device removes Bea.

## Engineering appendix

### Server and data implications

#### Dependency check

The eligibility query must include all historical rows, not only currently
visible ones:

- `Expense.paidById = memberId`, regardless of `deletedAt`;
- any `ExpenseShare.memberId = memberId`; its parent expense may be deleted;
- `Settlement.fromId = memberId` or `Settlement.toId = memberId`, regardless of
  settlement `deletedAt`;
- strict V1 attribution checks: both `Expense.createdById` and
  `Settlement.createdById`, including soft-deleted rows;
- strict V1 social/device checks: reactions and push subscriptions.

Counting soft-deleted rows matters because expenses have a restore path and
settlements are retained for audit. A member must not become “unused” merely
because the related row is temporarily hidden.

#### Eligibility read model

The current `RoomState` cannot answer whether removal is allowed: it omits
soft-deleted rows and push subscriptions. The People drawer must not infer
eligibility or promise exact blockers from visible client state.

Add a server-derived read such as:

```text
GET /api/rooms/:slug/members/removal-eligibility
```

It can return one coarse entry per active member plus the narrow tombstones
needed by the collapsed Removed people section:

```ts
interface RemovalDirectory {
  active: Array<{
    memberId: string
    eligible: boolean
    blockers: {
      visibleExpenses: number
      visibleSettlements: number
      hiddenFinancialHistory: boolean
      otherActivity: boolean
    }
  }>
  removedUnused: Array<{ memberId: string; name: string; removedAt: string }>
}
```

Each directory entry may expose that member's own display name. Blocker evidence
must not expose other names, push endpoints, reaction content, amounts, or
deleted-row details. The DELETE route must rerun the check under the room lock
and return a structured `409 MEMBER_HAS_HISTORY` if the read became stale. This
requires extending the current code/message-only `ApiError` shape with typed
details. Contract tests should cover counts, redaction, and a stale eligibility
result.

#### Active versus ledger membership

For V1, eligible removed members have no ledger references, so the API can safely
exclude them from the returned active `members` list and from the balance seed.

For any V2 that removes used members, do not overload the existing list. Use an
explicit shape such as:

```ts
interface ApiMember {
  id: string
  name: string
  status: 'ACTIVE' | 'FORMER'
  createdAt: string
}
```

Then centralize:

- active members for new payers/participants, join gate, counts, and invitation
  artwork;
- all ledger members for history lookup, balance folding, derivations, and
  settlements.

Every current consumer assumes `state.members` serves both roles. A V2 must
audit ExpenseDrawer, JoinGate, ExpenseList, BalanceStrip, BalanceDrawer,
SettleDrawer, derivations, offline drafts, push copy, room OG, and recap.

#### Token and push behavior

On removal:

- defensively delete the member's push subscriptions in the locked transaction,
  even though strict eligibility normally proves none exist;
- make `memberIdForToken` ignore removed members;
- make `assertProvenMember` reject removed members;
- reject new expense/settlement/reaction/push writes targeting the removed ID.

Delivery currently queries subscriptions by room rather than active membership
([`push.ts`](apps/web/src/server/push.ts#L140-L149)), so setting `removedAt` alone
would continue notifying the removed member if an anomalous/racing subscription
survived.

#### API shape

Atomic staged creation needs an expense input that can reference a local person
without first creating a Member. One coherent request shape is:

```ts
type MemberRef = { memberId: string; clientRef?: never } | { clientRef: string; memberId?: never }

interface AtomicExpenseInput {
  newMembers: Array<{ clientRef: string; name: string }>
  paidByRef: MemberRef
  participantRefs?: MemberRef[] // omitted means EQUAL across everyone
  exactShares?: Array<{ memberRef: MemberRef; amountMinor: string }>
  // the existing expense fields, including clientKey
}
```

Under the room lock, the server resolves case-insensitive names, creates any new
rows, maps every request-local reference to a real ID, derives shares, and
inserts the expense in the same transaction:

- request validation requires exactly one of `memberId` or `clientRef` in every
  reference;
- omitted EQUAL participants means every active member plus request-local new
  members;
- explicit EQUAL participants resolve and deduplicate all refs;
- EXACT shares resolve refs without changing entered/base amounts and must pass
  the existing exact-sum invariant;
- an active same-name row resolves to that existing ID;
- a removed same-name row returns `MEMBER_REACTIVATION_REQUIRED` so the client
  can ask explicitly rather than create a duplicate or silently restore it.

The offline queue stores and replays this self-contained body. The response
returns the real member ID mapping and fresh `RoomState`, but no identity token:
adding Bea as a payer does not mean the current device is claiming to be Bea.
No failure may commit only the Member half.

The member lifecycle surface would be:

```text
DELETE /api/rooms/:slug/members/:memberId
POST   /api/rooms/:slug/members/:memberId/restore
```

Both should:

- use the write rate limit;
- be idempotent;
- return the complete fresh `RoomState`;
- publish the SSE room update only after commit;
- use typed error codes such as:
  - `MEMBER_NOT_FOUND`
  - `MEMBER_HAS_HISTORY`
  - `LAST_ACTIVE_MEMBER`
  - `MEMBER_NAME_CONFLICT`
  - `MEMBER_REACTIVATION_REQUIRED`
  - `UNDO_EXPIRED`

DELETE returns `{ roomState, undoToken, undoExpiresAt }`. The token is a signed,
one-use capability bound to `roomId`, `memberId`, and the original `removedAt`;
its expiry is exactly 10 seconds after removal. Retrying DELETE for the same
tombstone returns a capability with the same original expiry, so a network retry
cannot extend the Undo window.

Restore accepts `{ undoToken?: string }`:

- a valid, unconsumed token within the window clears `removedAt` and preserves
  the old member token;
- an invalid, consumed, or expired supplied token returns `UNDO_EXPIRED` without
  restoring, after which the UI can offer deliberate settings Restore;
- settings Restore without `undoToken` rotates the old member token and does not
  return or assign the restored identity;
- same-name reactivation uses the ordinary member/join response and returns the
  rotated token to that caller.

DELETE of an already removed member and restore of an already active member each
otherwise return `200` with unchanged fresh state. Repeating a successfully
consumed Undo therefore becomes an idempotent success because the member is
already active. The restore route should only restore a narrow unused tombstone
in V1.

### Concurrency and offline behavior

#### Membership-write races

A transaction that checks “no references” and then sets `removedAt` is still
incorrect if expense creation can race it:

```text
1. Expense request loads Bea as active.
2. Removal transaction finds no references and removes Bea.
3. Expense request inserts a share for Bea; the foreign key succeeds because
   the member row still exists.
```

Every operation that can create an eligibility dependency or target active
membership must take the same room-scoped advisory lock: member removal/restore,
same-name add/reactivation, expense create/edit, settlement create, reaction
add, and push subscribe. Each must reload `removedAt` and repeat membership and
proof validation inside the locked transaction before writing. Authorization
before the lock is only a preflight optimization.

Settlement creation already uses such a lock; expense create/edit currently do
not
([`settlements/route.ts`](apps/web/src/app/api/rooms/[slug]/settlements/route.ts#L25-L35),
[`expenses/route.ts`](apps/web/src/app/api/rooms/[slug]/expenses/route.ts#L16-L39)).
Reaction creation currently has no room lock, and push validates membership
before its lock
([`reactions/route.ts`](apps/web/src/app/api/expenses/[id]/reactions/route.ts),
[`push-subscriptions/route.ts`](apps/web/src/app/api/rooms/[slug]/push-subscriptions/route.ts)).

A normal foreign key cannot express “the referenced member must have
`removedAt IS NULL`,” so either shared locking/revalidation or a database trigger
is necessary.

Keep the critical section short. Resolve FX/rate-table inputs outside the
transaction; then lock, repeat the idempotency lookup, reload the active roster,
derive using the already-held rate input, and write atomically. Do not hold a
database connection and advisory lock across external/cache FX work.

#### Offline expense replay

Another device may hold an unsent expense that references Bea. The server cannot
see that draft when removal succeeds. On replay:

- the server must reject the inactive member as `NOT_A_MEMBER`/`MEMBER_REMOVED`;
- the queue must not silently retarget or redistribute the expense;
- a member-related 4xx must move the request body, `clientKey`, and structured
  error into a separate recoverable-blocked store, not remain in the normal
  retry queue and not be discarded;
- recovery must offer **Review**, **Retry after remapping**, and **Discard**;
- the user should get specific recovery copy:

```text
An unsent expense could not be added because Bea was removed from the room.
Review the expense and choose the current people.
```

The current queue permanently discards rejected 4xx bodies and reports only a
count, so it cannot implement that promise
([`offline-queue.ts`](apps/web/src/lib/offline-queue.ts#L373-L488)). Retaining
the blocked draft and structured error is required scope, not existing behavior.
If that work is deferred, the honest fallback is “A waiting expense could not
be saved—add it again,” with acknowledged draft loss.

#### Stale local identity

Today the join gate checks whether local storage has any identity, while `meId`
separately checks whether that member is still in the roster
([`RoomScreen.tsx`](apps/web/src/components/room/RoomScreen.tsx#L67-L123)).

Without a change, a removed member's device can:

- keep showing “you are Bea”;
- skip the join gate;
- silently lose attribution;
- default a new expense to the first remaining person.

The room screen must make `needsJoin` membership-aware, clear the stale identity,
and show the explicit “no longer on the list” explanation.

## Settlement consequences by option

| Member state          | May be in new expense? |           Shown in history? |                    Shown in balances? |                    May settle? |
| --------------------- | ---------------------: | --------------------------: | ------------------------------------: | -----------------------------: |
| Active                |                    Yes |                         Yes |                                   Yes |                            Yes |
| Removed unused (V1)   |                     No | No financial history exists |                                    No |                             No |
| Former, zero (V2)     |                     No |                         Yes | Historical/Former, normally collapsed | Yes if an edit reopens balance |
| Former, non-zero (V2) |                     No |                         Yes |        Yes, explicitly labeled Former |                 Yes until zero |

Rules that hold for every option:

- removal never creates a Settlement row;
- removal never changes an amount;
- removal never changes who paid an expense;
- removal never redistributes a share;
- a real recorded payment remains recorded;
- a historical correction may reopen a former member's balance and must surface
  that fact rather than discard it.

## Edge cases

### Deleted rows

Count them in dependency checks. Otherwise a restored expense can point at a
member the active roster no longer understands.

### A payer who has no share

Still has a financial footprint. Paying is a balance credit even if the payer was
excluded from the split.

### A participant whose share is zero

Still has an explicit share row and therefore history. Treat them as referenced;
do not infer intent from a zero amount.

### A member whose net is zero

Net zero is not the same as unused. Settlements and expenses still explain the
room. V1 blocks removal; V2 may mark them Former.

### Editing history after someone is Former

Preserving a former member's existing reference can be allowed. Adding a former
member to a new record should not be. If an edit changes their balance, surface
them in Former balances/settlement again.

### Deleted settlement

It remains stored audit history. Count it in the V1 footprint even though the
current UI has no settlement restore action.

### Reactions

A reaction does not affect money, but it is persisted evidence that the identity
used the room.
Strict V1 blocks removal. A future Former model can preserve the reaction and
the former display name.

### Push subscription

It does not affect money, but it proves an active device opted in. Strict V1
blocks removal; broader removal must delete the subscription.

### Removing oneself

Allow only with another active member in V1, then clear local identity and return
to the join gate. A true “Leave room” product should be designed separately.

### Removing the last active member

Block in V1.

### Same name after removal

Reactivate the tombstone rather than creating another identical member ID.

### Realtime on another device

Publish after commit. Active rosters, payer choices, joins, and counts should
update on the existing refetch path.

### `apps/api` parity

The older Fastify app has its own `SplitMember.deletedAt` and already filters
active members for several writes, but it has no removal endpoint and different
foreign-key behavior. It also models pending Peanut settle intents, including
late confirmations that remain financially real.

When the two data paths are collapsed:

- carry over the same active-versus-ledger distinction;
- block narrow V1 removal when any settle intent references the member;
- do not let an expired intent make a member “unused,” because a late payment can
  still confirm
  ([`split.ts`](apps/api/src/db/split.ts#L476-L506),
  [`split.ts`](apps/api/src/db/split.ts#L648-L653));
- reconcile FK semantics rather than inheriting whichever cascade happens to
  survive the merge.

## Validation appendix

### Test plan

Money code requires tests before shipping. Minimum coverage:

### Domain/API

- unused member soft-removes and restores idempotently;
- wrong room/member ID is rejected;
- last active member is rejected;
- payer reference blocks, including a soft-deleted expense;
- share reference blocks, including a soft-deleted expense;
- settlement sender and recipient each block, including deleted settlements;
- strict V1 authored/reaction/push evidence blocks;
- removing deletes no expense/share/settlement rows;
- a successful unused-member removal leaves every expense, share, settlement,
  remaining balance, and suggested transfer unchanged; only the removed zero
  member and active count disappear;
- a blocked removal makes no database write and returns unchanged state;
- active EQUAL default excludes a removed-unused member;
- writes reject an inactive member as payer, participant, settlement endpoint,
  reaction actor, or push subscriber;
- push subscription handling matches the chosen strict/broader policy;
- same-name reactivation reuses the member ID;
- short Undo preserves the old token; later restore/reactivation rotates it;
- valid, consumed, expired, replayed, and prior-removal Undo tokens follow the
  specified idempotent contract without extending the 10-second window;
- remove-versus-expense, settlement, reaction, push, and same-name reactivation
  races have exactly one valid outcome;
- restore/Undo cannot create duplicate active names.

### Client/E2E

- staged inline add → cancel creates no member;
- staged inline add → save atomically creates member and expense, or neither;
- staged client refs resolve correctly for default EQUAL, explicit EQUAL, and
  EXACT; active same-name races reuse the ID and tombstones require confirmation;
- transitional eager add → Undo repairs payer, EQUAL participants, and EXACT
  allocations;
- Save-versus-Undo and stale online-draft conflicts fail safely;
- People drawer shows eligible versus blocked states;
- eligibility endpoint and stale `409` blocker details are correct and redacted;
- confirmation copy explains shared-link access honestly;
- another device updates after SSE/refetch;
- removing the current identity returns it to the join gate;
- stale `?balance=` closes cleanly;
- a queued expense rejected after removal has actionable recovery;
- payer and participant pickers exclude removed-unused members;
- room member count and invitation OG exclude removed-unused members;
- recap semantics are explicit: active headcount versus everyone who financially
  participated;
- English, es-419, and pt-BR catalogs stay in parity.

## Phased delivery

### Phase 0 — prevent the easiest ghost

- Stage a new inline payer locally.
- Atomically create the member and expense on Save.
- Cancelling creates nothing.

This is the only phase that prevents the current eager-creation bug by
construction.

### Phase 1 — unused-member cleanup

- People drawer.
- Server-derived eligibility read.
- Pristine dependency check.
- Soft remove + Undo/restore.
- If eager creation temporarily remains, compound inline Undo that repairs the
  draft.
- Token, push, stale identity, active counts, and picker handling.
- Shared room lock on membership-dependent writes.
- Recoverable blocked-offline-expense handling.

This phase cleans pre-existing and otherwise abandoned zero-footprint names
without creating new settlement semantics.

The product promise is narrow, but the backend work is not trivial: expense
create/edit must become lock-compatible, evidence-producing routes must
revalidate under the lock, and the offline queue needs a recoverable blocked
state. Estimate Phase 1 as a write-path correctness change, not a cosmetic
drawer feature.

### Phase 2 — former members

Only if real usage shows rooms need roster lifecycle after financial activity:

- explicit Active versus Former model;
- mark Former when the member net is zero;
- former-with-outstanding balance and settlement UI;
- historical edit/delete/restore behavior;
- reactivation.

### Phase 3 — duplicate correction

Only if duplicate identities are a measured problem:

- guided merge;
- before/after balance preview;
- collision handling;
- audit event.

Do not bundle this into Phase 1.

## Recommended decision record

| Question       | Recommended V1 decision                                                                | Reason                                                                                   |
| -------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Eligibility    | Strict no-persisted-footprint rule                                                     | Smallest honest cleanup promise; no history rewrite or directory split                   |
| Prevention     | Stage inline person; atomically create person + expense on Save                        | Cancellation cannot create a ghost                                                       |
| Authority      | Any room-link holder, rate-limited                                                     | No owner/admin exists; eligible removal changes no money and is reversible               |
| Self-removal   | Allow when another active member remains                                               | Avoid an empty room; clear local identity after success                                  |
| Undo/restore   | 10-second token-preserving Undo; later restore/reactivation rotates token              | Immediate reversal remains smooth without reviving old proof indefinitely                |
| Blocked detail | Coarse server-derived counts; link only to visible records                             | Client cannot infer hidden history; do not expose push/deleted-row details               |
| Recap/OG       | Current headcount excludes removed-unused; financial-history counts are unchanged      | The recap already exists; label active roster versus participants explicitly             |
| Audit          | No durable lifecycle event for pristine cleanup; privacy-safe aggregate analytics only | No money/history changes; avoid pretending an unknown link-holder is an identified actor |

Suggested analytics are `member_remove_checked`, `member_remove_blocked`,
`member_removed`, and `member_restored`. Do not include member names or IDs,
room slugs, amounts, or blocker contents.

Approval confirms that any room-link holder may perform the narrow, rate-limited
V1 removal. If that authority decision is reconsidered later, the product must
first introduce a real authorization model; “Only admins” is not implementable
while rooms have no admins.

## Independent review outcome

Three independent review passes were applied before finalizing this proposal:

- **Ledger/domain review:** confirmed that pristine soft removal preserves
  balance and settlement invariants; required broader locking and recoverable
  offline rejection.
- **UX/options review:** confirmed the lifecycle choices; made staged atomic
  creation the prevention layer, specified compound Undo, corrected blocked
  copy, and completed restore/rejoin behavior.
- **Repository/engineering review:** verified the live `apps/web` assertions;
  added server-derived eligibility, idempotent API semantics, FX lock boundaries,
  current recap behavior, and missing race tests.

The reviewers agreed that the V1 financial model is sound after these changes.
The detailed alternatives remain intentionally separate: Former-member
lifecycle, settle-first guidance, duplicate merge, responsibility transfer, and
expense correction solve different problems and should not be bundled behind
one Remove button.

## Bottom line

The safest product is not “delete a member.” It is:

> Prevent accidental names from being persisted on Cancel; clean up an existing
> zero-footprint name; preserve every financial fact forever; introduce Former
> members only when PeanutSplit is ready to show inactive people and outstanding
> debts honestly.

Together, staged creation and pristine soft removal solve the accidental-add
problem with a small, understandable promise and leave the settlement ledger
untouched.
