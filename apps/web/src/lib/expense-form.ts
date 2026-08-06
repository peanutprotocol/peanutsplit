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
import { addMinor, decimalsOf, formatAmountInput, formatMinorPlain, parseAmountToMinor } from './money'

export interface ExpenseFormValues {
    description: string
    /** Saved manual art/category override. null keeps description inference. */
    category: string | null
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
     * ONLINE body omits `participantIds`, so the server splits among everyone in
     * the room at save time — the client's roster can be up to a poll-interval
     * stale, and "split with everyone" is intent, not a member-list snapshot.
     * (A member who joined 3s ago must not be silently excluded.)
     *
     * A draft that falls back to the offline queue is the opposite case, and
     * `queries/expenses.ts` writes the roster into its queued body: replay can
     * land hours after somebody left, and there "everyone" has to mean the
     * people who were on screen when Save was pressed.
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
    /** PERCENTAGE mode: memberId → locale-aware percentage text (2dp max). */
    percentageInputs: Record<string, string>
    /** SHARES mode: memberId → positive whole-number weight text. */
    shareInputs: Record<string, string>
    /** ISO date-time. */
    date: string
}

/** Member ids the current form would send for its selected split mode. Untouched
 * EQUAL deliberately returns none because the online wire omits participantIds
 * and the server resolves the active roster at commit time. (A queued draft is
 * materialized against the submit-time roster instead, at enqueue — that
 * happens after this form model is gone.) */
export const referencedDraftParticipantIds = (values: ExpenseFormValues): string[] => {
    if (values.splitMode === 'EQUAL') return values.participantsTouched ? values.participantIds : []
    if (values.splitMode === 'EXACT') return Object.keys(values.exactInputs)
    if (values.splitMode === 'PERCENTAGE') return Object.keys(values.percentageInputs)
    return Object.keys(values.shareInputs)
}

export const emptyExpenseForm = (opts: {
    currency: string
    members: readonly ApiMember[]
    paidById: string
}): ExpenseFormValues => ({
    description: '',
    category: null,
    amountInput: '',
    currency: opts.currency,
    paidById: opts.paidById,
    newPaidByName: '',
    splitMode: 'EQUAL',
    participantIds: opts.members.map((m) => m.id),
    participantsTouched: false,
    exactInputs: {},
    exactTouched: false,
    percentageInputs: {},
    shareInputs: {},
    date: new Date().toISOString(),
})

/**
 * Server expense → form values. EXACT shares come back in the currency they were
 * typed in (`enteredAmountMinor`); `amountMinor` is post-FX and must never be
 * shown in an expense-currency field.
 */
export function expenseToFormValues(
    expense: ApiExpense,
    catalog?: readonly CurrencyInfo[],
    locale?: string
): ExpenseFormValues {
    const decimals = decimalsOf(expense.currency, catalog)
    const exactInputs: Record<string, string> = {}
    const percentageInputs: Record<string, string> = {}
    const shareInputs: Record<string, string> = {}
    if (expense.splitMode === 'EXACT') {
        for (const share of expense.shares) {
            const entered = share.enteredAmountMinor ?? share.amountMinor
            exactInputs[share.memberId] = locale
                ? formatAmountInput(entered, decimals, locale)
                : formatMinorPlain(entered, decimals)
        }
    } else if (expense.splitMode === 'PERCENTAGE') {
        for (const share of expense.shares) {
            if (share.splitWeight === null) continue
            percentageInputs[share.memberId] = locale
                ? formatAmountInput(share.splitWeight, 2, locale)
                : formatMinorPlain(share.splitWeight, 2)
        }
    } else if (expense.splitMode === 'SHARES') {
        for (const share of expense.shares) {
            if (share.splitWeight !== null) shareInputs[share.memberId] = share.splitWeight
        }
    }
    return {
        description: expense.description,
        category: expense.category,
        amountInput: locale
            ? formatAmountInput(expense.amountMinor, decimals, locale)
            : formatMinorPlain(expense.amountMinor, decimals),
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
        percentageInputs,
        shareInputs,
        date: expense.date,
    }
}

/** Sum of the EXACT inputs, in expense-currency minor units. Blank fields are 0. */
export function allocatedMinor(values: ExpenseFormValues, catalog?: readonly CurrencyInfo[], locale?: string): string {
    const decimals = decimalsOf(values.currency, catalog)
    const parts = Object.values(values.exactInputs).map((input) => parseAmountToMinor(input, decimals, locale) ?? '0')
    return addMinor(parts)
}

/**
 * Is a share field holding text the parser cannot read?
 *
 * `allocatedMinor` counts such a field as zero, so the readout above the save
 * button would otherwise agree with itself and disagree with saving: a lone "."
 * beside shares that already sum to the total left the sheet cheering "every cent
 * allocated" while save refused with SHARE_AMOUNT_INVALID. The keystroke gate
 * cannot close that — "." has to stay typeable on the way to ".50" — so the
 * readout asks this instead, and the validator below asks the same question.
 */
export function hasUnreadableShare(
    values: ExpenseFormValues,
    catalog?: readonly CurrencyInfo[],
    locale?: string
): boolean {
    const decimals = decimalsOf(values.currency, catalog)
    return Object.values(values.exactInputs).some(
        (input) => input.trim().length > 0 && parseAmountToMinor(input, decimals, locale) === null
    )
}

/** total − allocated, in expense-currency minor units. Must reach "0" to save. */
export function remainingMinor(values: ExpenseFormValues, catalog?: readonly CurrencyInfo[], locale?: string): string {
    const decimals = decimalsOf(values.currency, catalog)
    const total = BigInt(parseAmountToMinor(values.amountInput, decimals, locale) ?? '0')
    return (total - BigInt(allocatedMinor(values, catalog, locale))).toString()
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
    catalog?: readonly CurrencyInfo[],
    locale?: string
): ExpenseFormValues | null {
    const amountText = values.amountInput.trim()
    const descriptionText = values.description.trim()
    if (!amountText || !descriptionText) return null

    const decimals = decimalsOf(values.currency, catalog)
    const amountMinor = parseAmountToMinor(amountText, decimals, locale)
    const descriptionMinor = parseAmountToMinor(descriptionText, decimals, locale)
    const descriptionIsPositiveAmount = descriptionMinor !== null && BigInt(descriptionMinor) > 0n

    // A punctuation-only value may be an invalid amount (for example excess
    // precision), not a description accidentally typed on the wrong line.
    // Keep it in the amount field so validation can explain the real problem.
    const amountLooksLikeDescription = /\p{L}/u.test(amountText)
    if (amountMinor !== null || !amountLooksLikeDescription || !descriptionIsPositiveAmount) return null
    return {
        ...values,
        amountInput: descriptionText,
        description: amountText,
    }
}

export type ExpenseFormError =
    | 'AMOUNT_REQUIRED'
    | 'AMOUNT_INVALID'
    | 'AMOUNT_NEGATIVE'
    | 'PAYER_REQUIRED'
    | 'NO_PARTICIPANTS'
    | 'SHARE_AMOUNT_INVALID'
    | 'SHARES_DO_NOT_ADD_UP'
    | 'PERCENTAGE_INVALID'
    | 'PERCENTAGES_DO_NOT_ADD_UP'
    | 'SHARE_WEIGHT_INVALID'

/**
 * A readable amount wearing a minus sign.
 *
 * The share fields refuse a "-" at the keystroke, but the total keeps whatever
 * was typed so that a swapped amount/description pair can still be repaired —
 * so "-5" is the one negative the form has to explain. It is not a separator
 * mistake, and sending someone to check separators and decimal places leaves
 * them re-reading digits that were right all along.
 */
const isNegativeAmount = (text: string, decimals: number, locale?: string): boolean => {
    const unsigned = text.replace(/^[-−–]\s*/, '')
    return unsigned !== text && parseAmountToMinor(unsigned, decimals, locale) !== null
}

/** The one validator — the drawer's save button and `buildExpenseBody` agree by
 *  construction because both read this. */
export function validateExpenseForm(
    values: ExpenseFormValues,
    catalog?: readonly CurrencyInfo[],
    locale?: string
): ExpenseFormError | null {
    const decimals = decimalsOf(values.currency, catalog)
    const amountText = values.amountInput.trim()
    if (amountText.length === 0) return 'AMOUNT_REQUIRED'
    const total = parseAmountToMinor(amountText, decimals, locale)
    if (total === null) return isNegativeAmount(amountText, decimals, locale) ? 'AMOUNT_NEGATIVE' : 'AMOUNT_INVALID'
    if (BigInt(total) <= 0n) return 'AMOUNT_REQUIRED'
    // No check on the description: a name is optional, and a row saved without
    // one is labelled by its day instead — see `expenseLabel` in `lib/dates.ts`.
    if (!values.paidById && !values.newPaidByName) return 'PAYER_REQUIRED'
    if (values.splitMode === 'EQUAL') {
        if (values.participantsTouched && values.participantIds.length === 0) return 'NO_PARTICIPANTS'
        return null
    }
    if (values.splitMode === 'EXACT') {
        if (hasUnreadableShare(values, catalog, locale)) return 'SHARE_AMOUNT_INVALID'
        const shares = exactShareEntries(values, catalog, locale)
        if (shares.length === 0) return 'NO_PARTICIPANTS'
        if (addMinor(shares.map((s) => s.amountMinor)) !== total) return 'SHARES_DO_NOT_ADD_UP'
        return null
    }
    if (values.splitMode === 'PERCENTAGE') {
        if (hasUnreadablePercentage(values, locale)) return 'PERCENTAGE_INVALID'
        const shares = percentageShareEntries(values, locale)
        if (shares.length === 0) return 'NO_PARTICIPANTS'
        if (addMinor(shares.map((share) => share.weight)) !== '10000') return 'PERCENTAGES_DO_NOT_ADD_UP'
        return null
    }
    if (hasUnreadableShareWeight(values)) return 'SHARE_WEIGHT_INVALID'
    if (shareWeightEntries(values).length === 0) return 'NO_PARTICIPANTS'
    return null
}

/** PERCENTAGE values are stored on the wire as basis points: 12.34% → "1234". */
export function percentageShareEntries(
    values: ExpenseFormValues,
    locale?: string
): { memberId: string; weight: string }[] {
    return Object.entries(values.percentageInputs)
        .map(([memberId, input]) => ({ memberId, weight: parseAmountToMinor(input, 2, locale) ?? '0' }))
        .filter((share) => BigInt(share.weight) > 0n)
}

/** Prisma/Postgres store split weights as signed 64-bit integers. */
export const MAX_SPLIT_WEIGHT = 9_223_372_036_854_775_807n

export function hasUnreadablePercentage(values: ExpenseFormValues, locale?: string): boolean {
    return Object.values(values.percentageInputs).some((input) => {
        if (input.trim().length === 0) return false
        const weight = parseAmountToMinor(input, 2, locale)
        return weight === null || BigInt(weight) > MAX_SPLIT_WEIGHT
    })
}

/** 100.00% minus the entered percentage, expressed in basis points. */
export function percentageRemainingBasisPoints(values: ExpenseFormValues, locale?: string): string {
    const allocated = addMinor(percentageShareEntries(values, locale).map((share) => share.weight))
    return (10000n - BigInt(allocated)).toString()
}

/** SHARES values are deliberately stricter than money: only positive integers participate. */
export function shareWeightEntries(values: ExpenseFormValues): { memberId: string; weight: string }[] {
    return Object.entries(values.shareInputs)
        .filter(([, input]) => /^\d+$/.test(input.trim()) && BigInt(input.trim()) > 0n)
        .map(([memberId, input]) => ({ memberId, weight: BigInt(input.trim()).toString() }))
}

export function hasUnreadableShareWeight(values: ExpenseFormValues): boolean {
    return Object.values(values.shareInputs).some((input) => {
        const trimmed = input.trim()
        return trimmed.length > 0 && (!/^\d+$/.test(trimmed) || BigInt(trimmed) > MAX_SPLIT_WEIGHT)
    })
}

/** The participant summary and request body must use the same inclusion rule. */
export function weightedParticipantIds(values: ExpenseFormValues, locale?: string): string[] {
    const entries =
        values.splitMode === 'PERCENTAGE' ? percentageShareEntries(values, locale) : shareWeightEntries(values)
    return entries.map((share) => share.memberId)
}

/**
 * THE definition of who an EXACT split is between: a member whose field holds an
 * amount GREATER THAN ZERO. A blank field means "not in this split" rather than
 * zero, and an explicit 0 is the same sentence typed out — a zero share is not a
 * share, and it would put a member on a split owing nothing.
 *
 * Having a field is NOT the predicate. The composer used to count that instead,
 * so a third member left blank was drawn into the "Everyone" chip and its
 * avatars while this function quietly left them off the body: the sheet claimed
 * a three-way split, saved a two-way one, and the balances followed the body.
 * The chip now reads `exactParticipantIds` below, so the two cannot disagree.
 */
export function exactShareEntries(
    values: ExpenseFormValues,
    catalog?: readonly CurrencyInfo[],
    locale?: string
): { memberId: string; amountMinor: string }[] {
    const decimals = decimalsOf(values.currency, catalog)
    return Object.entries(values.exactInputs)
        .map(([memberId, input]) => ({
            memberId,
            amountMinor: parseAmountToMinor(input, decimals, locale) ?? '0',
        }))
        .filter((share) => BigInt(share.amountMinor) > 0n)
}

/** Who the composer may say the split is between — the same members, and only
 *  the same members, that `exactShareEntries` will post. */
export function exactParticipantIds(
    values: ExpenseFormValues,
    catalog?: readonly CurrencyInfo[],
    locale?: string
): string[] {
    return exactShareEntries(values, catalog, locale).map((share) => share.memberId)
}

/**
 * Form values → the POST/PATCH body. Throws on an invalid form: callers gate on
 * `validateExpenseForm` first, so reaching here with bad values is a bug.
 */
export function buildExpenseBody(
    values: ExpenseFormValues,
    catalog?: readonly CurrencyInfo[],
    locale?: string
): ExpenseInput {
    const error = validateExpenseForm(values, catalog, locale)
    if (error) throw new Error(`cannot build an expense body from an invalid form: ${error}`)

    const decimals = decimalsOf(values.currency, catalog)
    const amountMinor = parseAmountToMinor(values.amountInput, decimals, locale) as string

    const base = {
        description: values.description.trim(),
        category: values.category,
        amountMinor,
        currency: values.currency,
        date: values.date,
        ...(values.newPaidByName ? { newPaidByName: values.newPaidByName } : { paidById: values.paidById }),
    }

    if (values.splitMode === 'EXACT') {
        return { ...base, splitMode: 'EXACT', exactShares: exactShareEntries(values, catalog, locale) }
    }
    if (values.splitMode === 'PERCENTAGE') {
        return { ...base, splitMode: 'PERCENTAGE', weightedShares: percentageShareEntries(values, locale) }
    }
    if (values.splitMode === 'SHARES') {
        return { ...base, splitMode: 'SHARES', weightedShares: shareWeightEntries(values) }
    }
    if (!values.participantsTouched) return { ...base, splitMode: 'EQUAL' }
    return { ...base, splitMode: 'EQUAL', participantIds: values.participantIds }
}
