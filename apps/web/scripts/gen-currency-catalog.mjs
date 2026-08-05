#!/usr/bin/env node
/**
 * Writes `src/lib/currency-catalog.ts` from the ICU data this Node ships with.
 *
 * Run it by hand (`pnpm currencies:gen`), never at build or boot. Production has no egress, so
 * the catalog has to be a committed artifact — and a table regenerated silently by a Node upgrade
 * is a table whose decimals can move under rooms that already hold money.
 *
 * Re-running on one Node version produces a byte-identical file, so the git diff IS the review.
 * Read the diff. The report below names every code added and every decimals change, because both
 * of those can re-read a stored `amountMinor` at a different scale (see D8 in the spec).
 *
 * Four fields, four sources:
 *   name      `Intl.DisplayNames` in English.
 *   symbol    pinned for the 12 legacy codes (see PINNED_SYMBOLS); otherwise the wide symbol if
 *             ICU has one that is not the code itself, else the narrow one, else ''. 61 codes
 *             land on '' and the formatter prints `12.34 AED` for them.
 *   decimals  `Intl.NumberFormat(...).resolvedOptions().maximumFractionDigits` — CLDR, never
 *             guessed. 33 codes are 0-decimal and 6 are 3-decimal.
 *   hasRate   membership of RATE_CODES below.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'currency-catalog.ts')

/**
 * The currency codes Peanut's `GET /fx/rates?base=USD` snapshot carried on 2026-08-05,
 * verbatim and sorted. The backend builds its reference layer from Frankfurter v2
 * and overlays Peanut's provider display-sell rates.
 *
 * Committed rather than fetched for the reason the header gives: no egress at runtime, and a
 * boolean that changes without a deploy is a boolean nobody can reason about. `hasRate` only ever
 * describes a code ICU already knows. To refresh: fetch the Peanut snapshot, sort its codes, paste
 * them here, re-run, and read the diff.
 */
const RATE_CODES = new Set([
    'AED',
    'AFN',
    'ALL',
    'AMD',
    'ANG',
    'AOA',
    'ARS',
    'AUD',
    'AWG',
    'AZN',
    'BAM',
    'BBD',
    'BDT',
    'BHD',
    'BIF',
    'BMD',
    'BND',
    'BOB',
    'BRL',
    'BSD',
    'BTN',
    'BWP',
    'BYN',
    'BZD',
    'CAD',
    'CDF',
    'CHF',
    'CLF',
    'CLP',
    'CNH',
    'CNY',
    'COP',
    'CRC',
    'CUP',
    'CVE',
    'CZK',
    'DJF',
    'DKK',
    'DOP',
    'DZD',
    'EGP',
    'ERN',
    'ETB',
    'EUR',
    'FJD',
    'FKP',
    'FOK',
    'GBP',
    'GEL',
    'GGP',
    'GHS',
    'GIP',
    'GMD',
    'GNF',
    'GTQ',
    'GYD',
    'HKD',
    'HNL',
    'HTG',
    'HUF',
    'IDR',
    'ILS',
    'IMP',
    'INR',
    'IQD',
    'IRR',
    'ISK',
    'JEP',
    'JMD',
    'JOD',
    'JPY',
    'KES',
    'KGS',
    'KHR',
    'KID',
    'KMF',
    'KPW',
    'KRW',
    'KWD',
    'KYD',
    'KZT',
    'LAK',
    'LBP',
    'LKR',
    'LRD',
    'LSL',
    'LYD',
    'MAD',
    'MDL',
    'MGA',
    'MKD',
    'MMK',
    'MNT',
    'MOP',
    'MRU',
    'MUR',
    'MVR',
    'MWK',
    'MXN',
    'MYR',
    'MZN',
    'NAD',
    'NGN',
    'NIO',
    'NOK',
    'NPR',
    'NZD',
    'OMR',
    'PAB',
    'PEN',
    'PGK',
    'PHP',
    'PKR',
    'PLN',
    'PYG',
    'QAR',
    'RON',
    'RSD',
    'RUB',
    'RWF',
    'SAR',
    'SBD',
    'SCR',
    'SDG',
    'SEK',
    'SGD',
    'SHP',
    'SLE',
    'SOS',
    'SRD',
    'SSP',
    'STN',
    'SVC',
    'SYP',
    'SZL',
    'THB',
    'TJS',
    'TMT',
    'TND',
    'TOP',
    'TRY',
    'TTD',
    'TVD',
    'TWD',
    'TZS',
    'UAH',
    'UGX',
    'USD',
    'UYU',
    'UZS',
    'VES',
    'VND',
    'VUV',
    'WST',
    'XAF',
    'XCD',
    'XCG',
    'XDR',
    'XOF',
    'XPF',
    'YER',
    'ZAR',
    'ZMW',
    'ZWG',
])

/**
 * The 12 codes every existing room uses, with the symbols they have always displayed.
 *
 * These override ICU on purpose. ICU answers MXN with `MX$`, CAD with `CA$` and CHF with nothing
 * at all, and each of those would change what a live room renders. Nothing outside this map is
 * pinned — a new code takes whatever ICU says.
 */
const PINNED_SYMBOLS = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    ARS: '$',
    BRL: 'R$',
    MXN: '$',
    COP: '$',
    CHF: 'CHF ',
    THB: '฿',
    JPY: '¥',
    AUD: 'A$',
    CAD: 'C$',
}

const displayNames = new Intl.DisplayNames(['en'], { type: 'currency' })

const symbolPart = (code, currencyDisplay) => {
    const parts = new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay }).formatToParts(0)
    return parts.find((part) => part.type === 'currency')?.value ?? ''
}

/** Wide symbol, else narrow, else nothing. Neither form alone is usable: the wide one answers
 *  ARS/COP/THB with the code and loses `฿`, the narrow one answers AUD/CAD with a bare `$`. */
function symbolOf(code) {
    if (code in PINNED_SYMBOLS) return PINNED_SYMBOLS[code]
    const wide = symbolPart(code, 'symbol')
    if (wide && wide !== code) return wide
    const narrow = symbolPart(code, 'narrowSymbol')
    if (narrow && narrow !== code) return narrow
    return ''
}

const decimalsOf = (code) =>
    new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits

function build() {
    return Intl.supportedValuesOf('currency')
        .filter((code) => /^[A-Z]{3}$/.test(code))
        .sort()
        .map((code) => ({
            code,
            name: displayNames.of(code) ?? code,
            symbol: symbolOf(code),
            decimals: decimalsOf(code),
            hasRate: RATE_CODES.has(code),
        }))
}

/** Prettier's rule for this repo: single quotes, and nothing here has ever needed an escape. */
function quote(value) {
    if (/['\\]/.test(value)) throw new Error(`ICU returned a value needing an escape: ${JSON.stringify(value)}`)
    return `'${value}'`
}

/** What the committed file already says, so the report can name what moved. Regex rather than an
 *  import: the generator has to run against a file it is about to overwrite, including a broken one. */
function committed() {
    let source
    try {
        source = readFileSync(OUT, 'utf8')
    } catch {
        return new Map()
    }
    const rows = new Map()
    const entry = /\{ code: '([A-Z]{3})',[^}]*decimals: (\d+), hasRate: (true|false) \}/g
    for (const [, code, decimals, hasRate] of source.matchAll(entry)) {
        rows.set(code, { decimals: Number(decimals), hasRate: hasRate === 'true' })
    }
    return rows
}

function render(catalog) {
    const rows = catalog
        .map(
            (c) =>
                `    { code: ${quote(c.code)}, name: ${quote(c.name)}, symbol: ${quote(c.symbol)}, ` +
                `decimals: ${c.decimals}, hasRate: ${c.hasRate} },`
        )
        .join('\n')

    return `/**
 * GENERATED by scripts/gen-currency-catalog.mjs — do not hand-edit.
 * Regenerate with \`pnpm currencies:gen\` and read the diff; the script reports what moved.
 *
 * ${catalog.length} codes from the ICU data bundled with Node, plus one boolean per code saying
 * whether the rate feed carries it. Everything downstream — decimals, symbol, whether a currency
 * can be converted at all — reads this table and nothing else.
 *
 * TWO THINGS IN A DIFF HERE CAN MOVE MONEY THAT IS ALREADY STORED:
 *
 * 1. A code being ADDED. Until it is added, anybody may type it as a custom ticker, and a custom
 *    ticker stores its amounts at 2 decimals. If the new code is 0- or 3-decimal, every amount in
 *    a room already using it re-reads at 100x or 1/10x. Check the added codes against the
 *    currencies live rooms hold before you commit.
 * 2. A code's \`decimals\` CHANGING. Same failure, for a currency the app already priced.
 *
 * A code LEAVING is safe: rooms keep working, the code just stops converting.
 */

export interface CatalogCurrency {
    /** Three uppercase letters. */
    code: string
    /** English display name from ICU. */
    name: string
    /** Pinned for the 12 legacy codes, ICU otherwise, and '' for 61 of them. */
    symbol: string
    /** 0, 2 or 3 — CLDR, never guessed. */
    decimals: number
    /** The rate feed carries this code, so it can be converted. */
    hasRate: boolean
}

export const CURRENCY_CATALOG: readonly CatalogCurrency[] = [
${rows}
]

export const CATALOG_BY_CODE: ReadonlyMap<string, CatalogCurrency> = new Map(CURRENCY_CATALOG.map((c) => [c.code, c]))
`
}

const catalog = build()
const before = committed()

const added = catalog.filter((c) => !before.has(c.code)).map((c) => `${c.code} (${c.decimals}dp)`)
const removed = [...before.keys()].filter((code) => !catalog.some((c) => c.code === code))
const movedDecimals = catalog
    .filter((c) => before.has(c.code) && before.get(c.code).decimals !== c.decimals)
    .map((c) => `${c.code} ${before.get(c.code).decimals}dp → ${c.decimals}dp`)
const movedRates = catalog
    .filter((c) => before.has(c.code) && before.get(c.code).hasRate !== c.hasRate)
    .map((c) => `${c.code} hasRate → ${c.hasRate}`)

writeFileSync(OUT, render(catalog))

const report = (label, list) => console.log(`${label}: ${list.length === 0 ? 'none' : list.join(', ')}`)
console.log(`wrote ${OUT}`)
console.log(`${catalog.length} codes, ${catalog.filter((c) => c.hasRate).length} with a rate (Node ${process.version})`)
report('ADDED — check these against the custom tickers live rooms hold', added)
report('decimals CHANGED — this re-reads stored amounts', movedDecimals)
report('removed', removed)
report('rate coverage changed', movedRates)
