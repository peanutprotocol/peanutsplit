/**
 * Share maths. Every mode guarantees the same invariant: the shares sum to the
 * room-currency total exactly, so balances always net to zero.
 */
import { decimalsOf, RATE_SCALE, scaleRate } from '@/server/money'

export interface ShareDraft {
    memberId: string
    /** Room currency, post-FX. */
    amountMinor: bigint
    /** EXACT only: verbatim in the expense currency, so a re-save can't drift. */
    enteredAmountMinor: bigint | null
    /** PERCENTAGE basis points or SHARES relative weight. Null for EQUAL/EXACT. */
    splitWeight: bigint | null
}

export interface EnteredShare {
    memberId: string
    amountMinor: bigint
}

export interface WeightedShare {
    memberId: string
    weight: bigint
}

export const sumShares = (shares: readonly ShareDraft[]): bigint => shares.reduce((a, s) => a + s.amountMinor, 0n)

interface ApportionPart {
    memberId: string
    enteredAmountMinor: bigint | null
    splitWeight: bigint | null
    /** Exact rational numerator before division by the shared denominator. */
    numerator: bigint
}

/**
 * Turn non-negative rational parts with one shared denominator into integer
 * minor units that add up to `total`.
 *
 * Every part starts at its quotient (round down), then the remaining units go
 * to the largest fractional remainders. Input order breaks ties, which makes
 * retries and untouched edits byte-for-byte deterministic. Equal splitting and
 * foreign EXACT conversion both use this one rule so neither can grow its own
 * subtly different idea of where a rounding cent belongs.
 */
function apportionMinor(total: bigint, denominator: bigint, parts: readonly ApportionPart[]): ShareDraft[] {
    if (parts.length === 0) throw new Error('an expense needs at least one participant')
    if (total < 0n || denominator <= 0n || parts.some((part) => part.numerator < 0n))
        throw new Error('shares cannot be negative')

    const apportioned = parts.map((part, index) => ({
        memberId: part.memberId,
        enteredAmountMinor: part.enteredAmountMinor,
        splitWeight: part.splitWeight,
        amountMinor: part.numerator / denominator,
        remainder: part.numerator % denominator,
        index,
    }))
    const floors = apportioned.reduce((sum, part) => sum + part.amountMinor, 0n)
    const residue = total - floors

    // Each rational part can absorb at most one unit above its floor. Anything
    // outside that range means the caller mixed a total, denominator or rate.
    if (residue < 0n || residue > BigInt(apportioned.length))
        throw new Error('shares cannot reconcile to the expense total')

    const byRemainder = [...apportioned].sort((a, b) =>
        a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1
    )
    for (let i = 0; i < Number(residue); i++) byRemainder[i].amountMinor += 1n

    return apportioned.map(({ memberId, enteredAmountMinor, splitWeight, amountMinor }) => ({
        memberId,
        enteredAmountMinor,
        splitWeight,
        amountMinor,
    }))
}

/** Spread `total` across the participants so the shares sum to it exactly — the
 *  first `remainder` participants absorb one extra minor unit each. */
export function equalShares(total: bigint, memberIds: readonly string[]): ShareDraft[] {
    return apportionMinor(
        total,
        BigInt(memberIds.length),
        memberIds.map((memberId) => ({ memberId, enteredAmountMinor: null, splitWeight: null, numerator: total }))
    )
}

/** Apportion a room-currency total by positive integer weights. PERCENTAGE uses
 *  this with a fixed denominator of 10000 basis points; SHARES uses the sum of
 *  its arbitrary relative weights. Largest remainder is deterministic by input
 *  order when fractional remainders tie. */
export function weightedShares(total: bigint, entered: readonly WeightedShare[]): ShareDraft[] {
    if (entered.length === 0) throw new Error('an expense needs at least one participant')
    if (entered.some((share) => share.weight <= 0n)) throw new Error('split weights must be positive')

    const denominator = entered.reduce((sum, share) => sum + share.weight, 0n)
    return apportionMinor(
        total,
        denominator,
        entered.map((share) => ({
            memberId: share.memberId,
            enteredAmountMinor: null,
            splitWeight: share.weight,
            numerator: total * share.weight,
        }))
    )
}

/**
 * EXACT shares are typed in the EXPENSE currency and kept verbatim as
 * `enteredAmountMinor` — that round-trip is what lets the UI re-open a
 * foreign-currency expense and re-save it without the balances drifting.
 * `amountMinor` is the room-currency conversion. Each share starts at its exact
 * conversion rounded down; the converted total's remaining minor units then go
 * to the largest fractional remainders. Unlike independently rounding every
 * share and subtracting drift from one row, this can never make a share negative.
 */
export function exactShares(
    entered: readonly EnteredShare[],
    expenseCurrency: string,
    baseCurrency: string,
    baseTotal: bigint,
    rate: number
): ShareDraft[] {
    if (entered.length === 0) throw new Error('an expense needs at least one participant')

    // Character-identical arithmetic to convertMinorAtRate. buildExpense made
    // `baseTotal` with the same rate, so these quotients and remainders describe
    // the exact rational value that total rounded from.
    const scaledRate = expenseCurrency === baseCurrency ? RATE_SCALE : scaleRate(rate)
    const numeratorScale = scaledRate * 10n ** BigInt(decimalsOf(baseCurrency))
    const denominator = RATE_SCALE * 10n ** BigInt(decimalsOf(expenseCurrency))

    return apportionMinor(
        baseTotal,
        denominator,
        entered.map((share) => ({
            memberId: share.memberId,
            enteredAmountMinor: share.amountMinor,
            splitWeight: null,
            numerator: share.amountMinor * numeratorScale,
        }))
    )
}
