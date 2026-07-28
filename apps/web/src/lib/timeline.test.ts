import { describe, expect, it } from 'vitest'
import type { ApiExpense, ApiSettlement } from './api-types'
import { roomTimeline } from './timeline'

const expense = (id: string, date: string, createdAt = date): ApiExpense => ({
    id,
    description: id,
    amountMinor: '1000',
    currency: 'EUR',
    baseAmountMinor: '1000',
    fxRate: '1',
    splitMode: 'EQUAL',
    paidById: 'ana',
    createdById: 'ana',
    date,
    category: null,
    createdAt,
    shares: [{ memberId: 'ana', amountMinor: '1000', enteredAmountMinor: null }],
    reactions: [],
})

const settlement = (id: string, createdAt: string): ApiSettlement => ({
    id,
    fromId: 'bea',
    toId: 'ana',
    createdById: 'bea',
    amountMinor: '500',
    method: 'cash',
    note: null,
    createdAt,
})

const ids = (entries: ReturnType<typeof roomTimeline>) => entries.map((entry) => entry.id)

describe('roomTimeline', () => {
    it('interleaves payments into the expense history by date, newest first', () => {
        const entries = roomTimeline(
            [expense('e-jul-03', '2026-07-03T09:00:00.000Z'), expense('e-jul-01', '2026-07-01T09:00:00.000Z')],
            [settlement('s-jul-02', '2026-07-02T09:00:00.000Z')]
        )

        expect(ids(entries)).toEqual(['e-jul-03', 's-jul-02', 'e-jul-01'])
        expect(entries[1].kind).toBe('settlement')
    })

    /** An expense's `date` is user-editable and is what the list has always
     *  shown, so a payment recorded today sits under a dinner backdated to next
     *  week — the same way two backdated expenses sort against each other. */
    it('sorts an expense on its own date, not on when it was written', () => {
        const backdated = expense('e-old', '2026-06-01T09:00:00.000Z', '2026-07-05T09:00:00.000Z')
        const entries = roomTimeline([backdated], [settlement('s-new', '2026-07-02T09:00:00.000Z')])

        expect(ids(entries)).toEqual(['s-new', 'e-old'])
    })

    /**
     * The reason the tie-break goes all the way down to the id. A bulk import
     * writes hundreds of rows inside one millisecond and a payment can land in
     * the same one; without a total order the list reshuffles under a reader
     * whenever anything unrelated changes.
     */
    it('is a total order — same date, same millisecond, still deterministic', () => {
        const at = '2026-07-02T09:00:00.000Z'
        const rows = [expense('e-a', at), expense('e-c', at), expense('e-b', at)]
        const payments = [settlement('s-b', at), settlement('s-a', at)]

        const once = ids(roomTimeline(rows, payments))
        const again = ids(roomTimeline([...rows].reverse(), [...payments].reverse()))

        expect(once).toEqual(again)
        // Descending by id, which is what "newest first" degrades to when there
        // is nothing newer left to compare.
        expect(once).toEqual(['s-b', 's-a', 'e-c', 'e-b', 'e-a'])
    })

    it('handles a room with only payments, and a room with neither', () => {
        expect(ids(roomTimeline([], [settlement('s-1', '2026-07-02T09:00:00.000Z')]))).toEqual(['s-1'])
        expect(roomTimeline([], [])).toEqual([])
    })

    it('keeps an unsent expense in the list rather than dropping it on a bad date', () => {
        const entries = roomTimeline([expense('pending-1', 'not-a-date')], [])
        expect(ids(entries)).toEqual(['pending-1'])
    })
})
