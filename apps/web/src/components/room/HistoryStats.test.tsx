import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApiExpense, ApiMember, RoomState } from '@/lib/api-types'

vi.mock('next-intl', () => ({
    useLocale: () => 'en',
    useTranslations: () => (key: string, values?: Record<string, unknown>) => {
        if (key === 'formerName') return `${String(values?.name)} · Former`
        return key
    },
}))

vi.mock('./Money', () => ({
    Money: ({ minor, currency }: { minor: string; currency: string }) =>
        createElement('span', { 'data-money': minor, 'data-currency': currency }, minor),
}))

import { HistoryStats, recentRoomMonths } from './HistoryStats'

const members: ApiMember[] = [
    { id: 'ana', name: 'Ana', avatar: null, createdAt: '2026-01-01T00:00:00.000Z' },
    {
        id: 'bea',
        name: 'Bea',
        avatar: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        removedAt: '2026-08-08T00:00:00.000Z',
    },
    { id: 'cora', name: 'Cora', avatar: null, createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'dani', name: 'Dani', avatar: null, createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'eli', name: 'Eli', avatar: null, createdAt: '2026-01-01T00:00:00.000Z' },
]

const expense = (id: string, date: string, paidById: string, currency: string): ApiExpense => ({
    id,
    description: id === 'august-table' ? 'The long table' : 'July table',
    amountMinor: '200',
    currency,
    baseAmountMinor: '200',
    fxRate: '1',
    splitMode: 'EXACT',
    paidById,
    createdById: paidById,
    date,
    category: 'food-drink',
    createdAt: date,
    shares: [
        { memberId: 'ana', amountMinor: '70', enteredAmountMinor: null, splitWeight: null },
        { memberId: 'bea', amountMinor: '70', enteredAmountMinor: null, splitWeight: null },
        { memberId: 'cora', amountMinor: '60', enteredAmountMinor: null, splitWeight: null },
    ],
    reactions: id === 'august-table' ? members.map((member) => ({ memberId: member.id, emoji: 'heart' })) : [],
})

const state = (expenses: ApiExpense[]): RoomState => ({
    room: {
        id: 'room-id',
        slug: 'private-room-capability',
        name: 'Summer table',
        emoji: null,
        currency: 'EUR',
        coverUrl: null,
        theme: null,
        createdAt: '2026-01-01T00:00:00.000Z',
    },
    members,
    expenses,
    settlements: [],
    balances: {},
    suggestedTransfers: [],
})

afterEach(() => vi.useRealTimers())

describe('HistoryStats', () => {
    it('fills quiet calendar months and limits the chart to the latest six', () => {
        expect(
            recentRoomMonths([
                { month: '2025-12', amountMinor: '100', expenseCount: 1 },
                { month: '2026-08', amountMinor: '200', expenseCount: 1 },
            ])
        ).toEqual([
            { month: '2026-03', amountMinor: '0', expenseCount: 0 },
            { month: '2026-04', amountMinor: '0', expenseCount: 0 },
            { month: '2026-05', amountMinor: '0', expenseCount: 0 },
            { month: '2026-06', amountMinor: '0', expenseCount: 0 },
            { month: '2026-07', amountMinor: '0', expenseCount: 0 },
            { month: '2026-08', amountMinor: '200', expenseCount: 1 },
        ])
    })

    it('renders semantic stats, tied names, MTD comparison, and earned room lore', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date(2026, 7, 9, 12))

        const html = renderToStaticMarkup(
            <HistoryStats
                now={new Date(2026, 7, 9, 12)}
                state={state([
                    expense('august-table', '2026-08-05T00:00:00.000Z', 'ana', 'USD'),
                    expense('july-table', '2026-07-05T00:00:00.000Z', 'bea', 'EUR'),
                ])}
            />
        )

        expect(html).toContain('<section')
        expect(html).toContain('<dl')
        expect(html).toContain('statsTitle')
        expect(html).toContain('monthOverMonth')
        expect(html).toContain('mtdSame')
        expect(html).toContain('Ana &amp; Bea · Former')
        expect(html).toContain('crowdFavorite')
        expect(html).toContain('sharedTable')
        expect(html).toContain('currencyPassport')
    })

    it('uses one neutral empty state without manufacturing member rankings', () => {
        const html = renderToStaticMarkup(<HistoryStats state={state([])} />)

        expect(html).toContain('statsEmpty')
        expect(html).not.toContain('largestShare')
        expect(html).not.toContain('frontedMost')
        expect(html).not.toContain('roomLore')
    })
})
