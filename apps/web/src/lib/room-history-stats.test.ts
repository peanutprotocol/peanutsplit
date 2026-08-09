import { describe, expect, it } from 'vitest'
import type { ApiExpense, ApiMember, RoomState } from './api-types'
import { roomHistoryStats } from './room-history-stats'

const member = (id: string, removedAt?: string): ApiMember => ({
    id,
    name: id.toUpperCase(),
    avatar: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...(removedAt ? { removedAt } : {}),
})

const members = [member('ana'), member('bea'), member('cora')]

const expense = (
    id: string,
    baseAmountMinor: string,
    options: Partial<ApiExpense> & Pick<ApiExpense, 'paidById' | 'shares'>
): ApiExpense => ({
    id,
    description: id,
    amountMinor: baseAmountMinor,
    currency: 'EUR',
    baseAmountMinor,
    fxRate: '1',
    splitMode: 'EXACT',
    createdById: options.paidById,
    date: '2026-01-01T00:00:00.000Z',
    category: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    reactions: [],
    ...options,
})

const share = (memberId: string, amountMinor: string) => ({
    memberId,
    amountMinor,
    enteredAmountMinor: null,
    splitWeight: null,
})

const state = (expenses: ApiExpense[], roster: ApiMember[] = members): RoomState => ({
    room: {
        id: 'room-id',
        slug: 'room-secret',
        name: 'The room',
        emoji: null,
        currency: 'EUR',
        coverUrl: null,
        theme: null,
        createdAt: '2026-01-01T00:00:00.000Z',
    },
    members: roster,
    expenses,
    settlements: [],
    balances: {},
    suggestedTransfers: [],
})

describe('roomHistoryStats', () => {
    it('keeps who consumed the largest share separate from who fronted the money', () => {
        const stats = roomHistoryStats(
            state([
                expense('hotel', '1000', {
                    amountMinor: '800',
                    currency: 'GBP',
                    fxRate: '1.25',
                    paidById: 'ana',
                    shares: [share('ana', '100'), share('bea', '900')],
                }),
                expense('train', '500', {
                    paidById: 'ana',
                    shares: [share('ana', '500')],
                }),
            ])
        )

        expect(stats.totalMinor).toBe('1500')
        expect(stats.averageExpenseMinor).toBe('750')
        expect(stats.largestAllocatedShareByMember).toEqual({ memberIds: ['bea'], amountMinor: '900' })
        expect(stats.frontedMostByMember).toEqual({ memberIds: ['ana'], amountMinor: '1500' })
        expect(stats.distinctCurrencies).toEqual(['EUR', 'GBP'])
    })

    it('groups frozen room-currency totals by the expense calendar month, oldest first', () => {
        const stats = roomHistoryStats(
            state([
                expense('feb', '500', {
                    paidById: 'ana',
                    shares: [share('ana', '500')],
                    date: '2026-02-02T23:30:00-03:00',
                }),
                expense('jan-b', '200', {
                    paidById: 'bea',
                    shares: [share('bea', '200')],
                    date: '2026-01-31T12:00:00.000Z',
                }),
                expense('jan-a', '100', {
                    paidById: 'ana',
                    shares: [share('ana', '100')],
                    date: '2026-01-01T00:00:00.000Z',
                }),
            ])
        )

        expect(stats.monthlyTotals).toEqual([
            { month: '2026-01', amountMinor: '300', expenseCount: 2 },
            { month: '2026-02', amountMinor: '500', expenseCount: 1 },
        ])
        expect(stats.peakSpendDay).toEqual({ day: '2026-02-02', amountMinor: '500', expenseCount: 1 })
    })

    it('breaks every tied winner in stable code-unit order, independent of input order', () => {
        const rows = [
            expense('z-expense', '100', {
                paidById: 'bea',
                shares: [share('bea', '50'), share('ana', '50')],
                date: '2026-02-01T00:00:00.000Z',
                category: 'travel',
                reactions: [
                    { memberId: 'ana', emoji: 'spark' },
                    { memberId: 'bea', emoji: 'heart' },
                ],
            }),
            expense('a-expense', '100', {
                paidById: 'ana',
                shares: [share('ana', '50'), share('bea', '50')],
                date: '2026-01-01T00:00:00.000Z',
                category: 'food',
                reactions: [
                    { memberId: 'ana', emoji: 'spark' },
                    { memberId: 'bea', emoji: 'heart' },
                ],
            }),
        ]

        const forward = roomHistoryStats(state(rows, [member('bea'), member('ana')]))
        const reversed = roomHistoryStats(state([...rows].reverse(), [member('ana'), member('bea')]))

        expect(reversed).toEqual(forward)
        expect(forward.largestAllocatedShareByMember).toEqual({ memberIds: ['ana', 'bea'], amountMinor: '100' })
        expect(forward.frontedMostByMember).toEqual({ memberIds: ['ana', 'bea'], amountMinor: '100' })
        expect(forward.topCategory?.category).toBe('food')
        expect(forward.peakSpendDay?.day).toBe('2026-01-01')
        expect(forward.mostReactedExpense?.expenseId).toBe('a-expense')
        expect(forward.mostCommunalExpense?.expenseId).toBe('a-expense')
    })

    it('keeps a former member eligible for historical share and fronting totals', () => {
        const former = member('cora', '2026-03-01T00:00:00.000Z')
        const stats = roomHistoryStats(
            state(
                [
                    expense('old-hotel', '900', {
                        paidById: 'cora',
                        shares: [share('cora', '600'), share('ana', '300')],
                    }),
                ],
                [member('ana'), former]
            )
        )

        expect(stats.largestAllocatedShareByMember).toEqual({ memberIds: ['cora'], amountMinor: '600' })
        expect(stats.frontedMostByMember).toEqual({ memberIds: ['cora'], amountMinor: '900' })
    })

    it('returns honest empty values when a room has no expenses', () => {
        expect(roomHistoryStats(state([]), new Date(2026, 0, 15, 12))).toEqual({
            expenseCount: 0,
            totalMinor: '0',
            averageExpenseMinor: null,
            largestAllocatedShareByMember: null,
            frontedMostByMember: null,
            monthlyTotals: [],
            monthToDateComparison: {
                current: { month: '2026-01', throughDay: 15, amountMinor: '0' },
                previous: { month: '2025-12', throughDay: 15, amountMinor: '0' },
                kind: 'no-spend',
                percentChange: null,
            },
            topCategory: null,
            peakSpendDay: null,
            mostReactedExpense: null,
            mostCommunalExpense: null,
            distinctCurrencies: [],
        })
    })

    it('derives category and quirky winners only after each fact is meaningful', () => {
        const quiet = expense('quiet', '101', {
            paidById: 'ana',
            shares: [share('ana', '101')],
            category: '  ',
        })
        const quietStats = roomHistoryStats(state([quiet]))
        expect(quietStats.averageExpenseMinor).toBe('101')
        expect(quietStats.topCategory).toBeNull()
        expect(quietStats.mostReactedExpense).toBeNull()
        expect(quietStats.mostCommunalExpense).toBeNull()

        const stats = roomHistoryStats(
            state([
                quiet,
                expense('dinner', '401', {
                    paidById: 'bea',
                    shares: [share('ana', '101'), share('bea', '100'), share('cora', '200')],
                    date: '2026-01-02T00:00:00.000Z',
                    category: 'food',
                    reactions: [
                        { memberId: 'ana', emoji: 'heart' },
                        { memberId: 'bea', emoji: 'spark' },
                    ],
                }),
                expense('groceries', '200', {
                    paidById: 'ana',
                    shares: [share('ana', '100'), share('bea', '100')],
                    date: '2026-01-02T12:00:00.000Z',
                    category: 'food',
                    reactions: [{ memberId: 'cora', emoji: 'heart' }],
                }),
                expense('museum', '500', {
                    paidById: 'cora',
                    shares: [share('ana', '250'), share('cora', '250')],
                    date: '2026-01-03T00:00:00.000Z',
                    category: 'fun',
                    currency: 'USD',
                }),
            ])
        )

        expect(stats.averageExpenseMinor).toBe('301')
        expect(stats.topCategory).toEqual({ category: 'food', amountMinor: '601', expenseCount: 2 })
        expect(stats.peakSpendDay).toEqual({ day: '2026-01-02', amountMinor: '601', expenseCount: 2 })
        expect(stats.mostReactedExpense).toEqual({ expenseId: 'dinner', reactionCount: 2 })
        expect(stats.mostCommunalExpense).toEqual({ expenseId: 'dinner', participantCount: 3 })
        expect(stats.distinctCurrencies).toEqual(['EUR', 'USD'])
    })

    it('rounds a fractional average half-up to the nearest minor unit', () => {
        const stats = roomHistoryStats(
            state([
                expense('one', '2', { paidById: 'ana', shares: [share('ana', '2')] }),
                expense('two', '3', { paidById: 'bea', shares: [share('bea', '3')] }),
            ])
        )

        expect(stats.averageExpenseMinor).toBe('3')
    })

    it('drops optimistic and offline pending rows from every conclusion', () => {
        const stats = roomHistoryStats(
            state([
                expense('saved', '100', {
                    paidById: 'ana',
                    shares: [share('ana', '100')],
                    date: '2026-08-05T00:00:00.000Z',
                    category: 'food',
                }),
                expense('pending-offline-draft', '999999', {
                    paidById: 'bea',
                    shares: [share('bea', '999999')],
                    date: '2026-08-06T00:00:00.000Z',
                    category: 'travel',
                    currency: 'USD',
                    reactions: [{ memberId: 'bea', emoji: 'spark' }],
                }),
            ]),
            new Date(2026, 7, 9, 12)
        )

        expect(stats.expenseCount).toBe(1)
        expect(stats.totalMinor).toBe('100')
        expect(stats.frontedMostByMember).toEqual({ memberIds: ['ana'], amountMinor: '100' })
        expect(stats.monthlyTotals).toEqual([{ month: '2026-08', amountMinor: '100', expenseCount: 1 }])
        expect(stats.monthToDateComparison.current.amountMinor).toBe('100')
        expect(stats.topCategory?.category).toBe('food')
        expect(stats.mostReactedExpense).toBeNull()
        expect(stats.distinctCurrencies).toEqual(['EUR'])
    })

    it('compares MTD with the same prior-month days and excludes future-dated rows', () => {
        const stats = roomHistoryStats(
            state([
                expense('aug-01', '100', {
                    paidById: 'ana',
                    shares: [share('ana', '100')],
                    date: '2026-08-01T23:30:00-03:00',
                }),
                expense('aug-09', '200', {
                    paidById: 'ana',
                    shares: [share('ana', '200')],
                    date: '2026-08-09T00:00:00.000Z',
                }),
                expense('aug-10-future', '5000', {
                    paidById: 'ana',
                    shares: [share('ana', '5000')],
                    date: '2026-08-10T00:00:00.000Z',
                }),
                expense('jul-01', '40', {
                    paidById: 'bea',
                    shares: [share('bea', '40')],
                    date: '2026-07-01T00:00:00.000Z',
                }),
                expense('jul-09', '60', {
                    paidById: 'bea',
                    shares: [share('bea', '60')],
                    date: '2026-07-09T00:00:00.000Z',
                }),
                expense('jul-10-outside-window', '7000', {
                    paidById: 'bea',
                    shares: [share('bea', '7000')],
                    date: '2026-07-10T00:00:00.000Z',
                }),
                expense('sep-future', '9000', {
                    paidById: 'cora',
                    shares: [share('cora', '9000')],
                    date: '2026-09-01T00:00:00.000Z',
                }),
            ]),
            new Date(2026, 7, 9, 12)
        )

        expect(stats.monthToDateComparison).toEqual({
            current: { month: '2026-08', throughDay: 9, amountMinor: '300' },
            previous: { month: '2026-07', throughDay: 9, amountMinor: '100' },
            kind: 'increase',
            percentChange: '200',
        })
    })

    it('clamps March comparison to the leap-year February cutoff', () => {
        const stats = roomHistoryStats(
            state([
                expense('march-31', '310', {
                    paidById: 'ana',
                    shares: [share('ana', '310')],
                    date: '2024-03-31T00:00:00.000Z',
                }),
                expense('leap-day', '290', {
                    paidById: 'bea',
                    shares: [share('bea', '290')],
                    date: '2024-02-29T00:00:00.000Z',
                }),
            ]),
            new Date(2024, 2, 31, 12)
        )

        expect(stats.monthToDateComparison).toEqual({
            current: { month: '2024-03', throughDay: 31, amountMinor: '310' },
            previous: { month: '2024-02', throughDay: 29, amountMinor: '290' },
            kind: 'increase',
            percentChange: '7',
        })
    })

    it('uses explicit zero-prior states instead of an infinite percentage', () => {
        const stats = roomHistoryStats(
            state([
                expense('aug-only', '500', {
                    paidById: 'ana',
                    shares: [share('ana', '500')],
                    date: '2026-08-05T00:00:00.000Z',
                }),
            ]),
            new Date(2026, 7, 9, 12)
        )

        expect(stats.monthToDateComparison).toMatchObject({
            current: { amountMinor: '500' },
            previous: { amountMinor: '0' },
            kind: 'new-spend',
            percentChange: null,
        })
    })

    it('distinguishes a real decrease from an unchanged month', () => {
        const prior = expense('prior', '400', {
            paidById: 'bea',
            shares: [share('bea', '400')],
            date: '2026-07-05T00:00:00.000Z',
        })
        const current = expense('current', '300', {
            paidById: 'ana',
            shares: [share('ana', '300')],
            date: '2026-08-05T00:00:00.000Z',
        })
        const now = new Date(2026, 7, 9, 12)

        expect(roomHistoryStats(state([prior, current]), now).monthToDateComparison).toMatchObject({
            kind: 'decrease',
            percentChange: '-25',
        })
        expect(
            roomHistoryStats(state([prior, { ...current, baseAmountMinor: '400', shares: [share('ana', '400')] }]), now)
                .monthToDateComparison
        ).toMatchObject({ kind: 'unchanged', percentChange: '0' })
    })

    it('calculates percentages beyond Number range without precision loss or Infinity', () => {
        const huge = 10n ** 100n
        const stats = roomHistoryStats(
            state([
                expense('current-huge', huge.toString(), {
                    paidById: 'ana',
                    shares: [share('ana', huge.toString())],
                    date: '2026-08-05T00:00:00.000Z',
                }),
                expense('prior-one', '1', {
                    paidById: 'bea',
                    shares: [share('bea', '1')],
                    date: '2026-07-05T00:00:00.000Z',
                }),
            ]),
            new Date(2026, 7, 9, 12)
        )

        expect(stats.monthToDateComparison.current.amountMinor).toBe(huge.toString())
        expect(stats.monthToDateComparison.previous.amountMinor).toBe('1')
        expect(stats.monthToDateComparison.percentChange).toBe(((huge - 1n) * 100n).toString())
        expect(stats.monthToDateComparison.percentChange).not.toContain('Infinity')
    })
})
