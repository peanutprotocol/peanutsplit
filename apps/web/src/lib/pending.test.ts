import { describe, expect, it } from 'vitest'
import type { ApiExpense, ApiMember, RoomState } from './api-types'
import { isRoomSettled, savedExpenses } from './pending'

/** Ana paid, Ana and Bea share it — a debt between two people, which is the only
 *  kind of expense a room can ever have SETTLED. */
const expense = (id: string, overrides: Partial<ApiExpense> = {}): ApiExpense => ({
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
    shares: [
        { memberId: 'ana', amountMinor: '3000', enteredAmountMinor: null, splitWeight: null },
        { memberId: 'bea', amountMinor: '3000', enteredAmountMinor: null, splitWeight: null },
    ],
    reactions: [],
    ...overrides,
})

const member = (id: string, name: string): ApiMember => ({
    id,
    name,
    avatar: null,
    createdAt: '2026-07-01T00:00:00.000Z',
})

const room = (
    expenses: ApiExpense[],
    transfers: RoomState['suggestedTransfers'] = [],
    members: ApiMember[] = [member('ana', 'Ana'), member('bea', 'Bea')]
): RoomState => ({
    room: {
        id: 'r1',
        slug: 'ski-trip-aaa',
        name: 'Ski trip',
        emoji: '🎿',
        currency: 'EUR',
        coverUrl: null,
        theme: null,
        createdAt: '2026-07-01T00:00:00.000Z',
    },
    members,
    expenses,
    settlements: [],
    balances: Object.fromEntries(members.map((m) => [m.id, '0'])),
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

    // ── the two states a person was congratulated in ─────────────────────────

    /** Persona repro: an organiser opens a room, logs the deposit they paid, and
     *  is told they are all settled up before anybody else has even tapped the
     *  link. There is no second party — nothing could have been owed. */
    it('a room with one member is never settled, however much it holds', () => {
        const solo = room(
            [
                expense('real-1', {
                    shares: [{ memberId: 'ana', amountMinor: '6000', enteredAmountMinor: null, splitWeight: null }],
                }),
            ],
            [],
            [member('ana', 'Ana')]
        )
        expect(isRoomSettled(solo)).toBe(false)
    })

    it('a square Former identity with shared history still leaves the trip settled', () => {
        const ana = member('ana', 'Ana')
        const former = { ...member('bea', 'Bea'), removedAt: '2026-08-06T00:00:00.000Z' }
        const historical = expense('real-1')
        expect(isRoomSettled(room([historical], [], [ana, former]))).toBe(true)
    })

    /** Persona repro: two people in the room, and the only expense so far is one
     *  of them logging something they bought for themselves. Real money, no debt. */
    it('a room whose expenses never crossed between people is not settled', () => {
        const ownCoffee = expense('real-1', {
            shares: [{ memberId: 'ana', amountMinor: '6000', enteredAmountMinor: null, splitWeight: null }],
        })
        expect(isRoomSettled(room([ownCoffee]))).toBe(false)
    })

    /** …and the counterpart, which a share COUNT would have got wrong: one share,
     *  sitting on somebody who did not pay, is exactly a debt. This is the shape
     *  the importer writes for a brought-forward balance. */
    it('a single share on somebody other than the payer is a real debt', () => {
        const covered = expense('real-1', {
            splitMode: 'EXACT',
            shares: [{ memberId: 'bea', amountMinor: '6000', enteredAmountMinor: '6000', splitWeight: null }],
        })
        expect(isRoomSettled(room([covered]))).toBe(true)
        expect(isRoomSettled(room([covered], [{ fromId: 'bea', toId: 'ana', amountMinor: '6000' }]))).toBe(false)
    })
})
