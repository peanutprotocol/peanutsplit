import { describe, expect, it } from 'vitest'
import type { ApiExpense } from './api-types'
import { personalExpenseImpact } from './expense-impact'

const expense = (overrides: Partial<ApiExpense> = {}): ApiExpense => ({
    id: 'expense-1',
    description: 'Dinner',
    amountMinor: '3000',
    currency: 'USD',
    baseAmountMinor: '3000',
    fxRate: '1',
    splitMode: 'EQUAL',
    paidById: 'ana',
    createdById: 'ana',
    date: '2026-08-03',
    category: null,
    createdAt: '2026-08-03T12:00:00.000Z',
    shares: [
        { memberId: 'ana', amountMinor: '1500', enteredAmountMinor: null, splitWeight: null },
        { memberId: 'bea', amountMinor: '1500', enteredAmountMinor: null, splitWeight: null },
    ],
    reactions: [],
    ...overrides,
})

describe('personalExpenseImpact', () => {
    it('marks a participant who did not pay as outgoing by their share', () => {
        expect(personalExpenseImpact(expense(), 'bea')).toEqual({
            direction: 'outgoing',
            signedMinor: '-1500',
            amountMinor: '1500',
            neutralReason: undefined,
        })
    })

    it('marks the payer as incoming only for what they covered for others', () => {
        expect(personalExpenseImpact(expense(), 'ana')).toEqual({
            direction: 'incoming',
            signedMinor: '1500',
            amountMinor: '1500',
            neutralReason: undefined,
        })
    })

    it('gives a payer who was not in the split the full room-currency effect', () => {
        const coveredForOthers = expense({
            shares: [{ memberId: 'bea', amountMinor: '3000', enteredAmountMinor: null, splitWeight: null }],
        })

        expect(personalExpenseImpact(coveredForOthers, 'ana')?.signedMinor).toBe('3000')
    })

    it('uses the locked room-currency total and shares for a foreign expense', () => {
        const foreign = expense({ amountMinor: '2000', currency: 'EUR', baseAmountMinor: '2400' })

        expect(personalExpenseImpact(foreign, 'ana')?.signedMinor).toBe('900')
    })

    it('sums duplicate imported shares instead of silently ignoring one', () => {
        const imported = expense({
            shares: [
                { memberId: 'bea', amountMinor: '700', enteredAmountMinor: null, splitWeight: null },
                { memberId: 'bea', amountMinor: '800', enteredAmountMinor: null, splitWeight: null },
            ],
        })

        expect(personalExpenseImpact(imported, 'bea')?.signedMinor).toBe('-1500')
    })

    it('calls an excluded participant and a self-only payer neutral', () => {
        expect(personalExpenseImpact(expense(), 'cara')?.neutralReason).toBe('not-in-split')
        expect(
            personalExpenseImpact(
                expense({
                    baseAmountMinor: '3000',
                    shares: [{ memberId: 'ana', amountMinor: '3000', enteredAmountMinor: null, splitWeight: null }],
                }),
                'ana'
            )
        ).toEqual({
            direction: 'neutral',
            signedMinor: '0',
            amountMinor: '0',
            neutralReason: 'no-balance-change',
        })
    })

    it('treats an included zero share as no change rather than not in the split', () => {
        const rounded = expense({
            paidById: 'ana',
            baseAmountMinor: '1',
            shares: [
                { memberId: 'ana', amountMinor: '1', enteredAmountMinor: null, splitWeight: null },
                { memberId: 'bea', amountMinor: '0', enteredAmountMinor: null, splitWeight: null },
            ],
        })

        expect(personalExpenseImpact(rounded, 'bea')?.neutralReason).toBe('no-balance-change')
    })

    it('preserves the invariant that one expense sums to zero across a large room', () => {
        const group = expense({
            baseAmountMinor: '6000',
            shares: [
                { memberId: 'ana', amountMinor: '2000', enteredAmountMinor: null, splitWeight: null },
                { memberId: 'bea', amountMinor: '2000', enteredAmountMinor: null, splitWeight: null },
                { memberId: 'cara', amountMinor: '2000', enteredAmountMinor: null, splitWeight: null },
            ],
        })
        const total = ['ana', 'bea', 'cara'].reduce(
            (sum, memberId) => sum + BigInt(personalExpenseImpact(group, memberId)?.signedMinor ?? '0'),
            0n
        )

        expect(total).toBe(0n)
    })

    it('does not invent an impact without an identity or for an optimistic row', () => {
        expect(personalExpenseImpact(expense(), undefined)).toBeNull()
        expect(personalExpenseImpact(expense({ id: 'pending-save-1' }), 'ana')).toBeNull()
    })
})
