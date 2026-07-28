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
 */

import { fromDateInputValue } from '@/lib/dates'
import type { ExpenseFormValues } from '@/lib/expense-form'
import { addMinor, equalSplitMinor, formatMinorPlain, parseAmountToMinor } from '@/lib/money'

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

export interface ScanState {
    items: ScanItem[]
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
    }
}

const mapItem = (state: ScanState, itemId: string, fn: (item: ScanItem) => ScanItem): ScanState => ({
    ...state,
    items: state.items.map((item) => (item.id === itemId ? fn(item) : item)),
})

/** An item's amount in minor units. An unparseable or blank field is zero —
 *  the review screen shows the field as typed and the totals simply ignore it. */
export const itemMinor = (item: ScanItem, decimals: number): string =>
    parseAmountToMinor(item.amountInput, decimals) ?? '0'

/** Sum of every item, assigned or not. This is what the expense will be worth. */
export const itemsTotalMinor = (state: ScanState, decimals: number): string =>
    addMinor(state.items.map((item) => itemMinor(item, decimals)))

/** Items with a positive amount and nobody on them. Non-zero blocks the submit —
 *  an unassigned item is money that would silently leave the split. */
export const unassignedItems = (state: ScanState, decimals: number): ScanItem[] =>
    state.items.filter(
        (item) => BigInt(itemMinor(item, decimals)) > 0n && (state.assignments[item.id] ?? []).length === 0
    )

/**
 * memberId → what they owe, in minor units of the scan currency.
 *
 * Only members who actually owe something appear. Items with no assignees
 * contribute nothing (the caller blocks on `unassignedItems` before this
 * matters), and a zero-amount item contributes zero to everyone on it.
 */
export function memberTotals(state: ScanState, decimals: number): Record<string, string> {
    const totals = new Map<string, bigint>()
    for (const item of state.items) {
        const assignees = state.assignments[item.id] ?? []
        if (assignees.length === 0) continue
        const shares = equalSplitMinor(itemMinor(item, decimals), assignees.length)
        assignees.forEach((memberId, index) => {
            totals.set(memberId, (totals.get(memberId) ?? 0n) + BigInt(shares[index]))
        })
    }
    return Object.fromEntries(
        [...totals].filter(([, amount]) => amount > 0n).map(([id, amount]) => [id, amount.toString()])
    )
}

/** Sum of the assigned items only — the number `memberTotals` must add up to. */
export const assignedTotalMinor = (state: ScanState, decimals: number): string =>
    addMinor(
        state.items
            .filter((item) => (state.assignments[item.id] ?? []).length > 0)
            .map((item) => itemMinor(item, decimals))
    )

/** Signed difference between what the receipt says and what the items add up to.
 *  Negative means the items overshoot the printed total. Null when the receipt
 *  carried no total to disagree with. */
export function totalMismatchMinor(state: ScanState, decimals: number): string | null {
    if (state.receiptTotalMinor === null) return null
    return (BigInt(state.receiptTotalMinor) - BigInt(itemsTotalMinor(state, decimals))).toString()
}

/** Build the initial state from what the server parsed. */
export function initScanState(
    parsed: {
        items: { label: string; amountMinor: string; quantity: number | null }[]
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
 * The amount is the sum of the ASSIGNED items rather than of all of them, so the
 * form arrives reconciled by construction: `validateExpenseForm` demands that
 * the exact shares add up to the total, and the shares are built from exactly
 * these items. (At submit time the two sums are equal anyway — an unassigned
 * item with a positive amount blocks the button — but deriving the total from
 * the same set the shares came from means they cannot drift apart later.)
 */
export function toExpenseFormValues(
    state: ScanState,
    opts: { base: ExpenseFormValues; decimals: number; fallbackDescription: string }
): ExpenseFormValues {
    const totals = memberTotals(state, opts.decimals)
    const exactInputs: Record<string, string> = {}
    for (const [memberId, minor] of Object.entries(totals)) {
        exactInputs[memberId] = formatMinorPlain(minor, opts.decimals)
    }

    return {
        ...opts.base,
        description: state.merchant ?? opts.fallbackDescription,
        amountInput: formatMinorPlain(assignedTotalMinor(state, opts.decimals), opts.decimals),
        currency: state.currency,
        splitMode: 'EXACT',
        participantIds: Object.keys(exactInputs),
        participantsTouched: true,
        exactInputs,
        // The receipt did the allocating, item by item, on the screen before this
        // one — so the drawer's readout opens already celebrating rather than
        // asking for numbers that are visibly all there.
        exactTouched: true,
        // The receipt's own date when it had one, keeping the time of day off the
        // form's current value so same-day ordering survives.
        date: state.date ? fromDateInputValue(state.date, opts.base.date) : opts.base.date,
    }
}
