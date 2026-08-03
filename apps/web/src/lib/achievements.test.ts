/**
 * Two things are being defended here, and only one of them is arithmetic.
 *
 * The first is the threshold rule: a moment must fire once, for the right rung, and never again —
 * including for the device that walks into a room that crossed every rung before it arrived.
 *
 * The second is the guardrail. "Never award on debt or spending power" is a promise that a code
 * review can only re-read, so it is encoded instead: `awardsFor` is handed a `RoomState` whose
 * every monetary field throws on access. A rule that reaches for one fails loudly, here, rather
 * than shipping a debtor ranking with a friendly name on it.
 */
import { describe, expect, it } from 'vitest'
import type { ApiExpense, ApiSettlement, RoomState } from './api-types'
import { awardsFor, crewUnlock, passportUnlock, unlocksFor } from './achievements'

const iso = (day: number, minute = 0) => new Date(Date.UTC(2026, 6, day, 12, minute)).toISOString()

interface ExpenseSpec {
    id?: string
    paidById: string
    createdById?: string | null
    currency?: string
    date?: string
    reactions?: string[]
    /** EQUAL across everyone named in `shares`; the amounts are never read. */
    shares?: string[]
}

interface SettlementSpec {
    fromId: string
    toId: string
    createdById?: string | null
}

const state = (
    members: string[],
    expenses: ExpenseSpec[] = [],
    settlements: SettlementSpec[] = [],
    suggestedTransfers: RoomState['suggestedTransfers'] = []
): RoomState => ({
    room: {
        id: 'room-1',
        slug: 'ski-trip-x7k2m9',
        name: 'Ski trip',
        emoji: null,
        currency: 'EUR',
        coverUrl: null,
        theme: null,
        createdAt: iso(1),
        archivedAt: null,
    },
    members: members.map((id, index) => ({ id, name: id.toUpperCase(), avatar: null, createdAt: iso(1, index) })),
    expenses: expenses.map((expense, index) => ({
        id: expense.id ?? `e${index}`,
        description: '',
        amountMinor: '1000',
        currency: expense.currency ?? 'EUR',
        baseAmountMinor: '1000',
        fxRate: '1',
        splitMode: 'EQUAL',
        paidById: expense.paidById,
        createdById: expense.createdById === undefined ? expense.paidById : expense.createdById,
        date: expense.date ?? `2026-07-0${(index % 9) + 1}`,
        category: null,
        createdAt: iso(2, index),
        shares: (expense.shares ?? members).map((memberId) => ({
            memberId,
            amountMinor: '500',
            enteredAmountMinor: null,
            splitWeight: null,
        })),
        reactions: (expense.reactions ?? []).map((memberId) => ({ emoji: '🔥', memberId })),
    })),
    settlements: settlements.map((settlement, index) => ({
        id: `s${index}`,
        fromId: settlement.fromId,
        toId: settlement.toId,
        createdById: settlement.createdById === undefined ? settlement.fromId : settlement.createdById,
        amountMinor: '500',
        method: 'cash',
        note: null,
        createdAt: iso(3, index),
    })),
    balances: Object.fromEntries(members.map((id) => [id, '0'])),
    suggestedTransfers,
})

/** A room that `isRoomSettled` accepts: two-plus people, a cross-person expense, nothing owed. */
const settledState = (
    members: string[],
    expenses: ExpenseSpec[] = [{ paidById: members[0] }],
    settlements: SettlementSpec[] = []
): RoomState => state(members, expenses, settlements)

const ids = (state: RoomState, meId?: string) => unlocksFor(state, meId).map((unlock) => unlock.id)

// ─── CREW ────────────────────────────────────────────────────────────────────

describe('crewUnlock', () => {
    it('says nothing below the first rung', () => {
        expect(crewUnlock(state(['a', 'b']))).toBeNull()
    })

    it('fires the rung that was crossed, and retires the ones below it', () => {
        const unlock = crewUnlock(state(['a', 'b', 'c']))
        expect(unlock).toMatchObject({ type: 'crew', id: 'crew-3', detail: { count: 3 } })
        expect(unlock?.covers).toEqual(['crew-3'])
    })

    it('gives a device that walks into a twelve-person room ONE moment, not four', () => {
        const unlock = crewUnlock(state(Array.from({ length: 12 }, (_, index) => `m${index}`)))
        expect(unlock?.id).toBe('crew-12')
        // The whole point: everything below is consumed in the same write.
        expect(unlock?.covers).toEqual(['crew-3', 'crew-5', 'crew-8', 'crew-12'])
    })

    it('a join that crosses nothing repeats the rung it is still standing on', () => {
        // 5 → 6 is the same unlock id the device already saw, so the seen-set drops it.
        expect(crewUnlock(state(['a', 'b', 'c', 'd', 'e', 'f']))?.id).toBe('crew-5')
        expect(crewUnlock(state(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']))?.id).toBe('crew-8')
    })
})

// ─── PASSPORT ────────────────────────────────────────────────────────────────

describe('passportUnlock', () => {
    it('counts expense currencies, not the room currency', () => {
        // Every expense in EUR, in a EUR room: one currency, no stamp.
        expect(passportUnlock(state(['a', 'b'], [{ paidById: 'a' }, { paidById: 'b' }]))).toBeNull()
    })

    it('fires at two and retires the rung on the way past it', () => {
        const room = state(
            ['a', 'b'],
            [
                { paidById: 'a', currency: 'EUR' },
                { paidById: 'b', currency: 'THB' },
            ]
        )
        expect(passportUnlock(room)).toMatchObject({ type: 'passport', id: 'passport-2', detail: { count: 2 } })

        const five = state(
            ['a', 'b'],
            ['EUR', 'THB', 'JPY', 'USD', 'GBP'].map((currency) => ({ paidById: 'a', currency }))
        )
        expect(passportUnlock(five)?.id).toBe('passport-5')
        expect(passportUnlock(five)?.covers).toEqual(['passport-2', 'passport-3', 'passport-5'])
    })

    it('ignores rows the server has never seen', () => {
        // The bug `lib/pending.ts` documents: an offline queue is not an achievement.
        const room = state(
            ['a', 'b'],
            [
                { id: 'pending-1', paidById: 'a', currency: 'EUR' },
                { id: 'pending-2', paidById: 'b', currency: 'THB' },
            ]
        )
        expect(passportUnlock(room)).toBeNull()
    })
})

describe('unlocksFor', () => {
    it('unlocks nothing from a room whose only expenses are still queued', () => {
        const room = state(['a', 'b'], [{ id: 'pending-1', paidById: 'a' }])
        expect(ids(room, 'a')).toEqual([])
    })

    it('holds the personal award back until the book is closed', () => {
        const open = state(['a', 'b', 'c'], [{ paidById: 'a' }], [], [{ fromId: 'b', toId: 'a', amountMinor: '500' }])
        expect(ids(open, 'a')).toEqual(['crew-3'])

        const closed = settledState(['a', 'b', 'c'], [{ paidById: 'a' }])
        expect(ids(closed, 'a')).toEqual(['crew-3', 'alterego', 'wrapped'])
    })

    it('has no alter-ego unlock for a device that received no award', () => {
        // This person performed none of the positive roles, so there is no personal card.
        const room = settledState(['a', 'b', 'c'], [{ paidById: 'a' }])
        expect(ids(room, 'c')).toEqual(['crew-3', 'wrapped'])
        expect(ids(room, undefined)).toEqual(['crew-3', 'wrapped'])
    })

    it('carries a drawable persona even for a legacy row with no avatar', () => {
        const room = settledState(['a', 'b'], [{ paidById: 'a' }])
        const alterego = unlocksFor(room, 'a').find((unlock) => unlock.type === 'alterego')
        expect(alterego?.detail.persona).toBe('doodle-peanut')
    })
})

// ─── ALTER-EGO ───────────────────────────────────────────────────────────────

describe('awardsFor', () => {
    it('never hands an award to somebody who did nothing', () => {
        // The most common shape Split has: Ana created the room, wrote every row, recorded the
        // settlement and left the reactions. Bruno gets nothing — not "First Mover" by default.
        const room = state(
            ['ana', 'bruno'],
            [
                { paidById: 'ana', reactions: ['ana'] },
                { paidById: 'ana', currency: 'THB' },
            ],
            [{ fromId: 'bruno', toId: 'ana', createdById: 'ana' }]
        )
        expect(awardsFor(room)).toEqual({ ana: 'tripStarter' })
    })

    it("assigns positive roles only from each member's own recorded actions", () => {
        const room = state(
            ['ana', 'bruno', 'caro', 'dan'],
            [
                { paidById: 'bruno', createdById: 'bruno', date: '2026-07-01' },
                { paidById: 'caro', createdById: 'caro', date: '2026-07-02', currency: 'THB' },
                { paidById: 'caro', createdById: 'caro', date: '2026-07-03' },
                { paidById: 'dan', createdById: 'dan', date: '2026-07-04', reactions: ['dan', 'dan'] },
            ],
            [{ fromId: 'dan', toId: 'ana', createdById: 'dan' }]
        )
        const awards = awardsFor(room)
        expect(awards.ana).toBe('tripStarter')
        expect(awards.bruno).toBe('firstMover')
        expect(awards.caro).toBe('ledgerLegend')
        expect(awards.dan).toBe('theCloser')
        expect(Object.keys(awards)).toHaveLength(4)
    })

    it('does not make role labels exclusive or leave an eligible seventh member out', () => {
        const members = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
        const room = state(
            members,
            members.flatMap((memberId, index) => [
                { paidById: memberId, currency: index % 2 ? 'THB' : 'EUR', reactions: [memberId] },
                { paidById: memberId, currency: 'JPY', reactions: [memberId] },
            ]),
            members.map((memberId) => ({ fromId: memberId, toId: 'a' }))
        )
        const awards = awardsFor(room)
        expect(Object.keys(awards)).toHaveLength(7)
        expect(awards.a).toBe('tripStarter')
        for (const memberId of members.slice(1)) expect(awards[memberId]).toBe('ledgerLegend')
    })

    it('survives a pure Splitwise import, where every writer is null', () => {
        const room = state(
            ['ana', 'bruno'],
            [
                { paidById: 'ana', createdById: null },
                { paidById: 'bruno', createdById: null },
            ],
            [{ fromId: 'bruno', toId: 'ana', createdById: null }]
        )
        // The honest outcome: the roster still has a head, and nothing else is knowable.
        expect(awardsFor(room)).toEqual({ ana: 'tripStarter' })
    })

    it('ignores a member id that is no longer on the roster', () => {
        const room = state(['ana'], [{ paidById: 'ghost', createdById: 'ghost' }])
        expect(awardsFor(room)).toEqual({ ana: 'tripStarter' })
    })

    it('gives the same answer a hundred times running', () => {
        const room = state(
            ['zoe', 'ana', 'bruno'],
            [
                { paidById: 'zoe', createdById: 'zoe', currency: 'THB' },
                { paidById: 'ana', createdById: 'ana', currency: 'EUR' },
                { paidById: 'bruno', createdById: 'bruno', currency: 'JPY' },
            ]
        )
        const first = awardsFor(room)
        for (let run = 0; run < 100; run += 1) expect(awardsFor(room)).toEqual(first)
    })

    it("never ranks one member's qualifying contribution against another's", () => {
        const anaQualifies = state(
            ['host', 'Zed', 'ana'],
            [
                { paidById: 'ana', createdById: 'ana', currency: 'EUR' },
                { paidById: 'ana', createdById: 'ana', currency: 'THB' },
            ]
        )
        expect(awardsFor(anaQualifies).ana).toBe('firstMover')

        const bothQualify = state(
            ['host', 'Zed', 'ana'],
            [
                { paidById: 'ana', createdById: 'ana', currency: 'EUR' },
                { paidById: 'ana', createdById: 'ana', currency: 'THB' },
                { paidById: 'Zed', createdById: 'Zed', currency: 'EUR' },
                { paidById: 'Zed', createdById: 'Zed', currency: 'THB' },
            ]
        )
        // Zed becoming eligible for the same activity cannot take Ana's earlier role away.
        expect(awardsFor(bothQualify).ana).toBe('firstMover')
        expect(awardsFor(bothQualify).Zed).toBe('ledgerLegend')
    })
})

// ─── the guardrail ───────────────────────────────────────────────────────────

/**
 * Every monetary field, replaced by a getter that throws.
 *
 * Stronger than permuting amounts: `balances` and `suggestedTransfers` are precomputed SERVER
 * fields on `RoomState`, not derivations of `amountMinor`, so a rule that read
 * `state.balances[memberId]` — the exact debtor ranking the roadmap bans — would sail through a
 * permutation test unchanged.
 */
const poison = (room: RoomState): RoomState => ({
    ...room,
    get balances(): never {
        throw new Error('awardsFor read balances')
    },
    get suggestedTransfers(): never {
        throw new Error('awardsFor read suggestedTransfers')
    },
    expenses: room.expenses.map((expense) => ({
        ...expense,
        get amountMinor(): never {
            throw new Error('awardsFor read amountMinor')
        },
        get baseAmountMinor(): never {
            throw new Error('awardsFor read baseAmountMinor')
        },
        get fxRate(): never {
            throw new Error('awardsFor read fxRate')
        },
        shares: expense.shares.map((share) => ({
            ...share,
            get amountMinor(): never {
                throw new Error('awardsFor read a share amount')
            },
            get enteredAmountMinor(): never {
                throw new Error('awardsFor read an entered share amount')
            },
        })),
    })) as ApiExpense[],
    settlements: room.settlements.map((settlement) => ({
        ...settlement,
        get amountMinor(): never {
            throw new Error('awardsFor read a settlement amount')
        },
    })) as ApiSettlement[],
})

/** Deterministic pseudo-random rooms — a seeded LCG, so a failure is reproducible. */
function* randomRooms(count: number): Generator<RoomState> {
    let seed = 20260730
    const next = (bound: number) => {
        seed = (seed * 1664525 + 1013904223) % 4294967296
        return seed % bound
    }
    const currencies = ['EUR', 'THB', 'JPY', 'USD']
    for (let index = 0; index < count; index += 1) {
        const members = Array.from({ length: 2 + next(6) }, (_, memberIndex) => `m${memberIndex}`)
        const expenses = Array.from({ length: next(12) }, () => {
            const writer = members[next(members.length)]
            return {
                paidById: members[next(members.length)],
                createdById: next(5) === 0 ? null : writer,
                currency: currencies[next(currencies.length)],
                date: `2026-07-0${1 + next(9)}`,
                reactions: Array.from({ length: next(3) }, () => members[next(members.length)]),
            }
        })
        const settlements = Array.from({ length: next(4) }, () => ({
            fromId: members[next(members.length)],
            toId: members[next(members.length)],
            createdById: next(5) === 0 ? null : members[next(members.length)],
        }))
        yield state(members, expenses, settlements)
    }
}

describe('the money guardrail', () => {
    it('never reads money', () => {
        for (const room of randomRooms(50)) expect(() => awardsFor(poison(room))).not.toThrow()
    })

    it('the poison is real — a rule that reached for a balance would throw', () => {
        // Without this, a bug in `poison` would make the test above pass vacuously forever.
        for (const room of randomRooms(1)) {
            const poisoned = poison(room)
            expect(() => poisoned.balances).toThrow('awardsFor read balances')
            expect(() => poisoned.expenses[0]?.amountMinor).toThrow('awardsFor read amountMinor')
        }
    })
})
