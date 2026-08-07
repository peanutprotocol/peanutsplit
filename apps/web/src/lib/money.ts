/**
 * Client-side money formatting and input parsing. Mirror image of
 * `src/server/money.ts`, but display-only: the client never derives balances, it
 * renders the minor-unit strings the API hands it.
 *
 * Amounts stay strings + BigInt everywhere except a NumberFlow display value
 * which has proved it can round-trip to the identical minor-unit integer.
 */

import { DEFAULT_LOCALE } from '@/i18n/locales'
import { CATALOG_BY_CODE, CURRENCY_CATALOG } from './currency-catalog'
import { formatWithCurrency } from './currency-rules'
import type { CurrencyInfo } from './api-types'

/** PostgreSQL BIGINT's positive ceiling. Money is stored as signed minor-unit
 * integers, so browser parsing must enforce the same boundary as the API. */
export const MAX_SIGNED_MINOR = 9_223_372_036_854_775_807n

/** Refuse an oversized integer before constructing a potentially enormous
 * BigInt. Comparing canonical decimal strings is exact and keeps uploaded CSV
 * cells on the same bounded path as interactive amounts. */
const parseBoundedUnsigned = (digits: string, maximum: bigint): bigint | null => {
    const canonical = digits.replace(/^0+(?=\d)/, '') || '0'
    const maximumText = maximum.toString()
    if (canonical.length > maximumText.length || (canonical.length === maximumText.length && canonical > maximumText))
        return null
    return BigInt(canonical)
}

/**
 * The catalog, in the bundle.
 *
 * It used to be twelve entries typed out by hand here, which is why a JPY room could flash a hero
 * balance 100x off: the client had no decimals for anything else until `/api/currencies` resolved.
 * Importing the generated table instead makes the decimals a build-time fact for all 162 codes,
 * and makes it impossible for the client's idea of a currency to drift from the server's.
 */
export const FALLBACK_CURRENCIES: readonly CurrencyInfo[] = CURRENCY_CATALOG

const UNKNOWN = (code: string): CurrencyInfo => ({ code, symbol: '', name: code, decimals: 2, hasRate: false })

/** Whether a code belongs to the generated real-currency catalog. Custom room
 *  tickers deliberately return false even though `currencyInfo` can still
 *  synthesize enough metadata to render them. */
export const isCatalogCode = (code: string): boolean => CATALOG_BY_CODE.has(code)

/** Look a currency up in the catalog, falling back to the bundled table and then
 *  to a 2-decimal placeholder — formatting must never throw mid-render. */
export function currencyInfo(code: string, catalog: readonly CurrencyInfo[] = FALLBACK_CURRENCIES): CurrencyInfo {
    return catalog.find((c) => c.code === code) ?? CATALOG_BY_CODE.get(code) ?? UNKNOWN(code)
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
export function parseAmountToMinor(
    input: string,
    decimals: number,
    locale?: string,
    maximum = MAX_SIGNED_MINOR
): string | null {
    // Eighteen covers every catalog currency and the 12dp manual-FX input. It
    // also prevents a hostile caller from turning padEnd/10** into unbounded work.
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) return null
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
        const wholeMinor = parseBoundedUnsigned(wholePart, maximum)
        if (wholeMinor === null) return null
        const rounded = wholeMinor + (roundUp ? 1n : 0n)
        return rounded <= maximum ? rounded.toString() : null
    }

    const padded = fraction.padEnd(decimals + 1, '0')
    const kept = padded.slice(0, decimals)
    const next = Number(padded[decimals] ?? '0')
    const minor = parseBoundedUnsigned(`${wholePart}${kept}`, maximum)
    if (minor === null) return null
    const rounded = next >= 5 ? minor + 1n : minor
    return rounded <= maximum ? rounded.toString() : null
}

/**
 * Parse a machine-exported amount without silently rounding source precision.
 *
 * A single separator followed by exactly three digits is inherently ambiguous
 * for a 3dp currency: `1,234` can mean either 1.234 KWD or 1,234.000 KWD. An
 * export with no locale metadata cannot choose safely, so that shape is
 * refused. Repeated canonical groups are unambiguous whole numbers. Mixed
 * grouping/decimal conventions remain supported, while a fractional part
 * longer than the currency allows is refused.
 */
export function parseExportAmountToMinor(input: string, decimals: number): string | null {
    const raw = input.trim().replace(/\s/g, '')
    if (!raw.includes('.') && !raw.includes(',')) return parseAmountToMinor(raw, decimals)

    const separatorCount = [...raw].filter((character) => character === '.' || character === ',').length
    const groupedWhole = /^[1-9]\d{0,2}(?:,\d{3})+$/.test(raw) || /^[1-9]\d{0,2}(?:\.\d{3})+$/.test(raw)

    if (groupedWhole) {
        if (separatorCount > 1 || decimals < 3) return parseAmountToMinor(raw.replace(/[.,]/g, ''), decimals)
        return null
    }

    const wholeWithZeroFraction = raw.match(/^(\d+)[.,](0+)$/)
    if (decimals === 0 && wholeWithZeroFraction) {
        return parseAmountToMinor(wholeWithZeroFraction[1], 0)
    }

    if (raw.includes('.') && raw.includes(',')) {
        const decimalSeparator = raw.lastIndexOf('.') > raw.lastIndexOf(',') ? '.' : ','
        const fraction = raw.slice(raw.lastIndexOf(decimalSeparator) + 1)
        if (decimals === 0) {
            if (!/^0*$/.test(fraction)) return null
        } else if (fraction.length > decimals) {
            return null
        }
        return parseAmountToMinor(raw, decimals)
    }

    if (separatorCount > 1) return null
    const separator = raw.includes('.') ? '.' : ','
    const fraction = raw.slice(raw.indexOf(separator) + 1)
    if (fraction.length > decimals || (decimals === 0 && !/^0*$/.test(fraction))) return null
    return parseAmountToMinor(raw, decimals)
}

/**
 * How many digits a half-typed amount may still be waiting for. Three is the
 * grouping width, and grouping is what needs the most: `1,234,` is only ever on
 * the way to `1,234,000`, and until the last of those three digits arrives no
 * completion of it parses. Every fraction in the catalog is shorter than that.
 */
const TYPEABLE_COMPLETIONS = ['', '0', '00', '000'] as const

/**
 * May an amount field hold this text WHILE it is being typed?
 *
 * `parseAmountToMinor` answers a different question — "is this an amount" — and
 * a field that only accepted its answers could never be typed into: "" and "12."
 * are both on the way to an amount without being one. So this asks whether the
 * text is a PREFIX of one: the same parser, run on the text as typed and then on
 * the text plus up to three digits, lets the keystroke through as soon as any of
 * those readings works. Nothing else decides: whatever no completion can rescue
 * (letters, a minus sign, more fraction digits than the currency has, a second
 * decimal mark, punctuation the parser will not guess at) is refused here too,
 * at the keystroke rather than as a validation error three fields later.
 *
 * Asking the parser only about the text and one trailing zero is what made
 * `1,234,567` impossible to type: `1,234,` and `1,234,5` are both mid-group, so
 * both readings failed and the field froze on the keystroke after `1,234`.
 *
 * An empty field is accepted — a share can be cleared, and blank means "not in
 * this split". Whitespace alone is not: it is on the way to nothing, and a field
 * holding it would read as filled while the parser sees no amount in it.
 */
export function isAmountInputAcceptable(
    input: string,
    decimals: number,
    locale?: string,
    maximum = MAX_SIGNED_MINOR
): boolean {
    if (input.length === 0) return true
    if (input.trim().length === 0) return false
    return TYPEABLE_COMPLETIONS.some(
        (completion) => parseAmountToMinor(`${input}${completion}`, decimals, locale, maximum) !== null
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

/** A sidecar for raw, caret-stable entry. Grouping starts being useful at five
 * whole digits; below that the preview would only repeat the field. */
export function formatLargeAmountPreview(
    minor: string,
    code: string,
    catalog?: readonly CurrencyInfo[],
    locale: string = DEFAULT_LOCALE
): string | null {
    const info = currencyInfo(code, catalog)
    try {
        const magnitude = BigInt(minor)
        const absolute = magnitude < 0n ? -magnitude : magnitude
        if (absolute < 10n ** BigInt(info.decimals + 4)) return null
        return formatMoney(minor, code, catalog, locale)
    } catch {
        return null
    }
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

/** The compact formatter is never handed to NumberFlow. It is the deliberately
 * approximate visual form for a constrained overview; the exact full string
 * stays beside it as the accessible name and title. */
type CompactMoneyFormat = Intl.NumberFormatOptions & {
    style: 'currency' | 'decimal'
}

/**
 * Does this currency print as a symbol, or as its code after the amount?
 *
 * ONE rule, and `currency-rules.ts` states it for both sides of the app: a symbol if it has one,
 * otherwise the code. 61 of the 162 catalog codes have no symbol and no custom ticker has one, so
 * the second branch is a third of the product rather than an edge case.
 *
 * Catalog membership is the wrong question to ask here, and asking it is the bug this replaces.
 * `Intl` does not check ISO 4217: given AED — a real currency with no symbol — it answers
 * `AED 12.34` while the server writes `12.34 AED`, and given the non-currency `DOG` it invents
 * `DOG 12.34` rather than refusing. A four-letter ticker it refuses outright, which used to drop
 * the currency from the amount entirely: `BEER 1234.00` printed as `1234.00`.
 *
 * The `isCurrencyCode` half stays because `Intl.NumberFormat` throws a RangeError on anything that
 * is not three letters; nothing with a symbol fails it, so it only ever guards the impossible.
 */
const printsSymbol = (info: CurrencyInfo): boolean => info.symbol !== '' && isCurrencyCode(info.code)

/**
 * The catalog's `decimals` always wins over the currency's Intl default. The API decides that a
 * JPY or COP room has no cents; letting Intl reintroduce them would print an amount that cannot
 * be typed back into the field.
 *
 * In the decimal branch this formats the NUMBER only — the code is not part of it. Callers that
 * hand these options straight to a formatter (`AnimatedMoney`) must add the code themselves.
 */
export function moneyFormatOptions(info: CurrencyInfo): MoneyFormat {
    const digits = { minimumFractionDigits: info.decimals, maximumFractionDigits: info.decimals }
    return printsSymbol(info)
        ? { style: 'currency', currency: info.code.toUpperCase(), ...digits }
        : { style: 'decimal', ...digits }
}

/**
 * Locale data owns the compact suffix (`M`, `mi`, `B`, spacing, and so on).
 * One fractional digit is enough to distinguish materially different overview
 * values without letting an abbreviated number grow back into a full one.
 * Currency minor-unit precision does not apply here: this is a rounded visual
 * summary, while the exact amount remains available to AT and in `title`.
 */
function compactMoneyFormatOptions(info: CurrencyInfo): CompactMoneyFormat {
    const compact = {
        notation: 'compact' as const,
        compactDisplay: 'short' as const,
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
    }
    return printsSymbol(info)
        ? { style: 'currency', currency: info.code.toUpperCase(), ...compact }
        : { style: 'decimal', ...compact }
}

/** What follows the digits when the currency has no symbol — '' when it has one. */
export const currencySuffix = (info: CurrencyInfo): string =>
    printsSymbol(info) ? '' : formatWithCurrency('', '', info)

/**
 * Formatters are expensive to construct and a room re-renders one per row per poll, so they are
 * memoised on everything that can change the output. The key set is tiny and bounded by
 * (locales × currencies), so it never needs eviction.
 */
const formatterCache = new Map<string, Intl.NumberFormat>()
const compactFormatterCache = new Map<string, Intl.NumberFormat>()

export function moneyFormatter(locale: string, info: CurrencyInfo): Intl.NumberFormat {
    const key = `${locale}|${info.code}|${info.decimals}`
    const cached = formatterCache.get(key)
    if (cached) return cached
    const formatter = new Intl.NumberFormat(locale, moneyFormatOptions(info))
    formatterCache.set(key, formatter)
    return formatter
}

function compactMoneyFormatter(locale: string, info: CurrencyInfo): Intl.NumberFormat {
    const key = `${locale}|${info.code}|compact`
    const cached = compactFormatterCache.get(key)
    if (cached) return cached
    const formatter = new Intl.NumberFormat(locale, compactMoneyFormatOptions(info))
    compactFormatterCache.set(key, formatter)
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
    const sign = plain.startsWith('-') ? '-' : ''
    const magnitude = sign ? plain.slice(1) : plain
    try {
        // With a symbol, Intl owns the whole string: it knows this locale puts the symbol in front
        // (`€12.34`) or behind (`12,34 €`), and that placement is the reason the twelve legacy
        // currencies still render exactly as they did.
        if (printsSymbol(info)) return moneyFormatter(locale, info).format(plain as unknown as number)
        // Without one, Intl only formats the digits and `formatWithCurrency` says where the code
        // goes — the same function the server formats with, so both sides print `12.34 AED`.
        return formatWithCurrency(sign, moneyFormatter(locale, info).format(magnitude as unknown as number), info)
    } catch {
        // An engine without string input. Formatting must never throw mid-render, so fall back to
        // ungrouped digits rather than losing the amount.
        return formatWithCurrency(sign, magnitude, info)
    }
}

/**
 * An abbreviated amount for a constrained overview. The input is still the
 * exact decimal string accepted by ECMA-402's ToIntlMathematicalValue; no JS
 * `number` sits between bigint minor units and locale formatting.
 */
export function formatCompactMoney(
    minor: string,
    code: string,
    catalog?: readonly CurrencyInfo[],
    locale: string = DEFAULT_LOCALE
): string {
    const info = currencyInfo(code, catalog)
    const plain = formatMinorPlain(minor, info.decimals)
    const sign = plain.startsWith('-') ? '-' : ''
    const magnitude = sign ? plain.slice(1) : plain
    try {
        if (printsSymbol(info)) return compactMoneyFormatter(locale, info).format(plain as unknown as number)
        return formatWithCurrency(
            sign,
            compactMoneyFormatter(locale, info).format(magnitude as unknown as number),
            info
        )
    } catch {
        // Compact notation is an enhancement. An older engine gets the exact
        // full value, never an invented abbreviation or a missing amount.
        return formatMoney(minor, code, catalog, locale)
    }
}

export type OverviewMoneyScale = 'regular' | 'smaller' | 'smallest'

export interface OverviewMoneyPresentation {
    /** Exact, locale-formatted text. Always the accessible name and title. */
    exact: string
    /** What a sighted reader sees on the constrained overview. */
    visible: string
    compact: boolean
    /** Typography gives way before precision does. */
    scale: OverviewMoneyScale
}

/** Past this many visible characters, shrinking again is less readable than
 * the locale's own compact notation. Detail views never call this helper. */
export const OVERVIEW_MONEY_COMPACT_AFTER = 12

const displayLength = (value: string): number => Array.from(value).length

export function overviewMoneyPresentation(
    minor: string,
    code: string,
    catalog?: readonly CurrencyInfo[],
    locale: string = DEFAULT_LOCALE
): OverviewMoneyPresentation {
    const exact = formatMoney(minor, code, catalog, locale)
    const exactLength = displayLength(exact)
    if (exactLength > OVERVIEW_MONEY_COMPACT_AFTER) {
        const visible = formatCompactMoney(minor, code, catalog, locale)
        return {
            exact,
            visible,
            compact: visible !== exact,
            scale: displayLength(visible) > 10 ? 'smaller' : 'regular',
        }
    }
    return {
        exact,
        visible: exact,
        compact: false,
        scale: exactLength > 10 ? 'smallest' : exactLength > 7 ? 'smaller' : 'regular',
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
        if (!printsSymbol(info)) {
            // The code is a suffix by construction — `formatWithCurrency` puts it there — so the
            // split is "everything but the last N characters", and rejoining is exact by the same
            // construction rather than by a second copy of the rule.
            const whole = formatMoney(minor, code, catalog, locale)
            return [
                { type: 'text', value: whole.slice(0, whole.length - info.code.length) },
                { type: 'currency', value: info.code },
            ]
        }
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

/**
 * Display-only gate for NumberFlow.
 *
 * A value may animate only if its major-unit Number scales back to the exact
 * bigint minor units. This is deliberately stronger than checking `isFinite`
 * and more accurate than checking the raw integer alone: dividing a large safe
 * integer by 100 can make two neighbouring cent values collapse onto the same
 * float. `null` means the caller must render exact static text instead.
 */
export function minorToExactNumber(minor: string, decimals: number): number | null {
    try {
        const exact = BigInt(minor)
        const scale = 10 ** decimals
        const value = Number(exact) / scale
        if (!Number.isFinite(value)) return null
        const roundTrip = value * scale
        // NumberFlow ultimately hands this value back to Intl as a Number. Even
        // exactly representable powers of two above MAX_SAFE_INTEGER can format
        // to a visibly different decimal integer, so keep the animation gate at
        // the safe-integer boundary as well as checking the exact round-trip.
        if (!Number.isFinite(roundTrip) || !Number.isSafeInteger(roundTrip)) return null
        return BigInt(Math.round(roundTrip)) === exact ? value : null
    } catch {
        return null
    }
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
