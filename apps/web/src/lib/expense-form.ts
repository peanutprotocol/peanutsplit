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
    /** A payer typed in this drawer, not yet a roster row. */
    newPaidByName?: string
    splitMode: SplitMode
    /** EQUAL mode: who the bill is shared between. */
    participantIds: string[]
    /**
     * False until the user deliberately toggles a participant. While false the
     * body omits `participantIds`, so the SERVER splits among everyone in the
     * room at save time — the client's roster can be up to a poll-interval
     * stale, and "split with everyone" is intent, not a member-list snapshot.
     * (A member who joined 3s ago must not be silently excluded.)
     */
    participantsTouched: boolean
    /** EXACT mode: memberId → major-unit text, in the EXPENSE currency. */
    exactInputs: Record<string, string>
    /**
     * False until the user has actually put a number into an EXACT field.
     *
     * It gates the "every cent allocated" celebration, and nothing else. A fresh
     * switch to EXACT opens with empty fields, which sum to zero, which reconciles
     * against a zero total — so without this flag the reward fires before anyone
     * has typed anything, and then goes AWAY the moment they start. The cheer
     * belongs at the end of the work, not in front of it.
     *
     * True when editing a saved EXACT expense: those amounts were allocated, just
     * not in this session.
     */
    exactTouched: boolean
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
    newPaidByName: '',
    splitMode: 'EQUAL',
    participantIds: opts.members.map((m) => m.id),
    participantsTouched: false,
    exactInputs: {},
    exactTouched: false,
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
        newPaidByName: '',
        splitMode: expense.splitMode,
        participantIds: expense.shares.map((s) => s.memberId),
        // Editing must preserve the saved participant set exactly.
        participantsTouched: true,
        exactInputs,
        // A saved EXACT expense is allocated by definition — it could not have
        // been saved otherwise — so the readout opens reconciled and green.
        exactTouched: true,
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

/**
 * Repair the one field-role mix-up we can identify without guessing.
 *
 * Mobile keyboards are hints, not gates: the amount input can still receive
 * "taxi", and the description can still receive "123". Once both values are
 * present that pair is unambiguous — the current amount is not money while the
 * current description is a positive amount — so preserving the words means
 * swapping them, not showing two validation errors.
 *
 * We deliberately do nothing when either side is blank or both sides could be
 * amounts. A description such as "101" may be a room number, and silently
 * moving plausible data without the complementary invalid value would be a
 * guess rather than a repair.
 */
export function repairMisplacedExpenseFields(
    values: ExpenseFormValues,
    catalog?: readonly CurrencyInfo[]
): ExpenseFormValues | null {
    const amountText = values.amountInput.trim()
    const descriptionText = values.description.trim()
    if (!amountText || !descriptionText) return null

    const decimals = decimalsOf(values.currency, catalog)
    const amountMinor = parseAmountToMinor(amountText, decimals)
    const descriptionMinor = parseAmountToMinor(descriptionText, decimals)
    const descriptionIsPositiveAmount = descriptionMinor !== null && BigInt(descriptionMinor) > 0n

    if (amountMinor !== null || !descriptionIsPositiveAmount) return null
    return {
        ...values,
        amountInput: descriptionText,
        description: amountText,
    }
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
    const total = parseAmountToMinor(values.amountInput, decimals)
    if (total === null || BigInt(total) <= 0n) return 'AMOUNT_REQUIRED'
    if (values.description.trim().length === 0) return 'DESCRIPTION_REQUIRED'
    if (!values.paidById && !values.newPaidByName) return 'PAYER_REQUIRED'
    if (values.splitMode === 'EQUAL') {
        if (values.participantsTouched && values.participantIds.length === 0) return 'NO_PARTICIPANTS'
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
        date: values.date,
        ...(values.newPaidByName ? { newPaidByName: values.newPaidByName } : { paidById: values.paidById }),
    }

    if (values.splitMode === 'EXACT') {
        return { ...base, splitMode: 'EXACT', exactShares: exactShareEntries(values, catalog) }
    }
    if (!values.participantsTouched) return { ...base, splitMode: 'EQUAL' }
    return { ...base, splitMode: 'EQUAL', participantIds: values.participantIds }
}
