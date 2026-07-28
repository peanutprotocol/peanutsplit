/**
 * Where a balance came from — the "check the maths yourself" derivation.
 *
 * The deepest complaint about every other splitting app is that it does the arithmetic and
 * expects to be trusted: you get a number, and if you want to know why, you re-derive it by
 * hand from the activity list. This module is the answer to that. It does NOT replace
 * `RoomState.balances` — the server stays the only authority on money — it re-derives the
 * same number from the same rows so a person can read every step that produced it.
 *
 * Which makes this a mirror, and a mirror that drifts is worse than no mirror at all. The
 * fold below is line-for-line the one in `src/server/roomState.ts` `balancesOf()`:
 *
 *     + every expense you paid for (its room-currency total)
 *     − your share of every expense
 *     + every payment you handed over
 *     − every payment you were handed
 *
 * Change one, change both. The property test in `balance-derivation.test.ts` runs randomised
 * rooms through the real `toRoomState()` and fails the moment the two disagree by a cent.
 *
 * Arithmetic is BigInt over the minor-unit strings the wire carries. No floats, ever.
 */

import type { ApiExpense, RoomState } from './api-types'

export type DerivationLineKind = 'paid' | 'share' | 'settlement-sent' | 'settlement-received'

export interface DerivationLine {
    /** Stable across polls. One row can produce at most one line per kind (a member appears
     *  at most once in an expense's shares — `@@unique([expenseId, memberId])`). */
    key: string
    kind: DerivationLineKind
    /** The expense description. Null on settlement lines: a payment has no name, it has a
     *  counterparty, and phrasing that ("to Bea" / "from Bea") is a translation, not data. */
    title: string | null
    /** Who to attribute the line to — the payer on a share line, the other party on a
     *  settlement line, null on your own payment. Null also when the member has left the
     *  roster, which the caller renders as "someone". */
    partyName: string | null
    /** The same party's id, so the renderer can say "you paid" instead of your own name. */
    partyId: string | null
    /** ISO instant: the expense date (user-editable, the one the receipt shows) or the
     *  settlement's `createdAt`. */
    date: string
    /** Signed, room-currency minor units. Negative pushed the balance down. */
    amountMinor: string
    /** What was actually typed, when the expense was not in the room currency. The balance
     *  is made of the base amount; this is the receipt it was converted from. */
    original: { amountMinor: string; currency: string } | null
}

export interface MemberDerivation {
    memberId: string
    /** Chronological, oldest first — a running order you can follow with a finger. */
    lines: DerivationLine[]
    /** The sum of `lines`. Equals `RoomState.balances[memberId]`; the property test proves it. */
    totalMinor: string
}

/**
 * The wire only ever carries live rows: `roomArgs` in `src/server/roomState.ts` filters
 * `deletedAt: null` before the state leaves the API, so a deleted expense is not "greyed
 * out" here, it is absent. The guard stays anyway because this fold has to be a mirror — if
 * a soft-deleted row ever does reach the client (a stale cached response, a future field on
 * the wire) it has to drop out here exactly like it drops out there.
 */
const isLive = (row: { id: string; deletedAt?: string | null }): boolean => !row.deletedAt

/**
 * An optimistic row is not money yet.
 *
 * `useAddExpense` puts a `pending-…` expense into the cache the instant you hit save, with
 * the payer named and every share still "0", while `RoomState.balances` is untouched server
 * truth until the response lands. Folding that row in would credit the payer the whole
 * amount, debit nobody, and print an "adds up to" that disagrees with the balance card the
 * sheet was opened from — the one failure this feature cannot survive. The placeholder waits
 * for its real row, and so does the derivation.
 */
const isPending = (expense: ApiExpense): boolean => expense.id.startsWith('pending-')

const negate = (minor: string): string => (-BigInt(minor)).toString()

const sumMinor = (lines: readonly DerivationLine[]): string =>
    lines.reduce((total, line) => total + BigInt(line.amountMinor), 0n).toString()

/** ISO instants sort lexicographically; the key breaks ties so the order never flickers
 *  between polls (two expenses can share a date to the millisecond). */
const chronologically = (a: DerivationLine, b: DerivationLine): number =>
    a.date === b.date ? a.key.localeCompare(b.key) : a.date < b.date ? -1 : 1

/** Every line that produced this member's balance, in the order it happened. */
export function deriveBalance(state: RoomState, memberId: string): MemberDerivation {
    // `balancesOf` only bumps ids that are on the roster, so a member id that is not there
    // (a stale `?balance=` in the URL) derives nothing rather than a wrong something.
    if (!state.members.some((member) => member.id === memberId)) return { memberId, lines: [], totalMinor: '0' }

    const nameOf = (id: string): string | null => state.members.find((member) => member.id === id)?.name ?? null
    const isForeign = (expense: ApiExpense): boolean => expense.currency !== state.room.currency

    const lines: DerivationLine[] = []

    for (const expense of state.expenses) {
        if (!isLive(expense) || isPending(expense)) continue

        if (expense.paidById === memberId) {
            lines.push({
                key: `paid:${expense.id}`,
                kind: 'paid',
                title: expense.description,
                partyName: null,
                partyId: null,
                date: expense.date,
                amountMinor: expense.baseAmountMinor,
                original: isForeign(expense) ? { amountMinor: expense.amountMinor, currency: expense.currency } : null,
            })
        }

        for (const share of expense.shares) {
            if (share.memberId !== memberId) continue
            lines.push({
                key: `share:${expense.id}`,
                kind: 'share',
                title: expense.description,
                partyName: nameOf(expense.paidById),
                partyId: expense.paidById,
                date: expense.date,
                amountMinor: negate(share.amountMinor),
                // An EQUAL split has no typed original to show — the share is a division of
                // the total, not something anyone entered. EXACT shares were typed in the
                // expense currency, which is the only original worth printing.
                original:
                    isForeign(expense) && share.enteredAmountMinor !== null
                        ? { amountMinor: share.enteredAmountMinor, currency: expense.currency }
                        : null,
            })
        }
    }

    for (const settlement of state.settlements) {
        if (!isLive(settlement)) continue
        // Settlements are always in the room currency (the `Settlement` model has no currency
        // column), so there is never an original to show on these lines.
        if (settlement.fromId === memberId) {
            lines.push({
                key: `sent:${settlement.id}`,
                kind: 'settlement-sent',
                title: null,
                partyName: nameOf(settlement.toId),
                partyId: settlement.toId,
                date: settlement.createdAt,
                amountMinor: settlement.amountMinor,
                original: null,
            })
        }
        if (settlement.toId === memberId) {
            lines.push({
                key: `received:${settlement.id}`,
                kind: 'settlement-received',
                title: null,
                partyName: nameOf(settlement.fromId),
                partyId: settlement.fromId,
                date: settlement.createdAt,
                amountMinor: negate(settlement.amountMinor),
                original: null,
            })
        }
    }

    lines.sort(chronologically)
    return { memberId, lines, totalMinor: sumMinor(lines) }
}

export interface PairDerivation {
    /** The member whose sheet is open. */
    self: MemberDerivation
    /** The other end of the suggested payment. */
    other: MemberDerivation
    /** The suggested transfer between them, room-currency minor units, or null if the
     *  simplification did not pair these two. */
    transferMinor: string | null
    /** Which way it points, from `self`'s side. */
    direction: 'sends' | 'receives' | null
}

/**
 * The pair sheet — deliberately NOT a pairwise debt, because there isn't one.
 *
 * A suggested transfer is not "what A owes B". `suggestedTransfers()` runs a greedy
 * simplification over the *net* balances: biggest debtor against biggest creditor, again and
 * again until everything is zero. So a transfer can pair two people who were never on the
 * same expense, and its amount is a slice of A's net position rather than a sum of anything
 * A and B shared. There is no faithful "here is where this €40 came from" to show.
 *
 * Netting the expenses the two happen to share and calling *that* the derivation would be
 * the easy lie: the number would rarely match the payment, and a derivation that doesn't
 * reconcile re-teaches the exact distrust this whole feature exists to end. So we show the
 * true thing instead — both members' complete balances, and one line saying out loud that
 * the payment is the shortest way to clear the room, not a debt between these two.
 */
export function derivePair(state: RoomState, selfId: string, otherId: string): PairDerivation {
    const transfer = state.suggestedTransfers.find(
        (candidate) =>
            (candidate.fromId === selfId && candidate.toId === otherId) ||
            (candidate.fromId === otherId && candidate.toId === selfId)
    )
    return {
        self: deriveBalance(state, selfId),
        other: deriveBalance(state, otherId),
        transferMinor: transfer?.amountMinor ?? null,
        direction: transfer ? (transfer.fromId === selfId ? 'sends' : 'receives') : null,
    }
}
