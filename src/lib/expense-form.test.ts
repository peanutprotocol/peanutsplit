import { describe, expect, it } from 'vitest'
import type { ApiExpense } from './api-types'
import {
    buildExpenseBody,
    expenseToFormValues,
    remainingMinor,
    validateExpenseForm,
    type ExpenseFormValues,
} from './expense-form'

/**
 * A CHF expense in a EUR room, split EXACT. `enteredAmountMinor` is what was
 * typed (CHF); `amountMinor` is the post-FX EUR slice with the rounding residue
 * dumped on the largest share. Prefilling from the latter is THE drift bug.
 */
const foreignExactExpense: ApiExpense = {
    id: 'e1',
    description: 'Lift passes',
    amountMinor: '10000', // CHF 100.00
    currency: 'CHF',
    baseAmountMinor: '8929', // EUR 89.29 at 0.892857…
    fxRate: '0.892857142857',
    splitMode: 'EXACT',
    paidById: 'm1',
    createdById: 'm1',
    date: '2026-07-20T10:00:00.000Z',
    category: null,
    createdAt: '2026-07-20T10:00:00.000Z',
    shares: [
        { memberId: 'm1', amountMinor: '5804', enteredAmountMinor: '6500' },
        { memberId: 'm2', amountMinor: '3125', enteredAmountMinor: '3500' },
    ],
}

describe('expenseToFormValues — the no-drift path', () => {
    it('prefills EXACT shares from enteredAmountMinor, never from the post-FX amountMinor', () => {
        const values = expenseToFormValues(foreignExactExpense)
        expect(values.exactInputs).toEqual({ m1: '65.00', m2: '35.00' })
        expect(values.amountInput).toBe('100.00')
        expect(values.currency).toBe('CHF')
    })

    it('re-saving an untouched foreign EXACT expense reproduces the original body byte for byte', () => {
        const body = buildExpenseBody(expenseToFormValues(foreignExactExpense))
        expect(body).toEqual({
            description: 'Lift passes',
            amountMinor: '10000',
            currency: 'CHF',
            paidById: 'm1',
            date: '2026-07-20T10:00:00.000Z',
            splitMode: 'EXACT',
            exactShares: [
                { memberId: 'm1', amountMinor: '6500' },
                { memberId: 'm2', amountMinor: '3500' },
            ],
        })
        // The shares add up to the expense total in the EXPENSE currency — the
        // invariant the server enforces. Room-currency values would not.
        expect(BigInt(body.exactShares![0].amountMinor) + BigInt(body.exactShares![1].amountMinor)).toBe(
            BigInt(body.amountMinor)
        )
    })

    it('round-trips repeatedly without walking the numbers', () => {
        let values = expenseToFormValues(foreignExactExpense)
        for (let i = 0; i < 5; i++) {
            const body = buildExpenseBody(values)
            values = expenseToFormValues({
                ...foreignExactExpense,
                amountMinor: body.amountMinor,
                shares: body.exactShares!.map((share) => ({
                    memberId: share.memberId,
                    // Server would recompute this; the point is the entered value survives.
                    amountMinor: '1',
                    enteredAmountMinor: share.amountMinor,
                })),
            })
        }
        expect(values.exactInputs).toEqual({ m1: '65.00', m2: '35.00' })
    })

    it('falls back to amountMinor only when enteredAmountMinor is absent', () => {
        const values = expenseToFormValues({
            ...foreignExactExpense,
            shares: [{ memberId: 'm1', amountMinor: '10000', enteredAmountMinor: null }],
        })
        expect(values.exactInputs).toEqual({ m1: '100.00' })
    })

    it('handles zero-decimal currencies', () => {
        const values = expenseToFormValues({
            ...foreignExactExpense,
            currency: 'JPY',
            amountMinor: '4500',
            shares: [
                { memberId: 'm1', amountMinor: '20', enteredAmountMinor: '2500' },
                { memberId: 'm2', amountMinor: '16', enteredAmountMinor: '2000' },
            ],
        })
        expect(values.exactInputs).toEqual({ m1: '2500', m2: '2000' })
        expect(values.amountInput).toBe('4500')
        expect(buildExpenseBody(values).exactShares).toEqual([
            { memberId: 'm1', amountMinor: '2500' },
            { memberId: 'm2', amountMinor: '2000' },
        ])
    })

    it('prefills EQUAL participants from the share list', () => {
        const values = expenseToFormValues({
            ...foreignExactExpense,
            splitMode: 'EQUAL',
            shares: [
                { memberId: 'm1', amountMinor: '4465', enteredAmountMinor: null },
                { memberId: 'm2', amountMinor: '4464', enteredAmountMinor: null },
            ],
        })
        expect(values.participantIds).toEqual(['m1', 'm2'])
        expect(values.exactInputs).toEqual({})
        expect(buildExpenseBody(values)).toMatchObject({ splitMode: 'EQUAL', participantIds: ['m1', 'm2'] })
    })
})

const baseForm = (overrides: Partial<ExpenseFormValues> = {}): ExpenseFormValues => ({
    description: 'Dinner',
    amountInput: '60.00',
    currency: 'EUR',
    paidById: 'm1',
    splitMode: 'EQUAL',
    participantIds: ['m1', 'm2', 'm3'],
    exactInputs: {},
    date: '2026-07-25T12:00:00.000Z',
    ...overrides,
})

describe('validateExpenseForm / remainingMinor', () => {
    it('rejects an empty description, a zero amount and an empty participant list', () => {
        expect(validateExpenseForm(baseForm({ description: '  ' }))).toBe('DESCRIPTION_REQUIRED')
        expect(validateExpenseForm(baseForm({ amountInput: '0' }))).toBe('AMOUNT_REQUIRED')
        expect(validateExpenseForm(baseForm({ amountInput: '' }))).toBe('AMOUNT_REQUIRED')
        expect(validateExpenseForm(baseForm({ participantIds: [] }))).toBe('NO_PARTICIPANTS')
    })

    it('holds an EXACT split to the exact total', () => {
        const short = baseForm({ splitMode: 'EXACT', exactInputs: { m1: '20.00', m2: '20.00' } })
        expect(validateExpenseForm(short)).toBe('SHARES_DO_NOT_ADD_UP')
        expect(remainingMinor(short)).toBe('2000')

        const exact = baseForm({ splitMode: 'EXACT', exactInputs: { m1: '20.00', m2: '20.00', m3: '20.00' } })
        expect(validateExpenseForm(exact)).toBeNull()
        expect(remainingMinor(exact)).toBe('0')

        const over = baseForm({ splitMode: 'EXACT', exactInputs: { m1: '50.00', m2: '20.00' } })
        expect(remainingMinor(over)).toBe('-1000')
    })

    it('refuses to build a body from an invalid form rather than posting a broken split', () => {
        expect(() => buildExpenseBody(baseForm({ splitMode: 'EXACT', exactInputs: { m1: '10.00' } }))).toThrow(
            /SHARES_DO_NOT_ADD_UP/
        )
    })

    it('drops blank EXACT rows instead of posting zero shares', () => {
        const values = baseForm({
            splitMode: 'EXACT',
            exactInputs: { m1: '30.00', m2: '30.00', m3: '' },
        })
        expect(validateExpenseForm(values)).toBeNull()
        expect(buildExpenseBody(values).exactShares).toEqual([
            { memberId: 'm1', amountMinor: '3000' },
            { memberId: 'm2', amountMinor: '3000' },
        ])
    })
})
