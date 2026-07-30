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
 * - **One separator with a UI locale** — locale-conventional three-digit grouping is accepted;
 *   other single-separator input is treated as a decimal-keyboard fallback. The caller then
 *   rewrites accepted grouping to ungrouped text on blur so the interpretation is visible.
 * - **One separator without a UI locale** — it remains a decimal point for backwards-compatible
 *   import parsing.
 * - **The same separator more than once** (`1.234.567`) — accepted only when it is valid grouping
 *   for the active UI locale; otherwise refused.
 */
function normaliseDecimalInput(input: string, locale?: string): string | null {
    const raw = input.trim().replace(/\s/g, '')
    const hasDot = raw.includes('.')
    const hasComma = raw.includes(',')

    if (hasDot && hasComma) {
        const decimalSeparator = raw.lastIndexOf('.') > raw.lastIndexOf(',') ? '.' : ','
        const cut = raw.lastIndexOf(decimalSeparator)
        const whole = raw.slice(0, cut)
        const fraction = raw.slice(cut + 1)
        /**
         * The remaining separators only get stripped if they are actually grouping: one to three
         * digits beginning with 1–9, then groups of exactly three. A leading group such as
         * `0,123` is not canonical grouping: accepting it would turn a plausible fractional
         * entry into a number one thousand times larger. Without these checks, "1.2.3,4"
         * would quietly become 123.4 — the parser would have invented a number nobody typed
         * rather than refusing one it cannot read.
         */
        const grouped = decimalSeparator === '.' ? /^[1-9]\d{0,2}(,\d{3})+$/ : /^[1-9]\d{0,2}(\.\d{3})+$/
        if (!grouped.test(whole)) return null
        if (!/^\d*$/.test(fraction)) return null
        return `${whole.replace(/[.,]/g, '')}.${fraction}`
    }

    if (locale && (hasDot || hasComma)) {
        const separator = hasDot ? '.' : ','
        const escaped = separator === '.' ? '\\.' : ','
        const localeUsesCommaDecimal = locale.toLowerCase().startsWith('es') || locale.toLowerCase().startsWith('pt')
        const decimalSeparator = localeUsesCommaDecimal ? ',' : '.'
        const groupingSeparator = localeUsesCommaDecimal ? '.' : ','
        const grouped = new RegExp(`^[1-9]\\d{0,2}(${escaped}\\d{3})+$`)

        /**
         * The active locale resolves the `1,234` ambiguity without guessing:
         * English reads it as a grouped whole, Spanish and Portuguese read the
         * matching `1.234` shape the same way. A separator that cannot be valid
         * grouping (`12,34` in English) remains a decimal-keyboard fallback.
         */
        if (separator === groupingSeparator && grouped.test(raw)) return raw.replace(/[.,]/g, '')

        // More than one identical separator is only valid as locale grouping.
        if (raw.indexOf(separator) !== raw.lastIndexOf(separator)) return null

        if (separator === decimalSeparator || separator === groupingSeparator) {
            return raw.replace(separator, '.')
        }
    }

    return raw.replace(',', '.')
}

/**
 * "12.34" → "1234" (2dp). Accepts `.` or `,` as the decimal separator, and a mixed
 * grouping+decimal pair in either convention (see `normaliseDecimalInput`).
 *
 * Returns null for anything that isn't a non-negative amount. Interactive callers
 * pass a locale and reject extra fraction digits; legacy import callers omit it
 * and keep deterministic half-up rounding.
 */
export function parseAmountToMinor(input: string, decimals: number, locale?: string): string | null {
    const raw = normaliseDecimalInput(input, locale)
    if (raw === null) return null
    if (raw.length === 0) return null
    if (!/^\d*\.?\d*$/.test(raw)) return null
    if (raw === '.' || raw === '') return null

    const [whole, fraction = ''] = raw.split('.')
    const wholePart = whole === '' ? '0' : whole

    // Interactive input must never round behind the value still visible in the
    // field. Batch/import callers omit locale and retain the historical
    // deterministic half-up rule for source data with extra precision.
    if (locale && fraction.length > decimals) return null

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

/**
 * May an amount field hold this text WHILE it is being typed?
 *
 * `parseAmountToMinor` answers a different question — "is this an amount" — and
 * a field that only accepted its answers could never be typed into: "" and "12."
 * are both on the way to an amount without being one. So this asks the same
 * parser twice, once as typed and once with a trailing zero, and lets the
 * keystroke through if either reading works. Nothing else decides: whatever the
 * parser refuses for good (letters, a minus sign, more fraction digits than the
 * currency has, punctuation it will not guess at) is refused here too, at the
 * keystroke rather than as a validation error three fields later.
 */
export function isAmountInputAcceptable(input: string, decimals: number, locale?: string): boolean {
    if (input.trim().length === 0) return true
    return (
        parseAmountToMinor(input, decimals, locale) !== null ||
        parseAmountToMinor(`${input}0`, decimals, locale) !== null
    )
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

/** Canonical text for an interactive amount field in the active locale. This is
 * deliberately ungrouped: a value normalised on blur must become easier to
 * inspect, not return with the same punctuation that needed interpretation. */
export function formatAmountInput(minor: string, decimals: number, locale: string): string {
    const plain = formatMinorPlain(minor, decimals)
    const usesCommaDecimal = locale.toLowerCase().startsWith('es') || locale.toLowerCase().startsWith('pt')
    return usesCommaDecimal ? plain.replace('.', ',') : plain
}

/** ISO-4217 shape. `Intl.NumberFormat` throws a RangeError on anything else. */
const isCurrencyCode = (code: string): boolean => /^[A-Za-z]{3}$/.test(code)

/**
 * Narrower than `Intl.NumberFormatOptions` on purpose: NumberFlow accepts only a subset (no
 * `notation: 'scientific'`, for one), and the whole point of this helper is that the animated
 * and static paths can be handed the *same* object.
 */
export interface MoneyFormat {
    style: 'currency' | 'decimal'
    currency?: string
    minimumFractionDigits: number
    maximumFractionDigits: number
}

/**
 * The catalog's `decimals` always wins over the currency's Intl default. The API decides that a
 * JPY or COP room has no cents; letting Intl reintroduce them would print an amount that cannot
 * be typed back into the field.
 */
export function moneyFormatOptions(info: CurrencyInfo): MoneyFormat {
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

/**
 * One run of the formatted amount. `currency` is the symbol (or code) Intl chose and is the only
 * part worth styling apart; everything else — digits, separators, the non-breaking space some
 * locales put between them — is merged into `text` runs so the caller never has to reason about
 * Intl's part vocabulary.
 */
export interface MoneyPart {
    type: 'currency' | 'text'
    value: string
}

/**
 * `formatMoney`, split so the symbol can be rendered as its own object rather than as three
 * characters of the number.
 *
 * Deliberately built from `formatToParts` rather than by string-searching for the symbol: `$` is
 * the symbol of four catalog currencies, symbol placement flips between locales (`€12.34` vs
 * `12,34 €`), and a search would eventually find the `$` inside an amount rather than in front
 * of it. If the engine cannot take a decimal string here, the whole amount comes back as one
 * `text` run — degraded styling, never a lost or wrong number.
 */
export function formatMoneyParts(
    minor: string,
    code: string,
    catalog?: readonly CurrencyInfo[],
    locale: string = DEFAULT_LOCALE
): MoneyPart[] {
    const info = currencyInfo(code, catalog)
    const plain = formatMinorPlain(minor, info.decimals)
    try {
        const merged: MoneyPart[] = []
        for (const part of moneyFormatter(locale, info).formatToParts(plain as unknown as number)) {
            const type: MoneyPart['type'] = part.type === 'currency' ? 'currency' : 'text'
            const last = merged[merged.length - 1]
            if (last && last.type === type) last.value += part.value
            else merged.push({ type, value: part.value })
        }
        if (merged.length > 0) return merged
    } catch {
        // Same contract as formatMoney: formatting never throws mid-render.
    }
    return [{ type: 'text', value: formatMoney(minor, code, catalog, locale) }]
}

/**
 * The symbol as a standalone label, or '' when it would only repeat the code. The catalog gives
 * CHF the symbol `CHF ` — rendering "CHF CHF" in a picker row is the kind of detail that makes a
 * currency look like a string rather than a thing.
 */
export const displaySymbol = (info: CurrencyInfo): string => {
    const symbol = info.symbol.trim()
    return symbol === info.code ? '' : symbol
}

/**
 * "BRL" → "Brazilian Real" in English, "real brasileño" in Spanish.
 *
 * `Intl.DisplayNames` is not universally implemented (and `type: 'currency'` less so than the
 * rest), and it answers with the code itself for anything it has no name for — both of which are
 * indistinguishable from success unless checked. So: try it, reject an answer that is just the
 * code back, and fall through to the catalog's English name and finally the bare code. A picker
 * row that says "BRL — BRL" is worse than one that says "BRL — Brazilian Real" in the wrong
 * language.
 */
const displayNamesCache = new Map<string, Intl.DisplayNames | null>()

function currencyDisplayNames(locale: string): Intl.DisplayNames | null {
    const cached = displayNamesCache.get(locale)
    if (cached !== undefined) return cached
    let instance: Intl.DisplayNames | null = null
    try {
        instance = new Intl.DisplayNames([locale], { type: 'currency' })
    } catch {
        instance = null
    }
    displayNamesCache.set(locale, instance)
    return instance
}

export function currencyDisplayName(
    code: string,
    locale: string = DEFAULT_LOCALE,
    catalog?: readonly CurrencyInfo[]
): string {
    const info = currencyInfo(code, catalog)
    if (isCurrencyCode(code)) {
        try {
            const named = currencyDisplayNames(locale)?.of(code.toUpperCase())
            if (named && named.toUpperCase() !== code.toUpperCase()) return named
        } catch {
            // Fall through to the catalog name.
        }
    }
    return info.name || code
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
