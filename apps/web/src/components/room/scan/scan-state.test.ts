/**
 * The scan flow's arithmetic and its reducer.
 *
 * The property at the bottom of this file is the one that matters: for any
 * items, any amounts and any assignment, the sum of what everyone owes equals
 * the sum of the items they were assigned. Everything above it is a worked case
 * of the same claim, kept because a named failure is easier to fix than a
 * shrunken random one.
 */
import { describe, expect, it } from 'vitest'
import { emptyExpenseForm } from '@/lib/expense-form'
import { addMinor } from '@/lib/money'
import {
    assignedTotalMinor,
    initScanState,
    invalidAmountItems,
    itemsTotalMinor,
    memberTotals,
    mintItemId,
    scanReducer,
    toExpenseFormValues,
    unassignedItems,
    totalMismatchMinor,
    type ScanItem,
    type ScanState,
} from './scan-state'

const CENTS = 2

const item = (label: string, amountInput: string): ScanItem => ({
    id: mintItemId(),
    label,
    amountInput,
    quantity: null,
})

const stateOf = (items: ScanItem[], assignments: Record<string, string[]> = {}): ScanState => ({
    items,
    assignments,
    receiptTotalMinor: null,
    currency: 'EUR',
    merchant: null,
    date: null,
})

describe('item totals', () => {
    it('adds the items up in minor units, accepting either decimal separator', () => {
        const state = stateOf([item('Pizza', '12.50'), item('Beer', '3,80')])
        expect(itemsTotalMinor(state, CENTS)).toBe('1630')
    })

    it('treats a blank or unreadable amount as zero rather than refusing to total', () => {
        const state = stateOf([item('Pizza', '12.50'), item('?', ''), item('??', 'twelve')])
        expect(itemsTotalMinor(state, CENTS)).toBe('1250')
    })

    it('honours a zero-decimal currency', () => {
        const state = stateOf([item('Ramen', '980'), item('Gyoza', '450')])
        expect(itemsTotalMinor(state, 0)).toBe('1430')
    })

    it.each([
        ['en', '1,234'],
        ['es', '1.234'],
        ['pt-BR', '1.234'],
    ])('preserves locale grouping in receipt rows for %s', (locale, amountInput) => {
        const state = stateOf([item('Group dinner', amountInput)])
        expect(itemsTotalMinor(state, CENTS, locale)).toBe('123400')
        expect(invalidAmountItems(state, CENTS, locale)).toEqual([])
    })

    it.each([
        ['en', '12.345'],
        ['es', '12,345'],
        ['pt-BR', '12,345'],
    ])('flags excess precision in %s instead of dropping or rounding the row', (locale, amountInput) => {
        const bad = item('Unreadable total', amountInput)
        const state = stateOf([bad])
        expect(invalidAmountItems(state, CENTS, locale)).toEqual([bad])
    })
})

describe('memberTotals — one item, several people', () => {
    it('gives a solo item entirely to its one assignee', () => {
        const pizza = item('Pizza', '12.50')
        const state = stateOf([pizza], { [pizza.id]: ['ana'] })
        expect(memberTotals(state, CENTS)).toEqual({ ana: '1250' })
    })

    it('splits an even amount cleanly', () => {
        const wine = item('Wine', '30.00')
        const state = stateOf([wine], { [wine.id]: ['ana', 'bo', 'cy'] })
        expect(memberTotals(state, CENTS)).toEqual({ ana: '1000', bo: '1000', cy: '1000' })
    })

    it('walks an odd remainder down the assignee list one unit at a time', () => {
        // 10.00 between three is 3.34 / 3.33 / 3.33 — the same rule the server
        // applies to an EQUAL split, so a scanned bill and a typed one round the
        // same way.
        const wine = item('Wine', '10.00')
        const state = stateOf([wine], { [wine.id]: ['ana', 'bo', 'cy'] })
        expect(memberTotals(state, CENTS)).toEqual({ ana: '334', bo: '333', cy: '333' })
    })

    it('never invents or loses a cent, whoever is first', () => {
        const wine = item('Wine', '10.00')
        const forward = memberTotals(stateOf([wine], { [wine.id]: ['ana', 'bo', 'cy'] }), CENTS)
        const reversed = memberTotals(stateOf([wine], { [wine.id]: ['cy', 'bo', 'ana'] }), CENTS)
        expect(addMinor(Object.values(forward))).toBe('1000')
        expect(addMinor(Object.values(reversed))).toBe('1000')
        // The remainder follows the tap order, which is the only ordering the
        // user can see — and it is a cent.
        expect(reversed).toEqual({ cy: '334', bo: '333', ana: '333' })
    })

    it('leaves an unassigned item out of everyone’s total', () => {
        const pizza = item('Pizza', '12.50')
        const mystery = item('?', '9.99')
        const state = stateOf([pizza, mystery], { [pizza.id]: ['ana'] })
        expect(memberTotals(state, CENTS)).toEqual({ ana: '1250' })
        expect(assignedTotalMinor(state, CENTS)).toBe('1250')
        expect(itemsTotalMinor(state, CENTS)).toBe('2249')
    })

    it('omits a member whose every item was free', () => {
        const water = item('Tap water', '0')
        const state = stateOf([water], { [water.id]: ['ana', 'bo'] })
        expect(memberTotals(state, CENTS)).toEqual({})
    })
})

describe('unassignedItems — the submit gate', () => {
    it('counts only items that carry money', () => {
        const pizza = item('Pizza', '12.50')
        const water = item('Tap water', '0')
        const blank = item('', '')
        const state = stateOf([pizza, water, blank])
        expect(unassignedItems(state, CENTS)).toEqual([pizza])
    })

    it('empties once everything with an amount has someone on it', () => {
        const pizza = item('Pizza', '12.50')
        const state = stateOf([pizza], { [pizza.id]: ['ana'] })
        expect(unassignedItems(state, CENTS)).toEqual([])
    })
})

describe('totalMismatchMinor', () => {
    it('is null when the receipt carried no total to disagree with', () => {
        expect(totalMismatchMinor(stateOf([item('A', '1.00')]), CENTS)).toBeNull()
    })

    it('reports the signed gap between the printed total and the items', () => {
        const base = stateOf([item('A', '10.00'), item('B', '5.00')])
        expect(totalMismatchMinor({ ...base, receiptTotalMinor: '1500' }, CENTS)).toBe('0')
        // A line the model missed: the receipt is bigger than the items.
        expect(totalMismatchMinor({ ...base, receiptTotalMinor: '1800' }, CENTS)).toBe('300')
        // A line it read twice.
        expect(totalMismatchMinor({ ...base, receiptTotalMinor: '1200' }, CENTS)).toBe('-300')
    })
})

describe('scanReducer', () => {
    const pizza = item('Pizza', '12.50')
    const beer = item('Beer', '3.80')
    const base = stateOf([pizza, beer], { [pizza.id]: ['ana'] })

    it('edits a label and an amount in place', () => {
        const labelled = scanReducer(base, { type: 'edit-label', itemId: beer.id, label: 'Two beers' })
        expect(labelled.items[1].label).toBe('Two beers')
        const priced = scanReducer(labelled, { type: 'edit-amount', itemId: beer.id, amountInput: '7.60' })
        expect(itemsTotalMinor(priced, CENTS)).toBe('2010')
    })

    it('takes the assignment with the item when a row is removed', () => {
        const next = scanReducer(base, { type: 'remove-item', itemId: pizza.id })
        expect(next.items).toEqual([beer])
        expect(next.assignments[pizza.id]).toBeUndefined()
        expect(memberTotals(next, CENTS)).toEqual({})
    })

    it('appends a blank row for a missed item', () => {
        const next = scanReducer(base, { type: 'add-item' })
        expect(next.items).toHaveLength(3)
        expect(next.items[2]).toMatchObject({ label: '', amountInput: '', quantity: null })
        // Blank rows carry no money, so they cannot block the submit.
        expect(unassignedItems(next, CENTS)).toEqual([beer])
    })

    it('toggles an assignee on and back off', () => {
        const on = scanReducer(base, { type: 'toggle-assignee', itemId: beer.id, memberId: 'bo' })
        expect(on.assignments[beer.id]).toEqual(['bo'])
        const off = scanReducer(on, { type: 'toggle-assignee', itemId: beer.id, memberId: 'bo' })
        expect(off.assignments[beer.id]).toEqual([])
    })

    it('assigns everyone, and clears the row when everyone is already on it', () => {
        const memberIds = ['ana', 'bo', 'cy']
        const all = scanReducer(base, { type: 'assign-everyone', itemId: beer.id, memberIds })
        expect(all.assignments[beer.id]).toEqual(memberIds)
        const cleared = scanReducer(all, { type: 'assign-everyone', itemId: beer.id, memberIds })
        expect(cleared.assignments[beer.id]).toEqual([])
    })

    it('clears a row explicitly', () => {
        const next = scanReducer(base, { type: 'clear-assignees', itemId: pizza.id })
        expect(next.assignments[pizza.id]).toEqual([])
    })

    it('replaces everything on a reset', () => {
        const fresh = stateOf([item('Coffee', '2.50')])
        expect(scanReducer(base, { type: 'reset', state: fresh })).toBe(fresh)
    })
})

describe('initScanState', () => {
    it('turns a parsed receipt into editable rows and falls back to the room currency', () => {
        const state = initScanState(
            {
                items: [
                    { label: 'Pizza', amountMinor: '1250', quantity: 2 },
                    { label: 'Beer', amountMinor: '380', quantity: null },
                ],
                receiptTotalMinor: '1630',
                currency: null,
                merchant: 'Da Nino',
                date: '2026-07-15',
            },
            { fallbackCurrency: 'EUR', toInput: (minor) => (Number(minor) / 100).toFixed(2) }
        )
        expect(state.currency).toBe('EUR')
        expect(state.items.map((i) => i.amountInput)).toEqual(['12.50', '3.80'])
        expect(state.items[0].quantity).toBe(2)
        expect(state.assignments).toEqual({})
        expect(itemsTotalMinor(state, CENTS)).toBe('1630')
    })

    it('prefers the currency the receipt was printed in', () => {
        const state = initScanState(
            {
                items: [{ label: 'Ramen', amountMinor: '980', quantity: null }],
                receiptTotalMinor: null,
                currency: 'JPY',
                merchant: null,
                date: null,
            },
            { fallbackCurrency: 'EUR', toInput: (minor) => minor }
        )
        expect(state.currency).toBe('JPY')
    })
})

describe('toExpenseFormValues — the handoff', () => {
    const members = [
        { id: 'ana', name: 'Ana', avatar: null, createdAt: '' },
        { id: 'bo', name: 'Bo', avatar: null, createdAt: '' },
    ]
    const base = emptyExpenseForm({ currency: 'EUR', members, paidById: 'ana' })

    it('produces an EXACT form whose shares add up to its own total', () => {
        const pizza = item('Pizza', '12.50')
        const wine = item('Wine', '10.00')
        const state = {
            ...stateOf([pizza, wine], { [pizza.id]: ['ana'], [wine.id]: ['ana', 'bo'] }),
            merchant: 'Da Nino',
            date: '2026-07-15',
        }

        const values = toExpenseFormValues(state, { base, decimals: CENTS, fallbackDescription: 'Scanned bill' })

        expect(values.splitMode).toBe('EXACT')
        expect(values.description).toBe('Da Nino')
        expect(values.currency).toBe('EUR')
        expect(values.amountInput).toBe('22.50')
        expect(values.exactInputs).toEqual({ ana: '17.50', bo: '5.00' })
        expect(values.participantsTouched).toBe(true)
        expect(values.participantIds.sort()).toEqual(['ana', 'bo'])
        expect(values.date.slice(0, 10)).toBe('2026-07-15')
        // The payer the user already picked survives the scan.
        expect(values.paidById).toBe('ana')
    })

    it('hands a Brazilian Portuguese draft back with comma-decimal editable values', () => {
        const pizza = item('Pizza', '12,50')
        const state = stateOf([pizza], { [pizza.id]: ['ana', 'bo'] })
        const values = toExpenseFormValues(state, {
            base,
            decimals: CENTS,
            fallbackDescription: 'Conta escaneada',
            locale: 'pt-BR',
        })
        expect(values.amountInput).toBe('12,50')
        expect(values.exactInputs).toEqual({ ana: '6,25', bo: '6,25' })
    })

    it('falls back to a generic description and today when the receipt said neither', () => {
        const pizza = item('Pizza', '12.50')
        const state = stateOf([pizza], { [pizza.id]: ['ana'] })
        const values = toExpenseFormValues(state, { base, decimals: CENTS, fallbackDescription: 'Scanned bill' })
        expect(values.description).toBe('Scanned bill')
        expect(values.date).toBe(base.date)
    })

    it('totals only the assigned items, so the form arrives reconciled', () => {
        const pizza = item('Pizza', '12.50')
        const orphan = item('Mystery', '9.99')
        const state = stateOf([pizza, orphan], { [pizza.id]: ['ana'] })
        const values = toExpenseFormValues(state, { base, decimals: CENTS, fallbackDescription: 'Scanned bill' })
        expect(values.amountInput).toBe('12.50')
        expect(values.exactInputs).toEqual({ ana: '12.50' })
    })

    /**
     * Deleting a line the model invented is the whole point of the review and
     * assign screens, and the thing that must survive it is the reconciliation:
     * the draft's total is defined as the sum of what is left, never as the total
     * printed on the receipt. `validateExpenseForm` demands the exact shares add
     * up to the amount, so a total that outlived a deleted row would wedge the
     * drawer on a form the user cannot fix.
     */
    it('re-totals from the surviving rows when a wrongly-read item is removed', () => {
        const pizza = item('Pizza', '12.50')
        const ghost = item('LOYALTY CARD 1234', '9.90')
        const state = {
            ...stateOf([pizza, ghost], { [pizza.id]: ['ana', 'bo'], [ghost.id]: ['bo'] }),
            // The printed total still says 22.40. It is a hint, never a gate — the
            // draft follows the rows that are left.
            receiptTotalMinor: '2240',
        }

        const pruned = scanReducer(state, { type: 'remove-item', itemId: ghost.id })
        const values = toExpenseFormValues(pruned, { base, decimals: CENTS, fallbackDescription: 'Scanned bill' })

        expect(itemsTotalMinor(pruned, CENTS)).toBe('1250')
        expect(values.amountInput).toBe('12.50')
        expect(values.exactInputs).toEqual({ ana: '6.25', bo: '6.25' })
        // Nobody is left holding a share of a row that no longer exists.
        expect(values.participantIds.sort()).toEqual(['ana', 'bo'])
        // And the mismatch is information, not an error state to recover from.
        expect(totalMismatchMinor(pruned, CENTS)).toBe('990')
    })

    it('leaves an empty, unsubmittable draft when every row is deleted', () => {
        const pizza = item('Pizza', '12.50')
        let state: ScanState = stateOf([pizza], { [pizza.id]: ['ana'] })
        state = scanReducer(state, { type: 'remove-item', itemId: pizza.id })

        expect(state.items).toEqual([])
        expect(assignedTotalMinor(state, CENTS)).toBe('0')
        expect(unassignedItems(state, CENTS)).toEqual([])
        const values = toExpenseFormValues(state, { base, decimals: CENTS, fallbackDescription: 'Scanned bill' })
        expect(values.amountInput).toBe('0.00')
        expect(values.exactInputs).toEqual({})
    })
})

describe('the invariant: cents neither appear nor vanish', () => {
    /** A tiny deterministic PRNG — a seeded run reproduces exactly, which a
     *  failure in CI is worthless without. */
    function rng(seed: number): () => number {
        let value = seed >>> 0
        return () => {
            value = (value * 1664525 + 1013904223) >>> 0
            return value / 0x100000000
        }
    }

    const MEMBERS = ['ana', 'bo', 'cy', 'di', 'ed']

    it('holds over 500 random receipts and assignments', () => {
        for (let seed = 1; seed <= 500; seed++) {
            const random = rng(seed)
            const decimals = random() < 0.2 ? 0 : 2
            const itemCount = 1 + Math.floor(random() * 12)

            const items: ScanItem[] = []
            const assignments: Record<string, string[]> = {}
            for (let i = 0; i < itemCount; i++) {
                const minor = Math.floor(random() * 100_000)
                const next = item(`Item ${i}`, decimals === 0 ? String(minor) : (minor / 100).toFixed(2))
                items.push(next)
                // Some rows deliberately get nobody — an unassigned item must
                // simply not participate, never skew what everyone else owes.
                const assignees = MEMBERS.filter(() => random() < 0.45)
                if (assignees.length > 0) assignments[next.id] = assignees
            }

            const state = stateOf(items, assignments)
            const totals = memberTotals(state, decimals)
            expect(addMinor(Object.values(totals))).toBe(assignedTotalMinor(state, decimals))

            // …and the form it hands over satisfies the same equality, which is
            // exactly what `validateExpenseForm` will demand of it.
            const values = toExpenseFormValues(state, {
                base: stateBase,
                decimals,
                fallbackDescription: 'Scanned bill',
            })
            const shares = Object.values(values.exactInputs).map((input) =>
                decimals === 0 ? input : String(Math.round(Number(input) * 100))
            )
            const expected = assignedTotalMinor(state, decimals)
            expect(addMinor(shares)).toBe(expected)
            expect(decimals === 0 ? values.amountInput : String(Math.round(Number(values.amountInput) * 100))).toBe(
                expected
            )
        }
    })

    const stateBase = emptyExpenseForm({
        currency: 'EUR',
        members: MEMBERS.map((id) => ({ id, name: id, avatar: null, createdAt: '' })),
        paidById: 'ana',
    })
})
