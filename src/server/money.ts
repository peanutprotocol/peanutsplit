/**
 * Minor-unit money primitives. Every amount is a BigInt count of minor units
 * (cents, satang, whole yen) — a float never touches money. The wire carries
 * these as decimal strings; see `serialize.ts`.
 */

export interface Currency {
    code: string
    symbol: string
    name: string
    decimals: number
    /** Indicative USD per 1 major unit — the static fallback rate table. */
    usdPerUnit: number
}

/** The 12 supported currencies (catalog + static fallback rates, ported verbatim
 *  from the reference mock). JPY and COP are zero-decimal — do not assume 2. */
export const CURRENCIES: readonly Currency[] = [
    { code: 'USD', symbol: '$', name: 'US Dollar', decimals: 2, usdPerUnit: 1 },
    { code: 'EUR', symbol: '€', name: 'Euro', decimals: 2, usdPerUnit: 1.08 },
    { code: 'GBP', symbol: '£', name: 'British Pound', decimals: 2, usdPerUnit: 1.27 },
    { code: 'ARS', symbol: '$', name: 'Argentine Peso', decimals: 2, usdPerUnit: 0.00097 },
    { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', decimals: 2, usdPerUnit: 0.18 },
    { code: 'MXN', symbol: '$', name: 'Mexican Peso', decimals: 2, usdPerUnit: 0.05 },
    { code: 'COP', symbol: '$', name: 'Colombian Peso', decimals: 0, usdPerUnit: 0.00025 },
    { code: 'CHF', symbol: 'CHF ', name: 'Swiss Franc', decimals: 2, usdPerUnit: 1.12 },
    { code: 'THB', symbol: '฿', name: 'Thai Baht', decimals: 2, usdPerUnit: 0.028 },
    { code: 'JPY', symbol: '¥', name: 'Japanese Yen', decimals: 0, usdPerUnit: 0.0064 },
    { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', decimals: 2, usdPerUnit: 0.65 },
    { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', decimals: 2, usdPerUnit: 0.73 },
] as const

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]))

export const CURRENCY_CODES: readonly string[] = CURRENCIES.map((c) => c.code)

/** Public catalog shape — the static `usdPerUnit` is an implementation detail. */
export const publicCurrencies = () =>
    CURRENCIES.map(({ code, symbol, name, decimals }) => ({ code, symbol, name, decimals }))

export function currency(code: string): Currency {
    const c = BY_CODE.get(code)
    if (!c) throw new Error(`unknown currency ${code}`)
    return c
}

export const decimalsOf = (code: string): number => currency(code).decimals

/** Rates are held as integers scaled to 9dp so conversion stays in BigInt. */
export const RATE_SCALE = 1_000_000_000n

/**
 * Convert minor units between currencies at `rate` (major units of `to` per 1
 * major unit of `from`), rounding half-up on the absolute value so negative
 * amounts round symmetrically.
 */
export function convertMinorAtRate(amountMinor: bigint, from: string, to: string, rate: number): bigint {
    if (from === to) return amountMinor
    const scaledRate = BigInt(Math.round(rate * Number(RATE_SCALE)))
    const num = amountMinor * scaledRate * 10n ** BigInt(decimalsOf(to))
    const den = RATE_SCALE * 10n ** BigInt(decimalsOf(from))
    const neg = num < 0n
    const abs = neg ? -num : num
    const q = (abs + den / 2n) / den
    return neg ? -q : q
}

/** Parse a wire amount ("1234") into minor units. Throws on anything else. */
export function parseMinor(value: string | number | bigint): bigint {
    if (typeof value === 'bigint') return value
    const raw = String(value).trim()
    if (!/^-?\d+$/.test(raw)) throw new Error(`invalid minor amount: ${raw}`)
    return BigInt(raw)
}

/** "1234" + EUR → "€12.34". Zero-decimal currencies get no separator. */
export function formatMinor(amountMinor: bigint, code: string): string {
    const c = currency(code)
    const neg = amountMinor < 0n
    const abs = neg ? -amountMinor : amountMinor
    const sign = neg ? '-' : ''
    if (c.decimals === 0) return `${sign}${c.symbol}${abs.toString()}`
    const factor = 10n ** BigInt(c.decimals)
    const whole = abs / factor
    const frac = (abs % factor).toString().padStart(c.decimals, '0')
    return `${sign}${c.symbol}${whole.toString()}.${frac}`
}
