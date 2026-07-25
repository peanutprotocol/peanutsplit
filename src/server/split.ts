/**
 * Share maths. Both modes guarantee the same invariant: the shares sum to the
 * room-currency total exactly, so balances always net to zero.
 */
import { convertMinorAtRate } from '@/server/money'

export interface ShareDraft {
    memberId: string
    /** Room currency, post-FX. */
    amountMinor: bigint
    /** EXACT only: verbatim in the expense currency, so a re-save can't drift. */
    enteredAmountMinor: bigint | null
}

export interface EnteredShare {
    memberId: string
    amountMinor: bigint
}

export const sumShares = (shares: readonly ShareDraft[]): bigint => shares.reduce((a, s) => a + s.amountMinor, 0n)

/** Spread `total` across the participants so the shares sum to it exactly — the
 *  first `remainder` participants absorb one extra minor unit each. */
export function equalShares(total: bigint, memberIds: readonly string[]): ShareDraft[] {
    if (memberIds.length === 0) throw new Error('an expense needs at least one participant')
    const n = BigInt(memberIds.length)
    const base = total / n
    const remainder = total % n
    return memberIds.map((memberId, i) => ({
        memberId,
        amountMinor: base + (BigInt(i) < remainder ? 1n : 0n),
        enteredAmountMinor: null,
    }))
}

/**
 * EXACT shares are typed in the EXPENSE currency and kept verbatim as
 * `enteredAmountMinor` — that round-trip is what lets the UI re-open a
 * foreign-currency expense and re-save it without the balances drifting.
 * `amountMinor` is the room-currency conversion, with the rounding residue
 * pushed onto the largest share.
 */
export function exactShares(
    entered: readonly EnteredShare[],
    expenseCurrency: string,
    baseCurrency: string,
    baseTotal: bigint,
    rate: number
): ShareDraft[] {
    if (entered.length === 0) throw new Error('an expense needs at least one participant')
    const converted = entered.map((s) => ({
        memberId: s.memberId,
        enteredAmountMinor: s.amountMinor,
        amountMinor: convertMinorAtRate(s.amountMinor, expenseCurrency, baseCurrency, rate),
    }))
    const residue = baseTotal - converted.reduce((a, s) => a + s.amountMinor, 0n)
    if (residue !== 0n) {
        let biggest = 0
        for (let i = 1; i < converted.length; i++) {
            if (converted[i].amountMinor > converted[biggest].amountMinor) biggest = i
        }
        converted[biggest].amountMinor += residue
    }
    return converted
}
