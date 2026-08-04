# Achievements are trip keepsakes, not competition

**Decision:** approved 2026-08-03.

Achievements are an explicit Peanut Split product surface. They notice the
coordination already recorded in a room and turn it into an optional,
shareable keepsake. They do not change balances, gate features, or ask people
to do more work for a reward.

## What the product may celebrate

- **Crew** marks a few useful roster-size thresholds. Its count is the number
  of names in the ledger, not the number of people who opened the link or
  claimed an identity.
- **Passport** marks the number of distinct currencies on saved expenses.
- **Alter ego** reflects a positive administrative or social contribution such
  as starting the room, recording expenses, closing the ledger, or reacting to
  entries. It appears only after the room is settled, when the result cannot
  change under its recipient.
- **Wrapped** collects shareable trip cards after settlement. The existing
  All-settled state remains the primary completion celebration and leads the
  recap.

Achievement cards may be shared. They carry no amount, balance, debt ranking,
member name, room slug, or room link. Sharing a card is separate from inviting
somebody into the room.

## Guardrails

The system is deliberately bounded:

- no competition based on spending, balances, debt, payment size, wealth, or
  payment speed;
- no leaderboards, rankings, points, levels, streaks, or repeatable reward
  loops;
- no locked-achievement grid, completion percentage, or prompts to keep using
  the ledger to earn the next item;
- no negative roles, loss states, shame, or calling out somebody for doing
  less;
- no award unless the ledger contains evidence that its recipient performed
  the positive role;
- award eligibility is individual, not a comparison: another person doing more
  cannot take a role away, and a role label does not have to be unique within a
  room;
- at most one in-room achievement moment per room per browser session; other
  eligible cards wait or appear quietly on the recap shelf;
- no achievement moment competes with a ledger correction or the All-settled
  state; and
- motion, sound, and haptics respect the existing accessibility settings.

Thresholds are sparse, finite, and maintained as a closed product catalog.
Adding a threshold, award, tracked input, or achievement type is a product
decision and must be reviewed against these guardrails.

## Roster boundary

Achievements do not create a claimed/unclaimed lifecycle. A crew milestone
must not say that somebody is missing, show join progress, or make invitation
the next step. A name counts because it participates in the ledger, even when
that person never opens Peanut Split.

The authoritative roster model is in [ROSTER-IDENTITY.md](./ROSTER-IDENTITY.md).
