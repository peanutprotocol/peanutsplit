/**
 * Minor-unit money primitives. Every amount is a BigInt count of minor units
 * (cents, satang, whole yen) — a float never touches money. The wire carries
 * these as decimal strings; see `serialize.ts`.
 */

import { CATALOG_BY_CODE, CURRENCY_CATALOG, type CatalogCurrency } from '@/lib/currency-catalog'
import { canPrice, formatWithCurrency } from '@/lib/currency-rules'

export type Currency = CatalogCurrency

/**
 * Indicative USD per 1 major unit, hand-maintained and rotting, for the 12 codes every existing
 * room uses. Deliberately not the whole catalog: 162 committed numbers is 162 numbers nobody will
 * ever update, and a stale rate that looks authoritative is worse than an honest gap. Everything
 * outside this table has no static rate and fails loudly instead.
 */
export const STATIC_USD_PER_UNIT: Readonly<Record<string, number>> = {
    USD: 1,
    EUR: 1.08,
    GBP: 1.27,
    ARS: 0.00097,
    BRL: 0.18,
    MXN: 0.05,
    COP: 0.00025,
    CHF: 1.12,
    THB: 0.028,
    JPY: 0.0064,
    AUD: 0.65,
    CAD: 0.73,
}

/** PostgreSQL BIGINT's positive ceiling. Public money writes are positive, but
 *  every amount still has to fit the signed column it will be stored in. */
export const MAX_SIGNED_MINOR = 9_223_372_036_854_775_807n

/** How many minor units a code outside the catalog has. Two is part of the invented-currency
 *  contract: parse, format, exact shares, and manual conversion all use it consistently, so
 *  `100` always means one whole BEER rather than changing meaning between surfaces. */
export const CUSTOM_DECIMALS = 2

/** A code is three or four uppercase ASCII letters. `[A-Z]` is ASCII by construction, which is
 *  also the homoglyph answer: Cyrillic `С` and Greek `Ε` are not compatibility-equivalent to their
 *  Latin twins, so NFKC leaves them alone and this class refuses them. */
const CODE_SHAPE = /^[A-Z]{3,4}$/

/** NFKC, trim, uppercase — so `usd`, `  eur  ` and the fullwidth `ＵＳＤ` are all the one string
 *  their currency is stored under, and there is no second spelling to spoof. */
export const normaliseCode = (input: string): string => input.normalize('NFKC').trim().toUpperCase()

/** Is this a code at all — real or invented? Normalises first, so callers cannot disagree about
 *  whether they were meant to. */
export const isValidCode = (code: string): boolean => CODE_SHAPE.test(normaliseCode(code))

/** Is this a real currency? The only way to ask. */
export const isCatalogCode = (code: string): boolean => CATALOG_BY_CODE.has(code)

/** The public catalog, as `/api/currencies` serves it. Static: `hasRate` says the feed carries
 *  the code, which is a property of the generated table and not of the live rate cache. */
export const publicCurrencies = (): readonly Currency[] => CURRENCY_CATALOG

/**
 * TOTAL — this never throws.
 *
 * A code that is not in the catalog is a custom ticker: no symbol, its own code as its name, and
 * `CUSTOM_DECIMALS`. Validation gates what can enter, FX gates what can convert, and formatting
 * must not be the third gate — a room holding a legal code the catalog does not know still has to
 * render.
 */
export function currency(code: string): Currency {
    return CATALOG_BY_CODE.get(code) ?? { code, name: code, symbol: '', decimals: CUSTOM_DECIMALS, hasRate: false }
}

export const decimalsOf = (code: string): number => currency(code).decimals

/** Can an amount in `from` be automatically priced into `to`? Catalog-level, so the picker and
 *  receipt parser can ask it without a rate table. Invented expense currencies use the separate
 *  explicit manual-rate contract; `rateFrom` remains the automatic-FX gate. */
export const canPriceCode = (from: string, to: string): boolean => canPrice(currency(from), currency(to))

/**
 * Rates are held as integers scaled to 18dp so conversion stays in BigInt.
 *
 * 9dp was sized for 12 currencies, where the smallest cross rate is ~2e-4. Across the 162 it is
 * IRR→KWD at ~2.4e-7, which at 9dp scales to 242 — three significant figures, and half a unit of
 * that is a 0.2% error on the converted amount, silently.
 */
export const RATE_SCALE = 10n ** 18n

/** The number of fraction digits `RATE_SCALE` holds. The two move together. */
const RATE_DIGITS = 18

/**
 * A rate as an integer scaled to `RATE_SCALE`, taken from the decimal expansion rather than from
 * `Math.round(rate * Number(RATE_SCALE))` — that multiply loses the low digits of a small rate at
 * exactly the scale that made raising it worthwhile.
 */
export function scaleRate(rate: number): bigint {
    if (!Number.isFinite(rate)) throw new Error(`rate is not a finite number: ${rate}`)
    const fixed = rate.toFixed(RATE_DIGITS)
    // `toFixed` gives up and returns exponential notation past 1e21. No real rate is anywhere
    // near that, so this is a loud stop rather than a case to handle.
    if (fixed.includes('e')) throw new Error(`rate is too large to scale: ${rate}`)
    const [whole, fraction = ''] = fixed.split('.')
    const negative = whole.startsWith('-')
    const magnitude = BigInt(negative ? whole.slice(1) : whole) * RATE_SCALE + BigInt(fraction.padEnd(RATE_DIGITS, '0'))
    return negative ? -magnitude : magnitude
}

/**
 * The fraction digits `Expense.fxRate Decimal(24,12)` holds.
 *
 * Not the same number as `RATE_SCALE`, and the difference is the point: `RATE_SCALE` is the
 * precision the arithmetic runs at, this is the precision the ledger can remember. The column is
 * the coarser of the two, so a rate has to be rounded to it BEFORE it prices anything — otherwise
 * the rate that wrote a row and the rate read back out of it are two different numbers.
 */
export const FX_RATE_DIGITS = 12

/** A stored Decimal rate as plain, compact text. Decimal.js switches to exponent notation for
 *  values at or below 1e-7, but the public/manual-rate contract deliberately does not accept
 *  exponent notation. Going through the column's fixed scale preserves every stored digit. */
export function formatStoredFxRate(rate: { toFixed: (digits: number) => string }): string {
    const fixed = rate.toFixed(FX_RATE_DIGITS)
    const compact = fixed.replace(/0+$/, '')
    return compact.endsWith('.') ? compact.slice(0, -1) : compact
}

/**
 * A rate rounded to what the `fxRate` column stores, so writing it and reading it back is exact.
 *
 * `Number(quantiseRate(r).toFixed(FX_RATE_DIGITS)) === quantiseRate(r)` for every finite rate: the
 * rounded decimal sits within half a unit of the last place, and no other double is that close to
 * it. That fixed point is what lets an edit reproduce the number a create wrote.
 */
export const quantiseRate = (rate: number): number => Number(rate.toFixed(FX_RATE_DIGITS))

/**
 * The public shape of a manually supplied FX rate.
 *
 * `Expense.fxRate` is Decimal(24,12): twelve whole digits and twelve fraction
 * digits. Keep the wire format just as strict so an accepted request cannot
 * become a Prisma overflow, and disallow exponent notation so the value a
 * person reviewed is the value the ledger records. Manual rates never pass
 * through JavaScript Number: a large 12dp decimal has more significant digits
 * than a double can retain.
 */
const MANUAL_FX_RATE_SHAPE = /^\d{1,12}(?:\.\d{1,12})?$/
export const MAX_MANUAL_FX_RATE = 999_999_999_999
export const MANUAL_FX_RATE_SCALE = 10n ** BigInt(FX_RATE_DIGITS)
const MAX_MANUAL_FX_RATE_SCALED = BigInt(MAX_MANUAL_FX_RATE) * MANUAL_FX_RATE_SCALE

export interface ManualFxRate {
    /** Exact Decimal(24,12)-compatible representation persisted on Expense. */
    decimal: string
    /** `decimal * 1e12`, used directly by money conversion. */
    scaled: bigint
}

/** Parse and quantise room-major-units per one expense-major-unit without a float. */
export function parseManualFxRate(value: string): ManualFxRate | null {
    const raw = value.trim()
    if (!MANUAL_FX_RATE_SHAPE.test(raw)) return null
    const [whole, fraction = ''] = raw.split('.')
    const scaled = BigInt(whole) * MANUAL_FX_RATE_SCALE + BigInt(fraction.padEnd(FX_RATE_DIGITS, '0'))
    if (scaled <= 0n || scaled > MAX_MANUAL_FX_RATE_SCALED) return null
    const canonicalWhole = scaled / MANUAL_FX_RATE_SCALE
    const canonicalFraction = (scaled % MANUAL_FX_RATE_SCALE).toString().padStart(FX_RATE_DIGITS, '0')
    return { decimal: `${canonicalWhole}.${canonicalFraction}`, scaled }
}

/**
 * Convert at an exact manual Decimal(24,12) rate. This is deliberately separate
 * from `convertMinorAtRate`: catalog FX keeps its existing Number/1e18 behavior,
 * while a reviewed manual decimal is multiplied as the exact rational stored.
 */
export function convertMinorAtManualFxRate(amountMinor: bigint, from: string, to: string, rate: ManualFxRate): bigint {
    if (from === to) return amountMinor
    const num = amountMinor * rate.scaled * 10n ** BigInt(decimalsOf(to))
    const den = MANUAL_FX_RATE_SCALE * 10n ** BigInt(decimalsOf(from))
    const neg = num < 0n
    const abs = neg ? -num : num
    const q = (abs + den / 2n) / den
    return neg ? -q : q
}

/**
 * Convert minor units between currencies at `rate` (major units of `to` per 1
 * major unit of `from`), rounding half-up on the absolute value so negative
 * amounts round symmetrically.
 */
export function convertMinorAtRate(amountMinor: bigint, from: string, to: string, rate: number): bigint {
    if (from === to) return amountMinor
    const num = amountMinor * scaleRate(rate) * 10n ** BigInt(decimalsOf(to))
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

/** "1234" + EUR → "€12.34". Zero-decimal currencies get no separator, and a currency with no
 *  symbol gets its code after the amount — see `formatWithCurrency`, which the client shares. */
export function formatMinor(amountMinor: bigint, code: string): string {
    const c = currency(code)
    const neg = amountMinor < 0n
    const abs = neg ? -amountMinor : amountMinor
    const sign = neg ? '-' : ''
    if (c.decimals === 0) return formatWithCurrency(sign, abs.toString(), c)
    const factor = 10n ** BigInt(c.decimals)
    const whole = abs / factor
    const frac = (abs % factor).toString().padStart(c.decimals, '0')
    return formatWithCurrency(sign, `${whole.toString()}.${frac}`, c)
}
