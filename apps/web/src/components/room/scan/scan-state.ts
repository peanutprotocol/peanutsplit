/**
 * The scan flow's model: items, who they belong to, and the arithmetic that
 * turns those two into an EXACT split.
 *
 * Pure on purpose. Every screen in `scan/` is a rendering of this state and
 * every tap is one of these actions, so the part that can produce a wrong number
 * is a set of functions with no React, no fetch and no clock in them — testable
 * the same way `lib/expense-form.ts` is.
 *
 * THE invariant, and the reason the property test exists: for any set of items
 * and any assignment of them, the sum of every member's total equals the sum of
 * every assigned item. Cents do not appear and do not vanish between the receipt
 * and the split. An item shared by three people at 10.00 is 3.34/3.33/3.33 —
 * the remainder walks the assignee list one minor unit at a time, which is the
 * same rule `equalSplitMinor` gives the server, so a scanned split and a
 * hand-typed one round identically.
 *
 * Adjustments (a discount, tip, tax or service charge) sit beside the items
 * rather than among them. They are not assigned to anyone: each one is spread
 * over the people who had items, either in proportion to what each of them had
 * or equally. They change each person's exact amount before the handoff and
 * nothing after it, so the ledger only ever sees an ordinary EXACT split.
 */

import { fromDateInputValue } from '@/lib/dates'
import type { ExpenseFormValues } from '@/lib/expense-form'
import {
    addMinor,
    allocateProportionally,
    equalSplitMinor,
    formatAmountInput,
    formatMinorPlain,
    parseAmountToMinor,
} from '@/lib/money'

export interface ScanItem {
    /** Client-minted and stable for the life of the flow — the wire carries no
     *  ids, because the server keeps nothing to have ids for. */
    id: string
    label: string
    /** Major units, verbatim as edited. Same representation as the expense
     *  drawer's amount field, so the two never disagree about what "1,5" means. */
    amountInput: string
    /** Printed on the receipt, shown as a hint. Never multiplied by anything. */
    quantity: number | null
}

export type AdjustmentKind = 'discount' | 'tip' | 'tax' | 'service'
export const ADJUSTMENT_KINDS: readonly AdjustmentKind[] = ['discount', 'tip', 'tax', 'service']

/** How an adjustment lands on people. `proportional` follows each person's item
 *  subtotal (a 10% discount takes 10% off everyone's own order); `equal` gives
 *  every person who had items the same amount. */
export type AdjustmentSpread = 'proportional' | 'equal'

export interface ScanAdjustment {
    id: string
    kind: AdjustmentKind
    /** As printed on the receipt ("Propina sugerida"), or null for one added by
     *  hand — the kind's name is shown instead. */
    label: string | null
    /** `percent` of the items' total, or a fixed `amount` in the bill currency. */
    unit: 'percent' | 'amount'
    /** Always entered as a positive number; the kind carries the sign. */
    valueInput: string
    spread: AdjustmentSpread
}

/** Tips are usually shared out evenly at the table; everything printed as a
 *  share of the bill (tax, service, a discount) follows what each person had. */
export const defaultSpread = (kind: AdjustmentKind): AdjustmentSpread => (kind === 'tip' ? 'equal' : 'proportional')

export interface ScanState {
    items: ScanItem[]
    adjustments: ScanAdjustment[]
    /** itemId → memberIds sharing it. An absent or empty entry is unassigned. */
    assignments: Record<string, string[]>
    /** Minor units. The grand total printed on the receipt, when there was one. */
    receiptTotalMinor: string | null
    currency: string
    merchant: string | null
    /** ISO date (YYYY-MM-DD) read off the receipt, if any. */
    date: string | null
}

export type ScanAction =
    /** The parse landing. Wholesale replacement, because everything before it
     *  was a placeholder waiting for the model to answer. */
    | { type: 'reset'; state: ScanState }
    | { type: 'edit-label'; itemId: string; label: string }
    | { type: 'edit-amount'; itemId: string; amountInput: string }
    | { type: 'remove-item'; itemId: string }
    | { type: 'add-item' }
    | { type: 'toggle-assignee'; itemId: string; memberId: string }
    | { type: 'assign-everyone'; itemId: string; memberIds: string[] }
    | { type: 'clear-assignees'; itemId: string }
    | { type: 'add-adjustment'; kind: AdjustmentKind; unit?: ScanAdjustment['unit']; valueInput?: string }
    | {
          type: 'edit-adjustment'
          adjustmentId: string
          patch: Partial<Pick<ScanAdjustment, 'kind' | 'unit' | 'valueInput' | 'spread'>>
      }
    | { type: 'remove-adjustment'; adjustmentId: string }

/** Monotonic within a flow; ids only have to be unique among the items on screen. */
let nextItemSeq = 0
export const mintItemId = (): string => `scan-${++nextItemSeq}`

export function scanReducer(state: ScanState, action: ScanAction): ScanState {
    switch (action.type) {
        case 'reset':
            return action.state

        case 'edit-label':
            return mapItem(state, action.itemId, (item) => ({ ...item, label: action.label }))

        case 'edit-amount':
            return mapItem(state, action.itemId, (item) => ({ ...item, amountInput: action.amountInput }))

        case 'remove-item': {
            // The assignment goes with the item. Leaving it behind would keep a
            // deleted line's members in the "assigned" count and let a scan
            // submit with an item nobody can see.
            const assignments = { ...state.assignments }
            delete assignments[action.itemId]
            return { ...state, items: state.items.filter((item) => item.id !== action.itemId), assignments }
        }

        case 'add-item':
            // Appended blank rather than inserted: a missed item is nearly always
            // remembered after reading the whole list, and a row that appears
            // under your thumb is a row you have to go looking for.
            return {
                ...state,
                items: [...state.items, { id: mintItemId(), label: '', amountInput: '', quantity: null }],
            }

        case 'toggle-assignee': {
            const current = state.assignments[action.itemId] ?? []
            const next = current.includes(action.memberId)
                ? current.filter((id) => id !== action.memberId)
                : [...current, action.memberId]
            return { ...state, assignments: { ...state.assignments, [action.itemId]: next } }
        }

        case 'assign-everyone': {
            // A toggle, not a set: tapping "everyone" on a row that is already
            // everyone is the gesture for "actually, nobody" — and without the
            // second half there is no way back except tapping each chip off.
            const current = state.assignments[action.itemId] ?? []
            const isEveryone =
                current.length === action.memberIds.length && action.memberIds.every((id) => current.includes(id))
            return {
                ...state,
                assignments: { ...state.assignments, [action.itemId]: isEveryone ? [] : [...action.memberIds] },
            }
        }

        case 'clear-assignees':
            return { ...state, assignments: { ...state.assignments, [action.itemId]: [] } }

        case 'add-adjustment':
            return {
                ...state,
                adjustments: [
                    ...state.adjustments,
                    {
                        id: mintItemId(),
                        kind: action.kind,
                        label: null,
                        unit: action.unit ?? 'percent',
                        valueInput: action.valueInput ?? '',
                        spread: defaultSpread(action.kind),
                    },
                ],
            }

        case 'edit-adjustment':
            return {
                ...state,
                adjustments: state.adjustments.map((adjustment) => {
                    if (adjustment.id !== action.adjustmentId) return adjustment
                    const next = { ...adjustment, ...action.patch }
                    // A new kind brings its own default spread unless the same edit
                    // set one, and drops a printed label that now names the old kind.
                    if (action.patch.kind && action.patch.kind !== adjustment.kind) {
                        next.label = null
                        if (!action.patch.spread) next.spread = defaultSpread(action.patch.kind)
                    }
                    return next
                }),
            }

        case 'remove-adjustment':
            return {
                ...state,
                adjustments: state.adjustments.filter((adjustment) => adjustment.id !== action.adjustmentId),
            }
    }
}

const mapItem = (state: ScanState, itemId: string, fn: (item: ScanItem) => ScanItem): ScanState => ({
    ...state,
    items: state.items.map((item) => (item.id === itemId ? fn(item) : item)),
})

/** An item's amount in minor units. Blank input contributes zero. Invalid
 * non-empty input also returns zero for arithmetic, but `invalidAmountItems`
 * blocks the review handoff so that row can never disappear from the expense. */
export const itemMinor = (item: ScanItem, decimals: number, locale?: string): string =>
    parseAmountToMinor(item.amountInput, decimals, locale) ?? '0'

/** Non-empty amounts that cannot be represented in this currency. They must
 * block the handoff: treating them as zero would silently remove a receipt row. */
export const invalidAmountItems = (state: ScanState, decimals: number, locale?: string): ScanItem[] =>
    state.items.filter(
        (item) => item.amountInput.trim().length > 0 && parseAmountToMinor(item.amountInput, decimals, locale) === null
    )

/** Sum of every item, assigned or not. This is what the expense will be worth. */
export const itemsTotalMinor = (state: ScanState, decimals: number, locale?: string): string =>
    addMinor(state.items.map((item) => parseAmountToMinor(item.amountInput, decimals, locale) ?? '0'))

/** Items with a positive amount and nobody on them. Non-zero blocks the submit —
 *  an unassigned item is money that would silently leave the split. */
export const unassignedItems = (state: ScanState, decimals: number, locale?: string): ScanItem[] =>
    state.items.filter(
        (item) =>
            BigInt(parseAmountToMinor(item.amountInput, decimals, locale) ?? '0') > 0n &&
            (state.assignments[item.id] ?? []).length === 0
    )

/** memberId → their share of the assigned items, before adjustments. */
function itemSubtotals(state: ScanState, decimals: number, locale?: string): Map<string, bigint> {
    const totals = new Map<string, bigint>()
    for (const item of state.items) {
        const assignees = state.assignments[item.id] ?? []
        if (assignees.length === 0) continue
        const shares = equalSplitMinor(parseAmountToMinor(item.amountInput, decimals, locale) ?? '0', assignees.length)
        assignees.forEach((memberId, index) => {
            totals.set(memberId, (totals.get(memberId) ?? 0n) + BigInt(shares[index]))
        })
    }
    return totals
}

/** Sum of the assigned items only, before adjustments. */
export const assignedItemsMinor = (state: ScanState, decimals: number, locale?: string): string =>
    addMinor(
        state.items
            .filter((item) => (state.assignments[item.id] ?? []).length > 0)
            .map((item) => parseAmountToMinor(item.amountInput, decimals, locale) ?? '0')
    )

/** Hundredths of a percent ("12,5" → 1250), or null when unreadable or over 100%. */
const percentBasisPoints = (input: string, locale?: string): bigint | null => {
    const parsed = parseAmountToMinor(input, 2, locale)
    if (parsed === null) return null
    const points = BigInt(parsed)
    return points > 10_000n ? null : points
}

/** An adjustment's value is unreadable: not a number, too precise for the
 *  currency, or a percentage over 100. A blank value is simply zero. */
const adjustmentUnreadable = (adjustment: ScanAdjustment, decimals: number, locale?: string): boolean => {
    if (adjustment.valueInput.trim().length === 0) return false
    return adjustment.unit === 'percent'
        ? percentBasisPoints(adjustment.valueInput, locale) === null
        : parseAmountToMinor(adjustment.valueInput, decimals, locale) === null
}

export const invalidAdjustments = (state: ScanState, decimals: number, locale?: string): ScanAdjustment[] =>
    state.adjustments.filter((adjustment) => adjustmentUnreadable(adjustment, decimals, locale))

/**
 * One adjustment in minor units, signed: negative for a discount. A percentage is
 * taken of `baseMinor` (the items it applies to) and rounded half-up to the
 * currency's minor unit. Blank or unreadable values are zero; the caller blocks
 * the handoff on `invalidAdjustments` so a typo can never silently vanish.
 */
export function adjustmentMinor(
    adjustment: ScanAdjustment,
    baseMinor: string,
    decimals: number,
    locale?: string
): string {
    if (adjustmentUnreadable(adjustment, decimals, locale) || adjustment.valueInput.trim().length === 0) return '0'
    let magnitude: bigint
    if (adjustment.unit === 'percent') {
        const points = percentBasisPoints(adjustment.valueInput, locale) ?? 0n
        magnitude = (BigInt(baseMinor) * points * 2n + 10_000n) / 20_000n
    } else {
        magnitude = BigInt(parseAmountToMinor(adjustment.valueInput, decimals, locale) ?? '0')
    }
    return (adjustment.kind === 'discount' ? -magnitude : magnitude).toString()
}

/** Every adjustment applied to `baseMinor`, summed and signed. */
export const adjustmentsTotalMinor = (state: ScanState, baseMinor: string, decimals: number, locale?: string): string =>
    addMinor(state.adjustments.map((adjustment) => adjustmentMinor(adjustment, baseMinor, decimals, locale)))

/** Spread a signed amount over `ids`: by `weights`, or equally. Exact in minor
 *  units either way — the parts always sum to `amount`. */
function spreadMinor(amount: bigint, ids: string[], weights: bigint[], spread: AdjustmentSpread): bigint[] {
    const magnitude = amount < 0n ? -amount : amount
    const parts =
        spread === 'equal'
            ? equalSplitMinor(magnitude.toString(), ids.length).map(BigInt)
            : allocateProportionally(magnitude, weights)
    return amount < 0n ? parts.map((part) => -part) : parts
}

/**
 * memberId → what they owe, in minor units of the scan currency: their items
 * plus their part of every adjustment.
 *
 * Adjustments land only on people who had items. Items with no assignees
 * contribute nothing (the caller blocks on `unassignedItems` before this
 * matters). A member whose total is zero is left out; a negative total (a
 * discount bigger than what someone had) is kept so the caller can block on it.
 */
export function memberTotals(state: ScanState, decimals: number, locale?: string): Record<string, string> {
    const subtotals = itemSubtotals(state, decimals, locale)
    const totals = new Map(subtotals)
    const ids = [...subtotals].filter(([, amount]) => amount > 0n).map(([id]) => id)
    const weights = ids.map((id) => subtotals.get(id) ?? 0n)
    const base = assignedItemsMinor(state, decimals, locale)

    if (ids.length > 0) {
        for (const adjustment of state.adjustments) {
            const amount = BigInt(adjustmentMinor(adjustment, base, decimals, locale))
            if (amount === 0n) continue
            spreadMinor(amount, ids, weights, adjustment.spread).forEach((part, index) => {
                totals.set(ids[index], (totals.get(ids[index]) ?? 0n) + part)
            })
        }
    }

    return Object.fromEntries(
        [...totals].filter(([, amount]) => amount !== 0n).map(([id, amount]) => [id, amount.toString()])
    )
}

/** Members a discount would leave owing less than nothing. Non-empty blocks the
 *  handoff — an expense cannot carry a negative share. */
export const membersBelowZero = (state: ScanState, decimals: number, locale?: string): string[] =>
    Object.entries(memberTotals(state, decimals, locale))
        .filter(([, amount]) => BigInt(amount) < 0n)
        .map(([id]) => id)

/** What the expense will be worth: the assigned items plus every adjustment, as
 *  it lands on people. Always equal to the sum of `memberTotals`. */
export const assignedTotalMinor = (state: ScanState, decimals: number, locale?: string): string =>
    addMinor(Object.values(memberTotals(state, decimals, locale)))

/** Every item plus every adjustment, before anyone is assigned — the review
 *  screen's version of the bill total. */
export function billTotalMinor(state: ScanState, decimals: number, locale?: string): string {
    const items = itemsTotalMinor(state, decimals, locale)
    return (BigInt(items) + BigInt(adjustmentsTotalMinor(state, items, decimals, locale))).toString()
}

/** Signed difference between what the receipt says and what the items plus
 *  adjustments add up to. Negative means the bill overshoots the printed total.
 *  Null when the receipt carried no total to disagree with. */
export function totalMismatchMinor(state: ScanState, decimals: number, locale?: string): string | null {
    if (state.receiptTotalMinor === null) return null
    return (BigInt(state.receiptTotalMinor) - BigInt(billTotalMinor(state, decimals, locale))).toString()
}

/** Build the initial state from what the server parsed. */
export function initScanState(
    parsed: {
        items: { label: string; amountMinor: string; quantity: number | null }[]
        /** Optional so a parse from a server that predates adjustments still loads. */
        adjustments?: { kind: AdjustmentKind; label: string | null; amountMinor: string }[]
        receiptTotalMinor: string | null
        currency: string | null
        merchant: string | null
        date: string | null
    },
    opts: { fallbackCurrency: string; toInput: (minor: string) => string }
): ScanState {
    return {
        items: parsed.items.map((item) => ({
            id: mintItemId(),
            label: item.label,
            amountInput: opts.toInput(item.amountMinor),
            quantity: item.quantity,
        })),
        // Read off the receipt as printed amounts, so they stay amounts.
        adjustments: (parsed.adjustments ?? []).map((adjustment) => ({
            id: mintItemId(),
            kind: adjustment.kind,
            label: adjustment.label,
            unit: 'amount' as const,
            valueInput: opts.toInput(adjustment.amountMinor),
            spread: defaultSpread(adjustment.kind),
        })),
        assignments: {},
        receiptTotalMinor: parsed.receiptTotalMinor,
        currency: parsed.currency ?? opts.fallbackCurrency,
        merchant: parsed.merchant,
        date: parsed.date,
    }
}

/**
 * The handoff. A scan produces form values, never an expense — the reviewed form
 * goes out through the same POST every hand-typed expense does.
 *
 * That is the whole reason this returns `ExpenseFormValues` and stops: one money
 * path, already tested. A "save the scan directly" endpoint would be a second
 * way to write shares into a room, with its own FX handling, its own validation,
 * and its own bugs — for the sake of skipping a screen the user wants anyway.
 *
 * The amount is the sum of the ASSIGNED items plus the adjustments, taken from
 * the same per-person totals the shares are, so the form arrives reconciled by
 * construction: `validateExpenseForm` demands that the exact shares add up to
 * the total, and both come from `memberTotals`, so they cannot drift apart.
 */
export function toExpenseFormValues(
    state: ScanState,
    opts: { base: ExpenseFormValues; decimals: number; fallbackDescription: string; locale?: string }
): ExpenseFormValues {
    const totals = memberTotals(state, opts.decimals, opts.locale)
    const exactInputs: Record<string, string> = {}
    for (const [memberId, minor] of Object.entries(totals)) {
        exactInputs[memberId] = opts.locale
            ? formatAmountInput(minor, opts.decimals, opts.locale)
            : formatMinorPlain(minor, opts.decimals)
    }

    return {
        ...opts.base,
        description: state.merchant ?? opts.fallbackDescription,
        amountInput: opts.locale
            ? formatAmountInput(assignedTotalMinor(state, opts.decimals, opts.locale), opts.decimals, opts.locale)
            : formatMinorPlain(assignedTotalMinor(state, opts.decimals), opts.decimals),
        currency: state.currency,
        splitMode: 'EXACT',
        participantIds: Object.keys(exactInputs),
        participantsTouched: true,
        exactInputs,
        percentageInputs: {},
        shareInputs: {},
        // The receipt did the allocating, item by item, on the screen before this
        // one — so the drawer's readout opens already celebrating rather than
        // asking for numbers that are visibly all there.
        exactTouched: true,
        // The receipt's own date when it had one, keeping the time of day off the
        // form's current value so same-day ordering survives.
        date: state.date ? fromDateInputValue(state.date, opts.base.date) : opts.base.date,
    }
}
