import { describe, expect, it } from 'vitest'
import { balancesOf, suggestedTransfers, toRoomState, type RoomWithRelations } from '@/server/roomState'

type ExpenseFixture = { paidById: string; baseAmountMinor: bigint; shares: [string, bigint][] }
type SettlementFixture = { fromId: string; toId: string; amountMinor: bigint }

const room = (memberIds: string[], expenses: ExpenseFixture[], settlements: SettlementFixture[] = []) =>
    ({
        members: memberIds.map((id) => ({ id })),
        expenses: expenses.map((e) => ({
            paidById: e.paidById,
            baseAmountMinor: e.baseAmountMinor,
            shares: e.shares.map(([memberId, amountMinor]) => ({ memberId, amountMinor })),
        })),
        settlements,
    }) as unknown as RoomWithRelations

/** Every balance map must net to zero — the money has to come from somewhere. */
const total = (balances: Map<string, bigint>) => [...balances.values()].reduce((a, b) => a + b, 0n)

describe('balancesOf', () => {
    it('credits the payer and debits each share', () => {
        const balances = balancesOf(
            room(
                ['a', 'b', 'c'],
                [
                    {
                        paidById: 'a',
                        baseAmountMinor: 1000n,
                        shares: [
                            ['a', 334n],
                            ['b', 333n],
                            ['c', 333n],
                        ],
                    },
                ]
            )
        )
        expect(balances.get('a')).toBe(666n)
        expect(balances.get('b')).toBe(-333n)
        expect(balances.get('c')).toBe(-333n)
        expect(total(balances)).toBe(0n)
    })

    it('applies settlements against the debt', () => {
        const balances = balancesOf(
            room(
                ['a', 'b'],
                [
                    {
                        paidById: 'a',
                        baseAmountMinor: 1000n,
                        shares: [
                            ['a', 500n],
                            ['b', 500n],
                        ],
                    },
                ],
                [{ fromId: 'b', toId: 'a', amountMinor: 500n }]
            )
        )
        expect(balances.get('a')).toBe(0n)
        expect(balances.get('b')).toBe(0n)
    })

    it('ignores rows for members who are no longer in the map', () => {
        const balances = balancesOf(
            room(
                ['a'],
                [
                    {
                        paidById: 'a',
                        baseAmountMinor: 100n,
                        shares: [
                            ['a', 50n],
                            ['ghost', 50n],
                        ],
                    },
                ]
            )
        )
        expect(balances.get('a')).toBe(50n)
        expect(balances.has('ghost')).toBe(false)
    })
})

describe('suggestedTransfers', () => {
    const settle = (balances: Map<string, bigint>) => {
        const transfers = suggestedTransfers(balances)
        const after = new Map(balances)
        for (const t of transfers) {
            after.set(t.fromId, after.get(t.fromId)! + BigInt(t.amountMinor))
            after.set(t.toId, after.get(t.toId)! - BigInt(t.amountMinor))
        }
        return { transfers, after }
    }

    it('nets a simple two-person debt into one transfer', () => {
        const { transfers } = settle(
            new Map([
                ['a', 500n],
                ['b', -500n],
            ])
        )
        expect(transfers).toEqual([{ fromId: 'b', toId: 'a', amountMinor: '500' }])
    })

    it('zeroes every balance in at most n-1 transfers', () => {
        const cases: bigint[][] = [
            [0n],
            [100n, -100n],
            [1000n, -400n, -600n],
            [-1000n, 400n, 600n],
            [700n, 300n, -250n, -750n],
            [1n, 1n, 1n, -3n],
            [12345n, -1n, -2n, -3n, -12339n],
        ]
        for (const amounts of cases) {
            const balances = new Map(amounts.map((amount, i) => [`m${i}`, amount]))
            const { transfers, after } = settle(balances)
            expect(transfers.length).toBeLessThanOrEqual(Math.max(amounts.length - 1, 0))
            expect([...after.values()].every((v) => v === 0n)).toBe(true)
        }
    })

    it('suggests nothing when everyone is square', () => {
        expect(
            suggestedTransfers(
                new Map([
                    ['a', 0n],
                    ['b', 0n],
                ])
            )
        ).toEqual([])
    })
})

describe('toRoomState weighted share serialization', () => {
    it('emits split weights as decimal strings and absent weights as null', () => {
        const createdAt = new Date('2026-08-02T12:00:00.000Z')
        const state = toRoomState({
            id: 'room',
            slug: 'weighted-room',
            name: 'Weighted room',
            emoji: null,
            currency: 'EUR',
            coverUrl: null,
            theme: null,
            locale: null,
            createdAt,
            members: [
                {
                    id: 'a',
                    roomId: 'room',
                    name: 'Ana',
                    token: 'token-a',
                    avatar: null,
                    userId: null,
                    provisional: false,
                    createdAt,
                    removedAt: null,
                    canRemove: false,
                },
                {
                    id: 'b',
                    roomId: 'room',
                    name: 'Bea',
                    token: 'token-b',
                    avatar: null,
                    userId: null,
                    provisional: false,
                    createdAt,
                    removedAt: null,
                    canRemove: false,
                },
            ],
            expenses: [
                {
                    id: 'weighted',
                    roomId: 'room',
                    description: 'Cabin',
                    amountMinor: 100n,
                    currency: 'EUR',
                    baseAmountMinor: 100n,
                    fxRate: { toFixed: () => '1.000000000000' },
                    paidById: 'a',
                    createdById: 'a',
                    splitMode: 'PERCENTAGE',
                    date: createdAt,
                    category: null,
                    createdAt,
                    deletedAt: null,
                    shares: [
                        {
                            id: 'share-a',
                            expenseId: 'weighted',
                            memberId: 'a',
                            amountMinor: 25n,
                            enteredAmountMinor: null,
                            splitWeight: 2500n,
                        },
                        {
                            id: 'share-b',
                            expenseId: 'weighted',
                            memberId: 'b',
                            amountMinor: 75n,
                            enteredAmountMinor: null,
                            splitWeight: 7500n,
                        },
                    ],
                    reactions: [],
                },
                {
                    id: 'equal',
                    roomId: 'room',
                    description: 'Coffee',
                    amountMinor: 10n,
                    currency: 'EUR',
                    baseAmountMinor: 10n,
                    fxRate: { toFixed: () => '1.000000000000' },
                    paidById: 'a',
                    createdById: null,
                    splitMode: 'EQUAL',
                    date: createdAt,
                    category: null,
                    createdAt,
                    deletedAt: null,
                    shares: [
                        {
                            id: 'share-equal',
                            expenseId: 'equal',
                            memberId: 'a',
                            amountMinor: 10n,
                            enteredAmountMinor: null,
                            splitWeight: null,
                        },
                    ],
                    reactions: [],
                },
            ],
            settlements: [],
            pushSubscriptions: [],
            notificationSends: [],
        } as unknown as RoomWithRelations)

        expect(state.expenses.find((expense) => expense.id === 'weighted')?.shares).toEqual([
            { memberId: 'a', amountMinor: '25', enteredAmountMinor: null, splitWeight: '2500' },
            { memberId: 'b', amountMinor: '75', enteredAmountMinor: null, splitWeight: '7500' },
        ])
        expect(state.expenses.find((expense) => expense.id === 'equal')?.shares[0].splitWeight).toBeNull()
    })
})

describe('toRoomState analytics pseudonym', () => {
    const base = (id: string, slug: string) =>
        ({
            id,
            slug,
            name: 'Room',
            emoji: null,
            currency: 'EUR',
            coverUrl: null,
            theme: null,
            locale: null,
            createdAt: new Date('2026-08-08T00:00:00.000Z'),
            members: [],
            expenses: [],
            settlements: [],
        }) as unknown as RoomWithRelations

    it('derives a stable 32-hex key that is not the slug or the id', () => {
        const key = toRoomState(base('room-uuid-1', 'ski-trip-nL5tI')).room.analyticsKey

        expect(key).toMatch(/^[0-9a-f]{32}$/)
        expect(key).not.toBe('room-uuid-1')
        expect(key).not.toContain('ski-trip')
        // Stable across calls, or a room's analytics would fragment per request.
        expect(toRoomState(base('room-uuid-1', 'ski-trip-nL5tI')).room.analyticsKey).toBe(key)
    })

    it('keys off the id, not the slug — renaming a room must not fork its history', () => {
        const first = toRoomState(base('room-uuid-1', 'ski-trip-nL5tI')).room.analyticsKey
        const renamed = toRoomState(base('room-uuid-1', 'totally-different-slug')).room.analyticsKey

        expect(renamed).toBe(first)
    })

    it('gives different rooms different keys', () => {
        const a = toRoomState(base('room-uuid-1', 'a')).room.analyticsKey
        const b = toRoomState(base('room-uuid-2', 'a')).room.analyticsKey

        expect(a).not.toBe(b)
    })
})
