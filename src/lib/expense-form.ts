/**
 * The expense drawer's form model, and the two conversions around it.
 *
 * THE drift trap: an EXACT split in a foreign currency stores two numbers per
 * share — `enteredAmountMinor` (what was typed, in the expense currency) and
 * `amountMinor` (the post-FX room-currency slice, with the rounding residue
 * dumped on the largest share). Prefilling an edit from `amountMinor` would feed
 * room-currency numbers back in as if they were expense-currency ones: the total
 * stops matching, the residue re-lands, and every re-save walks the balances a
 * little further from the truth. Always rebuild from `enteredAmountMinor`.
 */

import type { ApiExpense, ApiMember, CurrencyInfo, ExpenseInput, SplitMode } from './api-types'
import { addMinor, decimalsOf, formatMinorPlain, parseAmountToMinor } from './money'

export interface ExpenseFormValues {
    description: string
    /** Major units, verbatim as typed. */
    amountInput: string
    currency: string
    paidById: string
    splitMode: SplitMode
    /** EQUAL mode: who the bill is shared between. */
    participantIds: string[]
    /** EXACT mode: memberId → major-unit text, in the EXPENSE currency. */
    exactInputs: Record<string, string>
    /** ISO date-time. */
    date: string
}

export const emptyExpenseForm = (opts: {
    currency: string
    members: readonly ApiMember[]
    paidById: string
}): ExpenseFormValues => ({
    description: '',
    amountInput: '',
    currency: opts.currency,
    paidById: opts.paidById,
    splitMode: 'EQUAL',
    participantIds: opts.members.map((m) => m.id),
    exactInputs: {},
    date: new Date().toISOString(),
})

/**
 * Server expense → form values. EXACT shares come back in the currency they were
 * typed in (`enteredAmountMinor`); `amountMinor` is post-FX and must never be
 * shown in an expense-currency field.
 */
export function expenseToFormValues(expense: ApiExpense, catalog?: readonly CurrencyInfo[]): ExpenseFormValues {
    const decimals = decimalsOf(expense.currency, catalog)
    const exactInputs: Record<string, string> = {}
    if (expense.splitMode === 'EXACT') {
        for (const share of expense.shares) {
            const entered = share.enteredAmountMinor ?? share.amountMinor
            exactInputs[share.memberId] = formatMinorPlain(entered, decimals)
        }
    }
    return {
        description: expense.description,
        amountInput: formatMinorPlain(expense.amountMinor, decimals),
        currency: expense.currency,
        paidById: expense.paidById,
        splitMode: expense.splitMode,
        participantIds: expense.shares.map((s) => s.memberId),
        exactInputs,
        date: expense.date,
    }
}

/** Sum of the EXACT inputs, in expense-currency minor units. Blank fields are 0. */
export function allocatedMinor(values: ExpenseFormValues, catalog?: readonly CurrencyInfo[]): string {
    const decimals = decimalsOf(values.currency, catalog)
    const parts = Object.values(values.exactInputs).map((input) => parseAmountToMinor(input, decimals) ?? '0')
    return addMinor(parts)
}

/** total − allocated, in expense-currency minor units. Must reach "0" to save. */
export function remainingMinor(values: ExpenseFormValues, catalog?: readonly CurrencyInfo[]): string {
    const decimals = decimalsOf(values.currency, catalog)
    const total = BigInt(parseAmountToMinor(values.amountInput, decimals) ?? '0')
    return (total - BigInt(allocatedMinor(values, catalog))).toString()
}

export type ExpenseFormError =
    'DESCRIPTION_REQUIRED' | 'AMOUNT_REQUIRED' | 'PAYER_REQUIRED' | 'NO_PARTICIPANTS' | 'SHARES_DO_NOT_ADD_UP'

/** The one validator — the drawer's save button and `buildExpenseBody` agree by
 *  construction because both read this. */
export function validateExpenseForm(
    values: ExpenseFormValues,
    catalog?: readonly CurrencyInfo[]
): ExpenseFormError | null {
    const decimals = decimalsOf(values.currency, catalog)
    if (values.description.trim().length === 0) return 'DESCRIPTION_REQUIRED'
    const total = parseAmountToMinor(values.amountInput, decimals)
    if (total === null || BigInt(total) <= 0n) return 'AMOUNT_REQUIRED'
    if (!values.paidById) return 'PAYER_REQUIRED'
    if (values.splitMode === 'EQUAL') {
        if (values.participantIds.length === 0) return 'NO_PARTICIPANTS'
        return null
    }
    const shares = exactShareEntries(values, catalog)
    if (shares.length === 0) return 'NO_PARTICIPANTS'
    if (addMinor(shares.map((s) => s.amountMinor)) !== total) return 'SHARES_DO_NOT_ADD_UP'
    return null
}

/** EXACT rows with a non-empty, non-zero amount, in expense-currency minor units. */
export function exactShareEntries(
    values: ExpenseFormValues,
    catalog?: readonly CurrencyInfo[]
): { memberId: string; amountMinor: string }[] {
    const decimals = decimalsOf(values.currency, catalog)
    return Object.entries(values.exactInputs)
        .map(([memberId, input]) => ({ memberId, amountMinor: parseAmountToMinor(input, decimals) ?? '0' }))
        .filter((share) => BigInt(share.amountMinor) > 0n)
}

/**
 * Form values → the POST/PATCH body. Throws on an invalid form: callers gate on
 * `validateExpenseForm` first, so reaching here with bad values is a bug.
 */
export function buildExpenseBody(values: ExpenseFormValues, catalog?: readonly CurrencyInfo[]): ExpenseInput {
    const error = validateExpenseForm(values, catalog)
    if (error) throw new Error(`cannot build an expense body from an invalid form: ${error}`)

    const decimals = decimalsOf(values.currency, catalog)
    const amountMinor = parseAmountToMinor(values.amountInput, decimals) as string

    const base = {
        description: values.description.trim(),
        amountMinor,
        currency: values.currency,
        paidById: values.paidById,
        date: values.date,
    }

    if (values.splitMode === 'EXACT') {
        return { ...base, splitMode: 'EXACT', exactShares: exactShareEntries(values, catalog) }
    }
    return { ...base, splitMode: 'EQUAL', participantIds: values.participantIds }
}
