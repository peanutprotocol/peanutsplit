# Former-member lifecycle

**Status:** implemented in `apps/web` on 2026-08-06; production verification and deployment are separate gates.

This document is the canonical member-removal contract. A room name is a durable
ledger participant, not an account or invitation. “Former” changes future
participation; it never deletes history and cannot revoke a shared room link.

## Invariants

- The active roster is used for new payers, new split participants, identity
  claims, push, active counts, and social preview art.
- The ledger directory contains active and Former members and is used for old
  expenses, shares, reactions, settlements, exports, balances, and recap history.
- An active member may become Former only when their live room-currency balance
  is exactly `0n`. There is no tolerance and no reference-count predicate.
- At least one active member must remain.
- Member, expense, share, reaction, settlement, attribution, and audit rows are
  never deleted by this lifecycle.
- The eligibility read and transition use the room advisory lock shared by every
  money and roster write.

## Transition to Former

`DELETE /api/rooms/:slug/members/:memberId` is an idempotent soft transition:

1. lock and reload the room;
2. reject the last active member;
3. compute the authoritative live balance and require exact zero;
4. set `removedAt`;
5. delete that member’s push subscriptions;
6. append an immutable `member_removed` audit event;
7. publish only after commit.

The UI calls this “Former”, explains that room-link access is unchanged, and
offers a short Undo plus a durable Reactivate action.

## Behavior while Former

- The member is omitted from untouched EQUAL defaults and every selector for
  new activity.
- A saved expense edit may preserve a Former member only in the role already on
  that expense: old payer as payer, old share holder as participant. Roles do
  not escalate.
- Historical edits, expense restore, or settlement deletion may reopen the
  member’s balance. The Former row then reappears in balances and settlement
  until it is exactly zero again; membership is not silently restored.
- Historical names and avatars remain labeled Former in expenses, payments,
  reactions, exports, and the People directory.
- A supplied Former or rotated token is a failed identity claim
  (`MEMBER_TOKEN_INVALID`), never anonymous attribution. A missing token remains
  anonymous link-holder access where that route permits it.

## Restore and reactivation

- Settings restore reuses the same member ID, clears `removedAt`, rotates the
  token, and returns no identity secret to the restorer.
- Confirmed same-name reactivation reuses the same ID, rotates the token, and
  returns the new proof only to that caller.
- Active case-insensitive name collisions are rejected under the room lock.
- Personas and palettes remain reserved across the full ledger directory, so a
  restored identity does not duplicate a visual identity allocated in between.

## Draft and offline recovery

An identity transition must not erase typed money. Open expense and settlement
sessions stay logically mounted behind JoinGate and resume after identity
selection. If an active draft member becomes Former, their exact role and typed
amount/weight remain visible so the recorder can remove or replace it.

Offline expense creates rejected for member lifecycle changes become durable
blocked records. They:

- retain endpoint, room, `addedAt`, client key, complete body, and token;
- never retry automatically or get evicted by the queue cap;
- block only newer writes in the same room;
- allow payer/participant remapping to distinct active IDs without changing
  exact amounts or weights;
- replace the stale token only on explicit Retry;
- leave storage only after success or explicit Discard.

Committed client-key retries are resolved before token validation, so a lost
success response remains success even if the original token rotated meanwhile.

## Access and residual defenses

Former is not a ban. Anyone with the reusable room link can still read the room,
choose another active identity, or add a distinct name. Real eviction needs a
different authorization model.

Prisma ledger relations still cascade at the database level so deleting an
entire Room can clean up its graph. Application code has no member hard-delete
path; lifecycle tests assert the member and every ledger relation survive.
Changing those relations to `Restrict` requires a dedicated migration and room-
deletion review, not an incidental schema edit.

`removedAt` records the current Former transition. After multiple
remove/reactivate cycles it cannot reconstruct every past inactive interval;
latecomer suggestions therefore use the available interval conservatively.
