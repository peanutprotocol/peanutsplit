import { describe, expect, it } from 'vitest'
import type { ApiExpense } from './api-types'
import {
    buildExpenseBody,
    emptyExpenseForm,
    exactParticipantIds,
    exactShareEntries,
    expenseToFormValues,
    hasUnreadablePercentage,
    hasUnreadableShareWeight,
    hasUnreadableShare,
    percentageRemainingBasisPoints,
    percentageShareEntries,
    remainingMinor,
    referencedDraftParticipantIds,
    repairMisplacedExpenseFields,
    validateExpenseForm,
    type ExpenseFormValues,
} from './expense-form'

describe('participant references kept visible during a live draft', () => {
    const draft = (overrides: Partial<ExpenseFormValues>): ExpenseFormValues => ({
        ...emptyExpenseForm({ currency: 'EUR', members: [], paidById: 'payer' }),
        ...overrides,
    })

    it('materialises only a deliberately touched EQUAL roster', () => {
        expect(referencedDraftParticipantIds(draft({ participantIds: ['a', 'b'] }))).toEqual([])
        expect(referencedDraftParticipantIds(draft({ participantIds: ['a', 'b'], participantsTouched: true }))).toEqual(
            ['a', 'b']
        )
    })

    it('preserves exact and weighted role ids without changing their money fields', () => {
        expect(referencedDraftParticipantIds(draft({ splitMode: 'EXACT', exactInputs: { a: '12.34' } }))).toEqual(['a'])
        expect(
            referencedDraftParticipantIds(draft({ splitMode: 'PERCENTAGE', percentageInputs: { a: '25', b: '75' } }))
        ).toEqual(['a', 'b'])
        expect(referencedDraftParticipantIds(draft({ splitMode: 'SHARES', shareInputs: { b: '3' } }))).toEqual(['b'])
    })
})

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
        { memberId: 'm1', amountMinor: '5804', enteredAmountMinor: '6500', splitWeight: null },
        { memberId: 'm2', amountMinor: '3125', enteredAmountMinor: '3500', splitWeight: null },
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
            category: null,
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
                    splitWeight: null,
                })),
            })
        }
        expect(values.exactInputs).toEqual({ m1: '65.00', m2: '35.00' })
    })

    it('falls back to amountMinor only when enteredAmountMinor is absent', () => {
        const values = expenseToFormValues({
            ...foreignExactExpense,
            shares: [{ memberId: 'm1', amountMinor: '10000', enteredAmountMinor: null, splitWeight: null }],
        })
        expect(values.exactInputs).toEqual({ m1: '100.00' })
    })

    it('handles zero-decimal currencies', () => {
        const values = expenseToFormValues({
            ...foreignExactExpense,
            currency: 'JPY',
            amountMinor: '4500',
            shares: [
                { memberId: 'm1', amountMinor: '20', enteredAmountMinor: '2500', splitWeight: null },
                { memberId: 'm2', amountMinor: '16', enteredAmountMinor: '2000', splitWeight: null },
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
                { memberId: 'm1', amountMinor: '4465', enteredAmountMinor: null, splitWeight: null },
                { memberId: 'm2', amountMinor: '4464', enteredAmountMinor: null, splitWeight: null },
            ],
        })
        expect(values.participantIds).toEqual(['m1', 'm2'])
        expect(values.exactInputs).toEqual({})
        expect(buildExpenseBody(values)).toMatchObject({ splitMode: 'EQUAL', participantIds: ['m1', 'm2'] })
    })
})

const baseForm = (overrides: Partial<ExpenseFormValues> = {}): ExpenseFormValues => ({
    description: 'Dinner',
    category: null,
    amountInput: '60.00',
    currency: 'EUR',
    paidById: 'm1',
    splitMode: 'EQUAL',
    participantIds: ['m1', 'm2', 'm3'],
    participantsTouched: true,
    exactInputs: {},
    exactTouched: true,
    percentageInputs: {},
    shareInputs: {},
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

describe('staged new payer', () => {
    it('posts a name instead of inventing a roster id before the expense is saved', () => {
        const values = baseForm({ paidById: '', newPaidByName: 'Bea', participantsTouched: false })
        expect(validateExpenseForm(values)).toBeNull()
        expect(buildExpenseBody(values)).toEqual({
            description: 'Dinner',
            category: null,
            amountMinor: '6000',
            currency: 'EUR',
            newPaidByName: 'Bea',
            date: '2026-07-25T12:00:00.000Z',
            splitMode: 'EQUAL',
        })
    })
})

describe('saved category override', () => {
    it('starts on automatic inference and persists a deliberate choice', () => {
        const fresh = emptyExpenseForm({
            currency: 'EUR',
            members: [{ id: 'm1', name: 'Ana', avatar: null, createdAt: '2026-07-25T12:00:00.000Z' }],
            paidById: 'm1',
        })
        expect(fresh.category).toBeNull()

        const body = buildExpenseBody(baseForm({ description: 'Pizza', category: 'transport' }))
        expect(body.category).toBe('transport')
    })

    it('round-trips an existing override through edit values, including clearing it', () => {
        const edited = expenseToFormValues({ ...foreignExactExpense, category: 'travel-stays' })
        expect(edited.category).toBe('travel-stays')
        expect(buildExpenseBody(edited).category).toBe('travel-stays')
        expect(buildExpenseBody({ ...edited, category: null }).category).toBeNull()
    })
})

describe('validateExpenseForm / remainingMinor', () => {
    it('rejects a zero amount and an empty participant list', () => {
        expect(validateExpenseForm(baseForm({ amountInput: '0' }))).toBe('AMOUNT_REQUIRED')
        expect(validateExpenseForm(baseForm({ amountInput: '' }))).toBe('AMOUNT_REQUIRED')
        // The composer reads top-to-bottom: an entirely fresh form points at
        // the hero amount, which is the only field it still insists on.
        expect(validateExpenseForm(baseForm({ amountInput: '', description: '' }))).toBe('AMOUNT_REQUIRED')
        expect(validateExpenseForm(baseForm({ participantIds: [] }))).toBe('NO_PARTICIPANTS')
    })

    it('accepts a nameless expense — the row is labelled by its day instead', () => {
        expect(validateExpenseForm(baseForm({ description: '' }))).toBeNull()
        expect(validateExpenseForm(baseForm({ description: '  ' }))).toBeNull()
        expect(buildExpenseBody(baseForm({ description: '  ' })).description).toBe('')
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

describe('hasUnreadableShare — what stops the readout going green early', () => {
    it('is true while a share holds a value the parser cannot read', () => {
        // A lone decimal mark is typeable on the way to ".50", and `allocatedMinor`
        // counts it as zero. So the shares below add up to the total and the readout
        // would have said "every cent allocated" while save refused the sheet.
        const values = baseForm({
            splitMode: 'EXACT',
            exactInputs: { m1: '30.00', m2: '30.00', m3: '.' },
        })
        expect(remainingMinor(values, undefined, 'en')).toBe('0')
        expect(hasUnreadableShare(values, undefined, 'en')).toBe(true)
        expect(validateExpenseForm(values, undefined, 'en')).toBe('SHARE_AMOUNT_INVALID')
    })

    it('ignores blank shares, which mean "not in this split" rather than a bad number', () => {
        const values = baseForm({
            splitMode: 'EXACT',
            exactInputs: { m1: '30.00', m2: '30.00', m3: '' },
        })
        expect(hasUnreadableShare(values, undefined, 'en')).toBe(false)
        expect(validateExpenseForm(values, undefined, 'en')).toBeNull()
    })

    it('reads each share in the currency of the expense', () => {
        // COP has no cents, so "30,5" is not a share in a COP room.
        const values = baseForm({ currency: 'COP', splitMode: 'EXACT', exactInputs: { m1: '30,5' } })
        expect(hasUnreadableShare(values, undefined, 'en')).toBe(true)
        expect(hasUnreadableShare({ ...values, currency: 'EUR' }, undefined, 'en')).toBe(false)
    })
})

/**
 * The composer says who a split is between; `buildExpenseBody` decides who it is
 * actually between. When those two read different predicates the sheet can claim
 * a three-way split and post a two-way one — money on the most-used screen — so
 * every case below asserts them together rather than one at a time.
 */
describe('who an EXACT split is between', () => {
    /** Ana 30 / Bea 60 / Cass blank against a 90.00 total: the shares reconcile,
     *  so nothing on screen contradicts a summary that counts Cass in. */
    const blankThird = baseForm({
        amountInput: '90.00',
        splitMode: 'EXACT',
        exactInputs: { m1: '30.00', m2: '60.00', m3: '' },
    })

    it('leaves a blank field out of the participant list, not just out of the body', () => {
        expect(validateExpenseForm(blankThird, undefined, 'en')).toBeNull()
        expect(exactParticipantIds(blankThird, undefined, 'en')).toEqual(['m1', 'm2'])
        expect(buildExpenseBody(blankThird, undefined, 'en').exactShares).toEqual([
            { memberId: 'm1', amountMinor: '3000' },
            { memberId: 'm2', amountMinor: '6000' },
        ])
    })

    it.each([
        ['a blank field', ''],
        ['a whitespace-only field', '   '],
        // A zero share is not a share: it would put someone on a split owing
        // nothing, which is what leaving them off already says.
        ['an explicit zero', '0'],
        ['a zero typed out in full', '0.00'],
    ])('does not count %s as a participant', (_case, input) => {
        const values = baseForm({
            amountInput: '90.00',
            splitMode: 'EXACT',
            exactInputs: { m1: '30.00', m2: '60.00', m3: input },
        })
        expect(exactParticipantIds(values, undefined, 'en')).toEqual(['m1', 'm2'])
        expect(hasUnreadableShare(values, undefined, 'en')).toBe(false)
        expect(validateExpenseForm(values, undefined, 'en')).toBeNull()
    })

    it('agrees with exactShareEntries member for member, whatever the fields hold', () => {
        const cases = [
            blankThird,
            baseForm({ amountInput: '90.00', splitMode: 'EXACT', exactInputs: { m1: '90.00', m2: '', m3: '  ' } }),
            baseForm({ amountInput: '90.00', splitMode: 'EXACT', exactInputs: { m1: '30.00', m2: '60.00', m3: '0' } }),
            baseForm({ amountInput: '90.00', splitMode: 'EXACT', exactInputs: { m1: '', m2: '', m3: '' } }),
            baseForm({ amountInput: '90.00', splitMode: 'EXACT', exactInputs: {} }),
        ]
        for (const values of cases) {
            expect(exactParticipantIds(values, undefined, 'en')).toEqual(
                exactShareEntries(values, undefined, 'en').map((share) => share.memberId)
            )
        }
    })

    it('refuses a split nobody is on rather than posting an empty one', () => {
        const nobody = baseForm({
            amountInput: '90.00',
            splitMode: 'EXACT',
            exactInputs: { m1: '', m2: '0', m3: '   ' },
        })
        expect(exactParticipantIds(nobody, undefined, 'en')).toEqual([])
        expect(validateExpenseForm(nobody, undefined, 'en')).toBe('NO_PARTICIPANTS')
    })

    it('keeps a normal two-of-three exact split whole', () => {
        const twoOfThree = baseForm({
            amountInput: '90.00',
            splitMode: 'EXACT',
            exactInputs: { m1: '45.00', m2: '45.00' },
        })
        expect(exactParticipantIds(twoOfThree, undefined, 'en')).toEqual(['m1', 'm2'])
        expect(remainingMinor(twoOfThree, undefined, 'en')).toBe('0')
        expect(validateExpenseForm(twoOfThree, undefined, 'en')).toBeNull()
        expect(buildExpenseBody(twoOfThree, undefined, 'en').exactShares).toEqual([
            { memberId: 'm1', amountMinor: '4500' },
            { memberId: 'm2', amountMinor: '4500' },
        ])
    })
})

describe('PERCENTAGE splits', () => {
    it('parses locale-aware two-decimal percentages as basis points and requires exactly 100%', () => {
        const values = baseForm({
            splitMode: 'PERCENTAGE',
            percentageInputs: { m1: '33,33', m2: '33,33', m3: '33,34' },
        })
        expect(percentageShareEntries(values, 'pt-BR')).toEqual([
            { memberId: 'm1', weight: '3333' },
            { memberId: 'm2', weight: '3333' },
            { memberId: 'm3', weight: '3334' },
        ])
        expect(percentageRemainingBasisPoints(values, 'pt-BR')).toBe('0')
        expect(validateExpenseForm(values, undefined, 'pt-BR')).toBeNull()
        expect(buildExpenseBody(values, undefined, 'pt-BR')).toMatchObject({
            splitMode: 'PERCENTAGE',
            weightedShares: [
                { memberId: 'm1', weight: '3333' },
                { memberId: 'm2', weight: '3333' },
                { memberId: 'm3', weight: '3334' },
            ],
        })
    })

    it.each([
        ['99.99', '1'],
        ['100.01', '-1'],
    ])('rejects a %s%% total', (input, remaining) => {
        const values = baseForm({ splitMode: 'PERCENTAGE', percentageInputs: { m1: input } })
        expect(percentageRemainingBasisPoints(values, 'en')).toBe(remaining)
        expect(validateExpenseForm(values, undefined, 'en')).toBe('PERCENTAGES_DO_NOT_ADD_UP')
    })

    it('excludes blank and zero rows', () => {
        const values = baseForm({
            splitMode: 'PERCENTAGE',
            percentageInputs: { m1: '100', m2: '', m3: '0.00' },
        })
        expect(validateExpenseForm(values, undefined, 'en')).toBeNull()
        expect(buildExpenseBody(values, undefined, 'en').weightedShares).toEqual([{ memberId: 'm1', weight: '10000' }])
    })

    it('rejects over-precision and weights outside the signed 64-bit boundary', () => {
        expect(
            hasUnreadablePercentage(baseForm({ splitMode: 'PERCENTAGE', percentageInputs: { m1: '33.333' } }), 'en')
        ).toBe(true)
        expect(
            hasUnreadablePercentage(
                baseForm({ splitMode: 'PERCENTAGE', percentageInputs: { m1: '92233720368547758.08' } }),
                'en'
            )
        ).toBe(true)
    })
})

describe('SHARES splits', () => {
    it('posts positive whole-number weights and excludes blank or zero rows', () => {
        const values = baseForm({ splitMode: 'SHARES', shareInputs: { m1: '2', m2: '1', m3: '0' } })
        expect(validateExpenseForm(values)).toBeNull()
        expect(buildExpenseBody(values)).toMatchObject({
            splitMode: 'SHARES',
            weightedShares: [
                { memberId: 'm1', weight: '2' },
                { memberId: 'm2', weight: '1' },
            ],
        })
    })

    it.each(['1.5', '-1', 'three', '9223372036854775808'])('rejects invalid share weight %s', (input) => {
        const values = baseForm({ splitMode: 'SHARES', shareInputs: { m1: input } })
        expect(hasUnreadableShareWeight(values)).toBe(true)
        expect(validateExpenseForm(values)).toBe('SHARE_WEIGHT_INVALID')
    })
})

describe('weighted edit round trips', () => {
    it.each([
        ['PERCENTAGE' as const, ['2500', '7500']],
        ['SHARES' as const, ['1', '3']],
    ])('restores %s from splitWeight, never the calculated amountMinor', (splitMode, weights) => {
        const expense: ApiExpense = {
            ...foreignExactExpense,
            splitMode,
            shares: [
                { memberId: 'm1', amountMinor: '1', enteredAmountMinor: null, splitWeight: weights[0] },
                { memberId: 'm2', amountMinor: '9999', enteredAmountMinor: null, splitWeight: weights[1] },
            ],
        }
        const values = expenseToFormValues(expense, undefined, 'en')
        if (splitMode === 'PERCENTAGE') expect(values.percentageInputs).toEqual({ m1: '25.00', m2: '75.00' })
        else expect(values.shareInputs).toEqual({ m1: '1', m2: '3' })
        expect(buildExpenseBody(values, undefined, 'en').weightedShares).toEqual([
            { memberId: 'm1', weight: weights[0] },
            { memberId: 'm2', weight: weights[1] },
        ])
    })
})

describe('a negative amount is its own mistake', () => {
    it.each([
        ['en', '-5'],
        ['en', '−5'],
        ['es', '-1.234,56'],
        ['pt-BR', '- 5,00'],
    ])('says so in %s instead of blaming the separators', (locale, amountInput) => {
        expect(validateExpenseForm(baseForm({ amountInput }), undefined, locale)).toBe('AMOUNT_NEGATIVE')
    })

    it('still blames the separators when that is the real problem', () => {
        expect(validateExpenseForm(baseForm({ amountInput: '12.345' }), undefined, 'en')).toBe('AMOUNT_INVALID')
        expect(validateExpenseForm(baseForm({ amountInput: '-taxi' }), undefined, 'en')).toBe('AMOUNT_INVALID')
        expect(validateExpenseForm(baseForm({ amountInput: '5-' }), undefined, 'en')).toBe('AMOUNT_INVALID')
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
