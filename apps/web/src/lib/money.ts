/**
 * Client-side money formatting and input parsing. Mirror image of
 * `src/server/money.ts`, but display-only: the client never derives balances, it
 * renders the minor-unit strings the API hands it.
 *
 * Amounts stay strings + BigInt everywhere except the NumberFlow display value,
 * which needs a JS number by construction.
 */

import { DEFAULT_LOCALE } from '@/i18n/locales'
import type { CurrencyInfo } from './api-types'

/**
 * The catalog, duplicated by value so the very first paint of a room can format
 * money before `/api/currencies` resolves. `useCurrencies()` seeds itself from
 * this and overwrites it with the server list.
 */
export const FALLBACK_CURRENCIES: readonly CurrencyInfo[] = [
    { code: 'USD', symbol: '$', name: 'US Dollar', decimals: 2 },
    { code: 'EUR', symbol: '€', name: 'Euro', decimals: 2 },
    { code: 'GBP', symbol: '£', name: 'British Pound', decimals: 2 },
    { code: 'ARS', symbol: '$', name: 'Argentine Peso', decimals: 2 },
    { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', decimals: 2 },
    { code: 'MXN', symbol: '$', name: 'Mexican Peso', decimals: 2 },
    { code: 'COP', symbol: '$', name: 'Colombian Peso', decimals: 0 },
    { code: 'CHF', symbol: 'CHF ', name: 'Swiss Franc', decimals: 2 },
    { code: 'THB', symbol: '฿', name: 'Thai Baht', decimals: 2 },
    { code: 'JPY', symbol: '¥', name: 'Japanese Yen', decimals: 0 },
    { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', decimals: 2 },
    { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', decimals: 2 },
] as const

const UNKNOWN = (code: string): CurrencyInfo => ({ code, symbol: '', name: code, decimals: 2 })

/** Look a currency up in the catalog, falling back to the static table and then
 *  to a 2-decimal placeholder — formatting must never throw mid-render. */
export function currencyInfo(code: string, catalog: readonly CurrencyInfo[] = FALLBACK_CURRENCIES): CurrencyInfo {
    return catalog.find((c) => c.code === code) ?? FALLBACK_CURRENCIES.find((c) => c.code === code) ?? UNKNOWN(code)
}

export const decimalsOf = (code: string, catalog?: readonly CurrencyInfo[]): number =>
    currencyInfo(code, catalog).decimals

/**
 * Normalise a typed amount to a single `.`-separated decimal, or null if what was typed is
 * genuinely ambiguous.
 *
 * The rule, which is a safety choice rather than a parsing convenience:
 *
 * - **Both separators present** — the LAST one is the decimal point and the other is grouping.
 *   `1.234,56` (pt-BR/es) and `1,234.56` (en) both mean the same amount, and there is no
 *   ambiguity left to guess about, so both are accepted.
 * - **One separator only** — it is a decimal point, always. `1.234` is one-point-two-three-four,
 *   never one thousand two hundred and thirty-four. Guessing "grouping" here is how a bill
 *   silently becomes a thousand times bigger, and the field shows exactly what was typed.
 * - **The same separator more than once** (`1.234.567`) — no decimal point can be identified
 *   without guessing which convention is in play, so it is refused outright.
 */
function normaliseDecimalInput(input: string): string | null {
    const raw = input.trim().replace(/\s/g, '')
    const dots = raw.split('.').length - 1
    const commas = raw.split(',').length - 1

    if (dots > 0 && commas > 0) {
        const decimalSeparator = raw.lastIndexOf('.') > raw.lastIndexOf(',') ? '.' : ','
        const grouping = decimalSeparator === '.' ? ',' : '.'
        // The decimal separator must be unambiguous even after the grouping marks come out:
        // "1.2.3,4" has no single reading and must fail rather than pick one.
        if ((decimalSeparator === '.' ? dots : commas) !== 1) return null
        return raw.split(grouping).join('').replace(decimalSeparator, '.')
    }

    return raw.replace(',', '.')
}

/**
 * "12.34" → "1234" (2dp). Accepts `.` or `,` as the decimal separator, and a mixed
 * grouping+decimal pair in either convention (see `normaliseDecimalInput`).
 *
 * Returns null for anything that isn't a non-negative amount.
 * Extra fraction digits round half-up.
 */
export function parseAmountToMinor(input: string, decimals: number): string | null {
    const raw = normaliseDecimalInput(input)
    if (raw === null) return null
    if (raw.length === 0) return null
    if (!/^\d*\.?\d*$/.test(raw)) return null
    if (raw === '.' || raw === '') return null

    const [whole, fraction = ''] = raw.split('.')
    const wholePart = whole === '' ? '0' : whole

    if (decimals === 0) {
        // Round half-up on the first fraction digit.
        const roundUp = fraction.length > 0 && Number(fraction[0]) >= 5
        return (BigInt(wholePart) + (roundUp ? 1n : 0n)).toString()
    }

    const padded = fraction.padEnd(decimals + 1, '0')
    const kept = padded.slice(0, decimals)
    const next = Number(padded[decimals] ?? '0')
    const minor = BigInt(wholePart) * 10n ** BigInt(decimals) + BigInt(kept === '' ? '0' : kept)
    return (next >= 5 ? minor + 1n : minor).toString()
}

/** "1234" → "12.34". No symbol, no grouping — this is what goes back into an input. */
export function formatMinorPlain(minor: string, decimals: number): string {
    const value = BigInt(minor)
    const negative = value < 0n
    const abs = negative ? -value : value
    if (decimals === 0) return `${negative ? '-' : ''}${abs.toString()}`
    const factor = 10n ** BigInt(decimals)
    const whole = (abs / factor).toString()
    const fraction = (abs % factor).toString().padStart(decimals, '0')
    return `${negative ? '-' : ''}${whole}.${fraction}`
}

/** ISO-4217 shape. `Intl.NumberFormat` throws a RangeError on anything else. */
const isCurrencyCode = (code: string): boolean => /^[A-Za-z]{3}$/.test(code)

/**
 * The catalog's `decimals` always wins over the currency's Intl default. The API decides that a
 * JPY or COP room has no cents; letting Intl reintroduce them would print an amount that cannot
 * be entered back into the field.
 */
export function moneyFormatOptions(info: CurrencyInfo): Intl.NumberFormatOptions {
    const digits = { minimumFractionDigits: info.decimals, maximumFractionDigits: info.decimals }
    return isCurrencyCode(info.code)
        ? { style: 'currency', currency: info.code.toUpperCase(), ...digits }
        : { style: 'decimal', ...digits }
}

/**
 * Formatters are expensive to construct and a room re-renders one per row per poll, so they are
 * memoised on everything that can change the output. The key set is tiny and bounded by
 * (locales × currencies), so it never needs eviction.
 */
const formatterCache = new Map<string, Intl.NumberFormat>()

export function moneyFormatter(locale: string, info: CurrencyInfo): Intl.NumberFormat {
    const key = `${locale}|${info.code}|${info.decimals}`
    const cached = formatterCache.get(key)
    if (cached) return cached
    const formatter = new Intl.NumberFormat(locale, moneyFormatOptions(info))
    formatterCache.set(key, formatter)
    return formatter
}

/**
 * "1234" + EUR → "€12.34" in English, "12,34 €" in Spanish. Separators, grouping and symbol
 * placement all come from the active locale — hardcoding English here while `NumberFlow` used
 * the *browser's* locale is what made the animated and static amounts disagree on the same row.
 *
 * The exact decimal string is handed to `Intl` rather than a float: `format()` accepts a numeric
 * string and formats it without going through a double, so a balance past 2^53 still prints
 * every digit it was given.
 */
export function formatMoney(
    minor: string,
    code: string,
    catalog?: readonly CurrencyInfo[],
    locale: string = DEFAULT_LOCALE
): string {
    const info = currencyInfo(code, catalog)
    const plain = formatMinorPlain(minor, info.decimals)
    try {
        return moneyFormatter(locale, info).format(plain as unknown as number)
    } catch {
        // An unknown code, or an engine without string input. Formatting must never throw
        // mid-render, so fall back to the pre-Intl shape rather than losing the amount.
        return plain.startsWith('-') ? `-${info.symbol}${plain.slice(1)}` : `${info.symbol}${plain}`
    }
}

/** Display-only: NumberFlow animates numbers, so the major-unit float is the
 *  one place a float is allowed near money. */
export function minorToNumber(minor: string, decimals: number): number {
    return Number(minor) / 10 ** decimals
}

export const isZeroMinor = (minor: string): boolean => {
    try {
        return BigInt(minor) === 0n
    } catch {
        return false
    }
}

export const addMinor = (values: readonly string[]): string =>
    values.reduce((total, value) => total + BigInt(value || '0'), 0n).toString()

/**
 * Base + remainder spread one unit at a time — the same rule the server uses, so
 * an EXACT drawer prefilled from an equal split starts life reconciled.
 * Display/prefill only: the authoritative maths lives on the server.
 */
export function equalSplitMinor(totalMinor: string, count: number): string[] {
    if (count <= 0) return []
    const total = BigInt(totalMinor)
    const base = total / BigInt(count)
    const remainder = total - base * BigInt(count)
    return Array.from({ length: count }, (_, index) => (base + (BigInt(index) < remainder ? 1n : 0n)).toString())
}
