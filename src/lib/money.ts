/**
 * Client-side money formatting and input parsing. Mirror image of
 * `src/server/money.ts`, but display-only: the client never derives balances, it
 * renders the minor-unit strings the API hands it.
 *
 * Amounts stay strings + BigInt everywhere except the NumberFlow display value,
 * which needs a JS number by construction.
 */

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
 * "12.34" → "1234" (2dp), "1.234" → "1234" (0dp… no: 0dp means "1" → "1").
 * Accepts `,` as the decimal separator and strips spaces and thousands dots are
 * NOT stripped — ambiguity there loses money silently, so "1.234" with 2
 * decimals is one euro twenty-three, and the field shows what you typed.
 *
 * Returns null for anything that isn't a non-negative amount.
 * Extra fraction digits round half-up.
 */
export function parseAmountToMinor(input: string, decimals: number): string | null {
    const raw = input.trim().replace(/\s/g, '').replace(',', '.')
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

/** "1234" + EUR → "€12.34". Zero-decimal currencies get no separator. */
export function formatMoney(minor: string, code: string, catalog?: readonly CurrencyInfo[]): string {
    const info = currencyInfo(code, catalog)
    const plain = formatMinorPlain(minor, info.decimals)
    return plain.startsWith('-') ? `-${info.symbol}${plain.slice(1)}` : `${info.symbol}${plain}`
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
