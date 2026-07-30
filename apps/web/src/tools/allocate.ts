/**
 * Dividing a total into whole minor units that add back up to it.
 *
 * Every tool on the site ends in this function, so it is the one piece of arithmetic worth being
 * strict about: a rent page whose three shares add up to a penny less than the rent is a page that
 * loses an argument in a kitchen.
 *
 * **Largest remainder.** Each person's exact share is floored, and the cents left over are handed
 * out one each, largest fractional part first. Ties go to the earlier row, so the same inputs
 * always produce the same output — a split that moves when nothing moved is worse than a split
 * that is one cent lopsided. The rule is stated on every tool page (§8.3, show the derivation) and
 * answered in an FAQ, because "why is Ana paying a cent more" is a real question.
 *
 * The alternative was rounding each share and letting the total drift, which is what a spreadsheet
 * does. It is why spreadsheets are off by four cents.
 */

/** The largest total this arithmetic is exact for — beyond it, doubles stop counting whole cents. */
export const MAX_SAFE_MINOR = Number.MAX_SAFE_INTEGER

/**
 * Split `totalMinor` across `weights`, exactly.
 *
 * Weights are proportions of any scale: room sizes, shares, blended percentages. A weight that is
 * negative, `NaN` or infinite counts as zero, because a tool must not be able to hand this a value
 * a text input produced. Weights that are all zero fall back to an equal split — the reader who has
 * not typed any room sizes yet is asking for the equal answer, not for an error.
 *
 * Negative totals are split by sign rather than refused, so the function stays total-preserving for
 * every input it accepts.
 */
export function allocateByWeights(totalMinor: number, weights: readonly number[]): number[] {
    if (weights.length === 0) return []

    const total = Math.trunc(totalMinor)
    if (total < 0) return allocateByWeights(-total, weights).map((share) => -share)

    const safe = weights.map((weight) => (Number.isFinite(weight) && weight > 0 ? weight : 0))
    const sum = safe.reduce((running, weight) => running + weight, 0)
    // No weights at all is the empty form, not a failure: divide it equally.
    const basis = sum > 0 ? safe : safe.map(() => 1)
    const basisSum = basis.reduce((running, weight) => running + weight, 0)

    const exact = basis.map((weight) => (total * weight) / basisSum)
    const shares = exact.map((value) => Math.floor(value))
    const remainder = total - shares.reduce((running, share) => running + share, 0)

    // Sorted on a copy of the fractions, and by index where they tie: the order has to be a
    // property of the numbers rather than of the sort implementation.
    const byFraction = exact
        .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
        .sort((a, b) => b.fraction - a.fraction || a.index - b.index)

    for (let given = 0; given < remainder; given += 1) {
        shares[byFraction[given % byFraction.length].index] += 1
    }
    return shares
}

/** Trims a proportion to one decimal place of a percentage — "24.5%". Never money. */
export function formatShareOfWhole(part: number, whole: number): string {
    if (!(whole > 0)) return '0%'
    const percent = (part / whole) * 100
    return `${Number(percent.toFixed(1))}%`
}

/** "18" not "18.0", "1.5" not "1.500". Row details print counts, sizes and shares, never money. */
export function formatFigure(value: number): string {
    if (!Number.isFinite(value)) return '0'
    return `${Number(value.toFixed(2))}`
}
