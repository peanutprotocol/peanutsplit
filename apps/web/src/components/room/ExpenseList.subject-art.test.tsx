import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { ApiExpense, RoomState } from '@/lib/api-types'

vi.mock('next/image', () => ({
    default: ({ unoptimized: _unoptimized, ...props }: Record<string, unknown>) => createElement('img', props),
}))

vi.mock('motion/react', () => {
    const element = (tag: 'div' | 'li' | 'section') =>
        function MotionElement({
            animate: _animate,
            exit: _exit,
            initial: _initial,
            layout: _layout,
            transition: _transition,
            children,
            ...props
        }: Record<string, unknown> & { children?: ReactNode }) {
            return createElement(tag, props, children)
        }

    return {
        AnimatePresence: ({ children }: { children?: ReactNode }) => children,
        motion: {
            div: element('div'),
            li: element('li'),
            section: element('section'),
        },
    }
})

vi.mock('next-intl', () => ({
    useLocale: () => 'en',
    useTranslations: () => (key: string, values?: Record<string, string>) =>
        values ? `${key}:${Object.values(values).join(',')}` : key,
}))

vi.mock('@/components/ui/Doodle', () => ({
    Doodle: ({ name, label, size, weight }: { name: string; label?: string; size?: number; weight?: number }) =>
        createElement('span', {
            'aria-label': label,
            'aria-hidden': label ? undefined : true,
            'data-doodle-name': name,
            'data-doodle-size': size,
            'data-doodle-weight': weight,
        }),
}))

vi.mock('@/lib/offline-queue', () => ({
    isQueuedExpenseId: () => false,
    useQueuedWrites: () => [],
}))

vi.mock('@/lib/use-motion', () => ({ useMotionAllowed: () => false }))
vi.mock('./Money', () => ({ Money: () => createElement('span', null, 'money') }))
vi.mock('./ReactionBar', () => ({ ReactionBar: () => null }))
vi.mock('./SettlementRow', () => ({ SettlementRow: () => null }))

import { ExpenseList } from './ExpenseList'

const expense = (description: string): ApiExpense => ({
    id: 'expense',
    description,
    amountMinor: '4000',
    currency: 'USD',
    baseAmountMinor: '4000',
    fxRate: '1',
    splitMode: 'EQUAL',
    paidById: 'ana',
    createdById: 'ana',
    date: '2026-08-03T12:00:00.000Z',
    category: null,
    createdAt: '2026-08-03T12:00:00.000Z',
    shares: [
        { memberId: 'ana', amountMinor: '2000', enteredAmountMinor: null, splitWeight: null },
        { memberId: 'bea', amountMinor: '2000', enteredAmountMinor: null, splitWeight: null },
    ],
    reactions: [],
})

const state = (description: string): RoomState => ({
    room: {
        id: 'room',
        slug: 'summer-trip',
        name: 'Summer trip',
        emoji: null,
        currency: 'USD',
        coverUrl: null,
        theme: null,
        createdAt: '2026-08-03T10:00:00.000Z',
    },
    members: [
        { id: 'ana', name: 'Ana', avatar: 'peanut', createdAt: '2026-08-03T10:00:00.000Z' },
        { id: 'bea', name: 'Bea', avatar: 'bee', createdAt: '2026-08-03T10:00:00.000Z' },
    ],
    expenses: [expense(description)],
    settlements: [],
    balances: { ana: '2000', bea: '-2000' },
    suggestedTransfers: [{ fromId: 'bea', toId: 'ana', amountMinor: '2000' }],
})

const renderExpense = (description: string) =>
    renderToStaticMarkup(
        <ExpenseList
            state={state(description)}
            currencies={[{ code: 'USD', symbol: '$', name: 'US dollar', decimals: 2, hasRate: true }]}
            meId="bea"
            slug="summer-trip"
            token="member-token"
            onSelect={() => undefined}
            onShare={() => undefined}
            onAdd={() => undefined}
        />
    )

describe('ExpenseList subject art', () => {
    it.each([
        { description: 'Pizza', subject: 'pizza', doodle: 'pizza', match: 'exact term' },
        { description: 'Gas bill for the flat', subject: 'utilities', doodle: 'lightbulb', match: 'phrase' },
        { description: 'Tiket', subject: 'generic-ticket', doodle: 'expense_ticket', match: 'typo' },
        { description: 'SIM', subject: 'sim-card', doodle: 'expense_card_sim', match: 'exact short term' },
        { description: 'Ultraviolet marmalade', subject: 'other', doodle: 'question', match: 'fallback' },
        { description: '', subject: 'other', doodle: 'question', match: 'empty fallback' },
    ])('renders the $subject doodle for a $match description', ({ description, subject, doodle }) => {
        const card = renderExpense(description)

        expect(card).toContain(`data-expense-subject="${subject}"`)
        expect(card).toContain(`data-doodle-name="${doodle}"`)
    })

    it('keeps the payer identity in the card copy', () => {
        const card = renderExpense('Pizza')

        expect(card).toContain('paidByCompact:Ana')
    })

    it('uses the locked bare-hero size and keeps inferred art decorative', () => {
        const card = renderExpense('Pizza')
        const doodle = card.match(/<span[^>]*data-doodle-name="pizza"[^>]*>/)?.[0]

        expect(doodle).toContain('aria-hidden="true"')
        expect(doodle).not.toContain('aria-label')
        expect(doodle).toContain('data-doodle-size="44"')
        expect(doodle).toContain('data-doodle-weight="1.4"')
    })
})
