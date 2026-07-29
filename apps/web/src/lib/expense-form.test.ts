import { describe, expect, it } from 'vitest'
import type { ApiExpense } from './api-types'
import {
    buildExpenseBody,
    emptyExpenseForm,
    expenseToFormValues,
    remainingMinor,
    repairMisplacedExpenseFields,
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
    reactions: [],
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

    it('prefills editable amounts with the active locale separator', () => {
        const values = expenseToFormValues(foreignExactExpense, undefined, 'pt-BR')
        expect(values.amountInput).toBe('100,00')
        expect(values.exactInputs).toEqual({ m1: '65,00', m2: '35,00' })
        expect(buildExpenseBody(values, undefined, 'pt-BR').amountMinor).toBe('10000')
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
    participantsTouched: true,
    exactInputs: {},
    exactTouched: true,
    date: '2026-07-25T12:00:00.000Z',
    ...overrides,
})

describe('exactTouched — who has earned the celebration', () => {
    it('starts false on a new expense and true on one being edited', () => {
        const fresh = emptyExpenseForm({
            currency: 'EUR',
            members: [{ id: 'm1', name: 'Ana', avatar: null, createdAt: '2026-07-25T12:00:00.000Z' }],
            paidById: 'm1',
        })
        expect(fresh.exactTouched).toBe(false)
        // A saved EXACT expense could not have been saved unallocated, so reopening
        // it opens reconciled rather than asking for work that is already done.
        expect(expenseToFormValues(foreignExactExpense).exactTouched).toBe(true)
    })

    it('is display state only — it never changes what gets posted', () => {
        const allocated = baseForm({ splitMode: 'EXACT', exactInputs: { m1: '30.00', m2: '30.00' } })
        expect(validateExpenseForm(allocated)).toBeNull()
        expect(buildExpenseBody({ ...allocated, exactTouched: false })).toEqual(buildExpenseBody(allocated))
    })
})

describe('untouched participants mean "everyone at save time"', () => {
    it('omits participantIds until the user deliberately edits the set', () => {
        const untouched = baseForm({ participantsTouched: false })
        expect(validateExpenseForm(untouched)).toBeNull()
        expect('participantIds' in buildExpenseBody(untouched)).toBe(false)
        // A deliberate selection is sent verbatim.
        expect(buildExpenseBody(baseForm())).toMatchObject({ participantIds: ['m1', 'm2', 'm3'] })
    })
})

describe('validateExpenseForm / remainingMinor', () => {
    it('rejects an empty description, a zero amount and an empty participant list', () => {
        expect(validateExpenseForm(baseForm({ description: '  ' }))).toBe('DESCRIPTION_REQUIRED')
        expect(validateExpenseForm(baseForm({ amountInput: '0' }))).toBe('AMOUNT_REQUIRED')
        expect(validateExpenseForm(baseForm({ amountInput: '' }))).toBe('AMOUNT_REQUIRED')
        // The composer reads top-to-bottom: an entirely fresh form points at
        // the hero amount before asking for the receipt line beneath it.
        expect(validateExpenseForm(baseForm({ amountInput: '', description: '' }))).toBe('AMOUNT_REQUIRED')
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

    it.each([
        ['en', '1,234', '123400'],
        ['es', '1.234', '123400'],
        ['pt-BR', '1.234', '123400'],
    ])('builds the grouped amount intended in %s', (locale, amountInput, amountMinor) => {
        const values = baseForm({ amountInput })
        expect(validateExpenseForm(values, undefined, locale)).toBeNull()
        expect(buildExpenseBody(values, undefined, locale).amountMinor).toBe(amountMinor)
    })

    it.each([
        ['en', '12.345'],
        ['es', '12,345'],
        ['pt-BR', '12,345'],
    ])('rejects an over-precise amount in %s rather than silently rounding it', (locale, amountInput) => {
        const values = baseForm({ amountInput })
        expect(validateExpenseForm(values, undefined, locale)).toBe('AMOUNT_INVALID')
        expect(() => buildExpenseBody(values, undefined, locale)).toThrow(/AMOUNT_INVALID/)
    })

    it.each([
        ['en', '0.001'],
        ['es', '0,001'],
        ['pt-BR', '0,001'],
    ])('rejects an invalid exact share in %s rather than silently dropping it', (locale, invalidShare) => {
        const values = baseForm({
            splitMode: 'EXACT',
            exactInputs: { m1: '30', m2: '30', m3: invalidShare },
        })
        expect(validateExpenseForm(values, undefined, locale)).toBe('SHARE_AMOUNT_INVALID')
        expect(() => buildExpenseBody(values, undefined, locale)).toThrow(/SHARE_AMOUNT_INVALID/)
    })

    it.each([
        ['JPY', 'en', '4,500'],
        ['JPY', 'es', '4.500'],
        ['JPY', 'pt-BR', '4.500'],
        ['COP', 'en', '4,500'],
        ['COP', 'es', '4.500'],
        ['COP', 'pt-BR', '4.500'],
    ])('preserves grouped %s units in %s', (currency, locale, amountInput) => {
        const values = baseForm({ currency, amountInput })
        expect(validateExpenseForm(values, undefined, locale)).toBeNull()
        expect(buildExpenseBody(values, undefined, locale).amountMinor).toBe('4500')
    })
})

describe('repairMisplacedExpenseFields', () => {
    it('preserves an inverted amount and description by swapping their roles', () => {
        expect(repairMisplacedExpenseFields(baseForm({ amountInput: 'Taxi', description: '123' }))).toMatchObject({
            amountInput: '123',
            description: 'Taxi',
        })
    })

    it('does not disguise invalid numeric punctuation as a swapped description', () => {
        expect(
            repairMisplacedExpenseFields(baseForm({ amountInput: '12.345', description: '60' }), undefined, 'en')
        ).toBeNull()
    })

    it('recognises the same decimal formats as the real amount field', () => {
        expect(
            repairMisplacedExpenseFields(baseForm({ amountInput: 'Dinner', description: '1.234,56' }))
        ).toMatchObject({
            amountInput: '1.234,56',
            description: 'Dinner',
        })
    })

    it('does not guess when the pair is incomplete or the current amount is already valid', () => {
        expect(repairMisplacedExpenseFields(baseForm({ amountInput: '', description: '123' }))).toBeNull()
        expect(repairMisplacedExpenseFields(baseForm({ amountInput: '12', description: '123' }))).toBeNull()
        expect(repairMisplacedExpenseFields(baseForm({ amountInput: 'Taxi', description: '' }))).toBeNull()
        expect(repairMisplacedExpenseFields(baseForm({ amountInput: 'Taxi', description: 'Room 123' }))).toBeNull()
    })

    it('does not move zero into the amount field', () => {
        expect(repairMisplacedExpenseFields(baseForm({ amountInput: 'Taxi', description: '0' }))).toBeNull()
    })
})
