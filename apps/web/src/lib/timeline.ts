/**
 * One list, both kinds of row.
 *
 * A room's history had a hole in it: settlements were written, stored with a
 * note, a method and who recorded them, returned on the wire — and rendered
 * nowhere. The only evidence a payment had happened was a debt quietly missing
 * from the settle sheet, which is indistinguishable from a debt that was never
 * there. People recorded a payment, went back to look for it, found nothing, and
 * recorded it again.
 *
 * So the timeline interleaves the two by date. Both are things that happened to
 * the money on a day, and the day is what somebody scrolling is looking for.
 *
 * WHICH DATE. An expense has two: `date`, which somebody may have edited to say
 * when the dinner was, and `createdAt`, when the row was written. The list has
 * always shown `date` and the server sorts by it, so that is what a settlement
 * has to be interleaved against. A settlement has only `createdAt` — recording a
 * payment is the payment, there is nothing to backdate — so its `createdAt` is
 * its date. Both readings are the same claim: "the day this became true".
 *
 * ORDER IS TOTAL, on purpose. Date, then the write clock, then the id. A bulk
 * import writes five hundred rows inside one millisecond and a settlement can
 * land in the same one, so anything short of a full tie-break leaves the order
 * to heap position — and a list that reshuffles under a reader when an unrelated
 * row changes is a list nobody trusts. This is the same three-key ordering
 * `server/roomState.ts` applies to expenses, extended over the merged list.
 */

import type { ApiExpense, ApiSettlement } from './api-types'

export type TimelineEntry =
    | { kind: 'expense'; id: string; date: string; createdAt: string; expense: ApiExpense }
    | { kind: 'settlement'; id: string; date: string; createdAt: string; settlement: ApiSettlement }

const time = (iso: string): number => {
    const value = new Date(iso).getTime()
    // A row with an unparseable date sorts to the bottom rather than poisoning
    // every comparison it takes part in with NaN.
    return Number.isNaN(value) ? 0 : value
}

/** Newest first. Deterministic for any input, including rows that share a
 *  millisecond. */
export function roomTimeline(expenses: readonly ApiExpense[], settlements: readonly ApiSettlement[]): TimelineEntry[] {
    const entries: TimelineEntry[] = [
        ...expenses.map((expense): TimelineEntry => ({
            kind: 'expense',
            id: expense.id,
            date: expense.date,
            createdAt: expense.createdAt,
            expense,
        })),
        ...settlements.map((settlement): TimelineEntry => ({
            kind: 'settlement',
            id: settlement.id,
            date: settlement.createdAt,
            createdAt: settlement.createdAt,
            settlement,
        })),
    ]

    return entries.sort((a, b) => {
        const byDate = time(b.date) - time(a.date)
        if (byDate !== 0) return byDate
        const byWrite = time(b.createdAt) - time(a.createdAt)
        if (byWrite !== 0) return byWrite
        return b.id.localeCompare(a.id)
    })
}
