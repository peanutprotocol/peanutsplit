# Roster names are ledger participants

**Decision:** approved 2026-08-03.

A name in a Peanut Split room represents a party in the shared ledger. It is
not an invitation, account, seat, or identity waiting to be claimed.

## Product behavior

- Any room-link holder may add a name.
- Any room-link holder may record an expense for any payer and participants.
- A person never opening the room is normal. Grandma does not need to accept,
  join, or claim anything for her expenses and balance to be valid.
- Choosing a name on a device may personalize balances, notifications, or
  reactions. It does not create ownership, grant write permission, or complete
  the roster.
- Who records an expense is optional provenance, not authorization and not a
  measure of whether the room is working.

## UX and analytics rule

There is no user-visible or analytical **claimed / unclaimed** lifecycle.

Do not show badges, progress, reminders, or success states such as:

- “unclaimed”;
- “waiting for Bea”;
- “3 of 5 people joined”;
- “invite Bea to claim her name.”

Do not explain this data model on the roster surface. The compact default copy
is:

- **Who’s in?**
- **This can be changed later.**
- **Name**
- **Done** and, when the step is optional, **Skip**

Keep “ledger participant,” invitation semantics, write permissions, and
claiming out of routine UI copy. Those are implementation and documentation
concerns, not setup instructions.

Roster setup is complete when the person editing it chooses to continue or
skip. It is not completed by other people opening the link.

## Implementation consequence

`Member` rows remain the durable identities used by expenses, shares,
settlements, balances, and history. Device-local identity remains a viewpoint
only.

The legacy `provisional` field is creation provenance used only for cleanup: it
marks a name added to an existing roster so an untouched typo can be removed.
Selecting that name on a device does not change the field or its cleanup status.
Durable ledger history, not whether a person opened the room, protects the row.

Name selection emits no product-funnel event. In particular, it is not product
activation or collaboration success.

## Earlier-expense review

Adding a name after spending has started can create a separate ledger question:
which earlier expenses included that person? This is not an identity or claim
step.

- The room derives the question from member and expense timestamps.
- Any room-link holder may review it for the named person.
- Choosing a name on a device never opens or completes the review.
- Nothing changes until the recorder confirms specific expenses.
- Equal whole-group splits may be suggested; subsets require an explicit choice,
  and custom arithmetic is edited in the ordinary expense editor.
- “Not now” and a completed review are device-local prompt decisions, not global
  claimed/unclaimed state. A changed expense set can be offered again.

Copy names the person—“Did Dani share any earlier expenses?”—rather than asking
the recorder to prove who they are.
