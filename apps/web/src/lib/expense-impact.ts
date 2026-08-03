import type { ApiExpense } from './api-types'
import { isPendingExpenseId } from './pending'

export type ExpenseImpactDirection = 'incoming' | 'outgoing' | 'neutral'

export interface ExpensePersonalImpact {
    /** The effect this one expense had on the viewer's room-currency net. */
    direction: ExpenseImpactDirection
    /** Signed room-currency minor units: positive means the viewer is owed. */
    signedMinor: string
    /** Magnitude for display next to the direction words. */
    amountMinor: string
    /** Why a zero did not move the viewer's balance. */
    neutralReason?: 'not-in-split' | 'no-balance-change'
}

/**
 * The viewer's exact balance movement from one saved expense.
 *
 * Expense totals can be in a foreign currency, but balances and shares are
 * always in the room currency. Folding the same fields as the server keeps the
 * history annotation consistent with the balance strip, including rounding.
 */
export function personalExpenseImpact(expense: ApiExpense, meId?: string): ExpensePersonalImpact | null {
    // Optimistic placeholders deliberately carry zero shares. Calling that a
    // real effect would make the payer appear to be owed the full expense while
    // the authoritative balance above has not moved at all.
    if (!meId || isPendingExpenseId(expense.id)) return null

    const paidMinor = expense.paidById === meId ? BigInt(expense.baseAmountMinor) : 0n
    // Sum rather than find: the API currently emits one share per member, but a
    // fold mirrors the balance calculation and stays correct for imported data.
    const myShares = expense.shares.filter((share) => share.memberId === meId)
    const shareMinor = myShares.reduce((sum, share) => sum + BigInt(share.amountMinor), 0n)
    const signed = paidMinor - shareMinor
    const direction: ExpenseImpactDirection = signed > 0n ? 'incoming' : signed < 0n ? 'outgoing' : 'neutral'

    return {
        direction,
        signedMinor: signed.toString(),
        amountMinor: (signed < 0n ? -signed : signed).toString(),
        neutralReason:
            direction === 'neutral'
                ? expense.paidById === meId || myShares.length > 0
                    ? 'no-balance-change'
                    : 'not-in-split'
                : undefined,
    }
}
