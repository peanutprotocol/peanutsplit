import { describe, expect, it } from 'vitest'
import type { ApiExpense, RoomState } from './api-types'
import { isRoomSettled, savedExpenses } from './pending'

const expense = (id: string): ApiExpense => ({
    id,
    description: 'Dinner',
    amountMinor: '6000',
    currency: 'EUR',
    baseAmountMinor: '6000',
    fxRate: '1',
    splitMode: 'EQUAL',
    paidById: 'ana',
    createdById: null,
    date: '2026-07-01T00:00:00.000Z',
    category: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    shares: [{ memberId: 'ana', amountMinor: '6000', enteredAmountMinor: null }],
    reactions: [],
})

const room = (expenses: ApiExpense[], transfers: RoomState['suggestedTransfers'] = []): RoomState => ({
    room: {
        id: 'r1',
        slug: 'ski-trip-aaa',
        name: 'Ski trip',
        emoji: '🎿',
        currency: 'EUR',
        coverUrl: null,
        theme: null,
        createdAt: '2026-07-01T00:00:00.000Z',
        archivedAt: null,
    },
    members: [{ id: 'ana', name: 'Ana', createdAt: '2026-07-01T00:00:00.000Z' }],
    expenses,
    settlements: [],
    balances: { ana: '0' },
    suggestedTransfers: transfers,
})

describe('savedExpenses', () => {
    it('keeps only what the server has', () => {
        const rows = [expense('pending-abc'), expense('real-1'), expense('pending-def')]
        expect(savedExpenses(rows).map((row) => row.id)).toEqual(['real-1'])
    })
})

describe('isRoomSettled', () => {
    /**
     * The regression. A brand-new room, one expense queued on a phone with no
     * signal: the merged list is non-empty, `suggestedTransfers` is empty because
     * the server has never heard of it, and the room threw confetti, rang the
     * bell, fired `all_settled` and offered a recap card reading "0 expenses".
     */
    it('is not settled when the only rows are still waiting to send', () => {
        expect(isRoomSettled(room([expense('pending-abc')]))).toBe(false)
    })

    it('is not settled when a queued row sits beside real, unsettled ones', () => {
        expect(
            isRoomSettled(
                room([expense('pending-abc'), expense('real-1')], [{ fromId: 'ana', toId: 'bea', amountMinor: '100' }])
            )
        ).toBe(false)
    })

    it('is settled when the server has expenses and nothing left to transfer', () => {
        expect(isRoomSettled(room([expense('real-1')]))).toBe(true)
    })

    it('is settled even with a draft on top of a squared room — the draft is not the reason', () => {
        expect(isRoomSettled(room([expense('pending-abc'), expense('real-1')]))).toBe(true)
    })

    it('an empty room is empty, not settled', () => {
        expect(isRoomSettled(room([]))).toBe(false)
        expect(isRoomSettled(undefined)).toBe(false)
    })
})
