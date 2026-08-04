import { formatAmountInput, formatMinorPlain, isAmountInputAcceptable, parseAmountToMinor } from './money'

/** Expense.fxRate is Decimal(24,12): twelve digits on either side of the decimal mark. */
export const MANUAL_FX_RATE_DECIMALS = 12
export const MANUAL_FX_RATE_MAX_LENGTH = 25
const MANUAL_FX_RATE_SCALE = 10n ** BigInt(MANUAL_FX_RATE_DECIMALS)
const MANUAL_FX_RATE_MAX_SCALED = 999_999_999_999n * MANUAL_FX_RATE_SCALE
export const MAX_SIGNED_MINOR = 9_223_372_036_854_775_807n

const parseManualFxRateScaled = (input: string, locale?: string): bigint | null => {
    const scaled = parseAmountToMinor(input, MANUAL_FX_RATE_DECIMALS, locale)
    if (scaled === null) return null
    const value = BigInt(scaled)
    return value > 0n && value <= MANUAL_FX_RATE_MAX_SCALED ? value : null
}

/**
 * Editable, locale-aware rate text -> the API's positive plain-decimal string.
 *
 * Going through integer 10^-12 units avoids floating-point drift and gives the field exactly the
 * same precision as Expense.fxRate. The canonical result has no grouping, sign or exponent and no
 * insignificant zeroes, so a locale such as pt-BR can type `0,25` while the wire still receives
 * `0.25`.
 */
export function parseManualFxRateInput(input: string, locale?: string): string | null {
    const scaled = parseManualFxRateScaled(input, locale)
    if (scaled === null) return null

    const fixed = formatMinorPlain(scaled.toString(), MANUAL_FX_RATE_DECIMALS)
    const [whole, fraction = ''] = fixed.split('.')
    if (whole.length > MANUAL_FX_RATE_DECIMALS) return null

    const trimmedFraction = fraction.replace(/0+$/, '')
    return trimmedFraction ? `${whole}.${trimmedFraction}` : whole
}

/** Can the input hold this value while somebody is still typing it? */
export function isManualFxRateInputAcceptable(input: string, locale?: string): boolean {
    if (input.length > MANUAL_FX_RATE_MAX_LENGTH) return false
    return isAmountInputAcceptable(input, MANUAL_FX_RATE_DECIMALS, locale)
}

/** A frozen wire rate -> compact text using the active locale's decimal mark. */
export function formatManualFxRateInput(rate: string, locale: string): string {
    const canonical = parseManualFxRateInput(rate)
    if (!canonical) return ''
    const scaled = parseAmountToMinor(canonical, MANUAL_FX_RATE_DECIMALS) as string
    const fixed = formatAmountInput(scaled, MANUAL_FX_RATE_DECIMALS, locale)
    const decimalMark = fixed.includes(',') ? ',' : '.'
    const decimalAt = fixed.lastIndexOf(decimalMark)
    if (decimalAt < 0) return fixed
    const whole = fixed.slice(0, decimalAt)
    const fraction = fixed.slice(decimalAt + 1).replace(/0+$/, '')
    return fraction ? `${whole}${decimalMark}${fraction}` : whole
}

/**
 * Exact manual conversion result. `invalid` is total and render-safe: malformed strings never
 * reach `BigInt`, and no path needs `Number`, exponent notation, or floating-point rounding.
 */
export type ManualFxConversion =
    { status: 'ok'; minor: string } | { status: 'invalid' } | { status: 'zero' } | { status: 'overflow' }

/**
 * Convert expense minor units at a canonical manual rate, half-up, entirely in scaled integers.
 *
 * This is the manual branch of the server's conversion equation. A 12dp rate is already exactly
 * what the ledger stores, so extending it through a JavaScript `number` would only discard digits:
 *
 *     amountMinor * rate(1e12) * 10^roomDecimals
 *     ------------------------------------------------
 *             1e12 * 10^expenseDecimals
 *
 * The result is also the preflight boundary for both online save and offline enqueue. Zero and a
 * value outside PostgreSQL signed BIGINT are not previews; they are local validation failures.
 */
export function convertMinorAtManualRate(
    amountMinor: string,
    rate: string,
    expenseDecimals: number,
    roomDecimals: number
): ManualFxConversion {
    if (!/^\d+$/.test(amountMinor)) return { status: 'invalid' }
    const amount = BigInt(amountMinor)
    if (amount <= 0n) return { status: 'invalid' }
    if (amount > MAX_SIGNED_MINOR) return { status: 'overflow' }
    if (!Number.isInteger(expenseDecimals) || expenseDecimals < 0) return { status: 'invalid' }
    if (!Number.isInteger(roomDecimals) || roomDecimals < 0) return { status: 'invalid' }

    const rateScaled = parseManualFxRateScaled(rate)
    if (rateScaled === null) return { status: 'invalid' }

    const numerator = amount * rateScaled * 10n ** BigInt(roomDecimals)
    const denominator = MANUAL_FX_RATE_SCALE * 10n ** BigInt(expenseDecimals)
    const converted = (numerator + denominator / 2n) / denominator

    if (converted === 0n) return { status: 'zero' }
    if (converted > MAX_SIGNED_MINOR) return { status: 'overflow' }
    return { status: 'ok', minor: converted.toString() }
}
