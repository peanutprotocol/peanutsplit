/**
 * The handoff: a draft plus the form as it stands → the form as it should stand.
 *
 * This is the only part of quick add that can produce a wrong number on the
 * client, so it is the part that is a pure function with a test. Everything else
 * the feature does — a chip, a textarea, a fetch — is arrangement.
 *
 * The through-line of every case below: a null field means "the text did not
 * say", and what the form already had survives. That is what makes the sheet
 * safe to use halfway through filling a form in by hand.
 */
import { describe, expect, it } from 'vitest'
import { emptyExpenseForm, type ExpenseFormValues } from '@/lib/expense-form'
import { draftToFormValues, type NlDraft } from '@/lib/quick-add'

const MEMBERS = [
    { id: 'm-ana', name: 'Ana', createdAt: '2026-07-01T00:00:00.000Z' },
    { id: 'm-bob', name: 'Bob', createdAt: '2026-07-01T00:00:00.000Z' },
    { id: 'm-cleo', name: 'Cleo', createdAt: '2026-07-01T00:00:00.000Z' },
]

const base = (over: Partial<ExpenseFormValues> = {}): ExpenseFormValues => ({
    ...emptyExpenseForm({ currency: 'EUR', members: MEMBERS, paidById: 'm-ana' }),
    date: '2026-07-28T19:30:00.000Z',
    ...over,
})

const draft = (over: Partial<NlDraft> = {}): NlDraft => ({
    description: 'cena',
    amountMinor: '4500',
    currency: null,
    date: null,
    paidById: null,
    participantIds: null,
    ...over,
})

const apply = (d: NlDraft, b = base()) => draftToFormValues(d, { base: b, roomCurrency: 'EUR' })

describe('draftToFormValues', () => {
    it('fills the form from a draft that said everything', () => {
        const values = apply(
            draft({ currency: 'THB', date: '2026-07-26', paidById: 'm-bob', participantIds: ['m-bob', 'm-cleo'] })
        )

        expect(values.description).toBe('cena')
        expect(values.amountInput).toBe('45.00')
        expect(values.currency).toBe('THB')
        expect(values.paidById).toBe('m-bob')
        expect(values.participantIds).toEqual(['m-bob', 'm-cleo'])
        expect(values.participantsTouched).toBe(true)
        expect(values.splitMode).toBe('EQUAL')
        // The stated day, with the time of day kept so same-day ordering survives.
        expect(values.date.startsWith('2026-07-26')).toBe(true)
    })

    it('keeps what the form already had for everything the text did not say', () => {
        const before = base({ description: 'typed by hand', paidById: 'm-cleo' })
        const values = apply(draft({ description: null }), before)

        expect(values.description).toBe('typed by hand')
        expect(values.currency).toBe('EUR')
        expect(values.paidById).toBe('m-cleo')
        expect(values.date).toBe(before.date)
    })

    it('leaves "everyone" as intent rather than as a snapshot of the roster', () => {
        // `participantsTouched: false` is what makes the save body omit
        // `participantIds` — so the SERVER splits among everyone at save time and
        // a friend who joined the room three seconds ago is still in the round.
        const values = apply(draft({ participantIds: null }))
        expect(values.participantsTouched).toBe(false)
        expect(values.participantIds).toEqual(['m-ana', 'm-bob', 'm-cleo'])
    })

    it('falls back to the room currency, and formats the amount in ITS decimals', () => {
        // The trap: `amountMinor` is minor units of whatever currency ends up on
        // the form. A zero-decimal room must not render 4500 as "45.00".
        expect(draftToFormValues(draft(), { base: base({ currency: 'JPY' }), roomCurrency: 'JPY' }).amountInput).toBe(
            '4500'
        )
        expect(apply(draft({ currency: 'JPY' })).currency).toBe('JPY')
    })

    it('always lands in EQUAL, and clears an EXACT allocation on the way', () => {
        // A sentence names people; it never says who owes how much. Landing in
        // EXACT with the shares guessed would be the model dividing money, and
        // carrying the old allocation forward would leave the form unsaveable
        // for a reason nothing on screen explains.
        const before = base({ splitMode: 'EXACT', exactInputs: { 'm-ana': '10.00', 'm-bob': '10.00' } })
        const values = apply(draft(), before)

        expect(values.splitMode).toBe('EQUAL')
        expect(values.exactInputs).toEqual({})
    })

    it('produces a form the ordinary validator accepts, which is the whole point', async () => {
        const { validateExpenseForm } = await import('@/lib/expense-form')
        expect(validateExpenseForm(apply(draft()))).toBeNull()
        expect(validateExpenseForm(apply(draft({ participantIds: ['m-bob'] })))).toBeNull()
    })
})
