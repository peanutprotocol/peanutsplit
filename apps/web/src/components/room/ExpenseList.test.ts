import { describe, expect, it } from 'vitest'
import type { ApiExpense } from '@/lib/api-types'
import { getExpensePersonalPosition } from './ExpenseList'

const expense = (patch: Partial<ApiExpense> = {}): ApiExpense => ({
    id: 'expense',
    description: 'Pizza',
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
        {
            memberId: 'ana',
            amountMinor: '2000',
            enteredAmountMinor: null,
            splitWeight: null,
        },
        {
            memberId: 'bea',
            amountMinor: '2000',
            enteredAmountMinor: null,
            splitWeight: null,
        },
    ],
    reactions: [],
    ...patch,
})

describe('the compact expense personal position', () => {
    const members = ['ana', 'bea', 'marco']

    it.each([
        {
            name: 'payer lends everyone else their shares',
            row: expense(),
            meId: 'ana',
            expected: { direction: 'lent', amountMinor: '2000', currency: 'USD' },
        },
        {
            name: 'non-payer borrows their own share',
            row: expense(),
            meId: 'bea',
            expected: { direction: 'borrowed', amountMinor: '2000', currency: 'USD' },
        },
        {
            name: 'self-only spending is a neutral total rather than lent zero',
            row: expense({
                shares: [
                    {
                        memberId: 'ana',
                        amountMinor: '4000',
                        enteredAmountMinor: null,
                        splitWeight: null,
                    },
                ],
            }),
            meId: 'ana',
            expected: { direction: 'total', amountMinor: '4000', currency: 'USD' },
        },
        {
            name: 'a payer excluded from the split lent the full base amount',
            row: expense({
                shares: [
                    {
                        memberId: 'bea',
                        amountMinor: '4000',
                        enteredAmountMinor: null,
                        splitWeight: null,
                    },
                ],
            }),
            meId: 'ana',
            expected: { direction: 'lent', amountMinor: '4000', currency: 'USD' },
        },
        {
            name: 'an uninvolved room member sees the total',
            row: expense(),
            meId: 'marco',
            expected: { direction: 'total', amountMinor: '4000', currency: 'USD' },
        },
        {
            name: 'an invalid cached identity sees the total',
            row: expense(),
            meId: 'missing',
            expected: { direction: 'total', amountMinor: '4000', currency: 'USD' },
        },
        {
            name: 'rounding stays in integer minor units',
            row: expense({
                amountMinor: '100',
                baseAmountMinor: '100',
                shares: [
                    { memberId: 'ana', amountMinor: '33', enteredAmountMinor: null, splitWeight: null },
                    { memberId: 'bea', amountMinor: '67', enteredAmountMinor: null, splitWeight: null },
                ],
            }),
            meId: 'ana',
            expected: { direction: 'lent', amountMinor: '67', currency: 'USD' },
        },
        {
            name: 'amounts beyond Number safe range stay exact',
            row: expense({
                amountMinor: '90071992547409930',
                baseAmountMinor: '90071992547409930',
                shares: [
                    { memberId: 'ana', amountMinor: '30', enteredAmountMinor: null, splitWeight: null },
                    {
                        memberId: 'bea',
                        amountMinor: '90071992547409900',
                        enteredAmountMinor: null,
                        splitWeight: null,
                    },
                ],
            }),
            meId: 'ana',
            expected: { direction: 'lent', amountMinor: '90071992547409900', currency: 'USD' },
        },
    ])('$name', ({ row, meId, expected }) => {
        expect(getExpensePersonalPosition(row, 'USD', meId, members, false)).toEqual(expected)
    })

    it('uses the entered amount and currency for an unsaved foreign expense', () => {
        const row = expense({ amountMinor: '1234', currency: 'CHF', baseAmountMinor: '9999', shares: [] })

        expect(getExpensePersonalPosition(row, 'USD', 'ana', members, true)).toEqual({
            direction: 'total',
            amountMinor: '1234',
            currency: 'CHF',
        })
    })
})
