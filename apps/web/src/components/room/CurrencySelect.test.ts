import { describe, expect, it } from 'vitest'
import type { CurrencyInfo } from '@/lib/api-types'
import {
    commonCurrencies,
    currencyMenuPlacement,
    customTickerFor,
    matchCurrencies,
    offerableCurrencies,
    orderCurrencies,
} from './CurrencySelect'

const trigger = (top: number, bottom: number, left = 24, width = 136) => ({
    top,
    bottom,
    left,
    right: left + width,
    width,
})

/**
 * A catalog small enough to read, shaped like the real one: a spread of codes that collide on `U`,
 * an accented Spanish name, and two codes the rate feed does not carry.
 */
const info = (code: string, name: string, hasRate = true): CurrencyInfo => ({
    code,
    name,
    symbol: '',
    decimals: 2,
    hasRate,
})

const CATALOG: CurrencyInfo[] = [
    info('ARS', 'Peso argentino'),
    info('BRL', 'Brazilian Real'),
    info('CHF', 'Swiss Franc'),
    info('CUC', 'Cuban Convertible Peso', false),
    info('EUR', 'Euro'),
    info('GBP', 'British Pound'),
    info('KPW', 'North Korean Won', false),
    info('MXN', 'Mexican Peso'),
    info('THB', 'Thai Baht'),
    info('TRY', 'Türk Lirası'),
    info('UAH', 'Ukrainian Hryvnia'),
    info('UGX', 'Ugandan Shilling'),
    info('USD', 'US Dollar'),
    info('UYU', 'Uruguayan Peso'),
    info('UZS', 'Uzbekistani Som'),
    info('ZAR', 'South African Rand'),
]

const codesOf = (list: readonly CurrencyInfo[]) => list.map((entry) => entry.code)

/** The list the menu ranks against: the five, then everything else A→Z. */
const baseOrder = (value: string, suggested?: readonly string[]) => {
    const offerable = offerableCurrencies(CATALOG, value)
    return orderCurrencies(offerable, commonCurrencies(offerable, value, suggested))
}

describe('commonCurrencies', () => {
    it('puts the current value first even when the call site never suggested it', () => {
        const five = commonCurrencies(CATALOG, 'THB', ['USD', 'EUR'])

        expect(five[0].code).toBe('THB')
        expect(codesOf(five)).toEqual(['THB', 'USD', 'EUR', 'GBP', 'BRL'])
    })

    it('returns exactly five, deduped across the value, the suggestions and the backfill', () => {
        const five = commonCurrencies(CATALOG, 'EUR', ['EUR', 'USD', 'USD'])

        expect(five).toHaveLength(5)
        expect(new Set(codesOf(five)).size).toBe(5)
    })

    it('keeps the order the sources ranked in and never alphabetises', () => {
        expect(codesOf(commonCurrencies(CATALOG, 'ZAR', ['THB', 'CHF']))).toEqual(['ZAR', 'THB', 'CHF', 'USD', 'EUR'])
    })

    it('drops a suggested code the catalog does not have', () => {
        expect(codesOf(commonCurrencies(CATALOG, 'EUR', ['XXX', 'THB']))).toEqual(['EUR', 'THB', 'USD', 'GBP', 'BRL'])
    })

    it('pins an invented ticker as row one even though the catalog has never heard of it', () => {
        const five = commonCurrencies(CATALOG, 'BEER')

        expect(five[0]).toEqual({ code: 'BEER', name: 'BEER', symbol: '', decimals: 2, hasRate: false })
        expect(codesOf(five)).toEqual(['BEER', 'USD', 'EUR', 'GBP', 'BRL'])
    })

    it('lets suggestions fill at most four slots, so a nine-currency import is still a shortlist', () => {
        const nine = ['ARS', 'BRL', 'CHF', 'GBP', 'MXN', 'THB', 'TRY', 'UAH', 'ZAR']
        const five = commonCurrencies(CATALOG, 'EUR', nine)

        expect(codesOf(five)).toEqual(['EUR', 'ARS', 'BRL', 'CHF', 'GBP'])
        expect(five.filter((entry) => nine.includes(entry.code))).toHaveLength(4)
    })
})

describe('matchCurrencies', () => {
    it('ranks the exact code above a prefix and a name', () => {
        expect(codesOf(matchCurrencies('eur', baseOrder('USD')))).toEqual(['EUR'])
        expect(codesOf(matchCurrencies('eu', baseOrder('USD')))).toEqual(['EUR'])
    })

    it('keeps USD above the other U codes, because the five come first in the base order', () => {
        expect(codesOf(matchCurrencies('u', baseOrder('EUR')))).toEqual(['USD', 'UAH', 'UGX', 'UYU', 'UZS'])
    })

    it('finds a currency by the start of a word in its name', () => {
        expect(codesOf(matchCurrencies('bra', baseOrder('EUR')))).toEqual(['BRL'])
        expect(codesOf(matchCurrencies('real', baseOrder('EUR')))).toEqual(['BRL'])
    })

    it('only reaches inside a word at three characters', () => {
        // "nd" is inside "Rand" and "Ugandan" but starts no word: too short to be worth the noise.
        expect(codesOf(matchCurrencies('nd', baseOrder('EUR')))).toEqual([])
        expect(codesOf(matchCurrencies('and', baseOrder('EUR')))).toEqual(['UGX', 'ZAR'])
    })

    it('folds case and diacritics on both sides', () => {
        expect(codesOf(matchCurrencies('PESO ARGENTINO', baseOrder('EUR')))).toEqual(['ARS'])
        expect(codesOf(matchCurrencies('turk', baseOrder('EUR')))).toEqual(['TRY'])
    })

    it('keeps the base order for ties inside one bucket', () => {
        expect(codesOf(matchCurrencies('peso', baseOrder('EUR')))).toEqual(['MXN', 'ARS', 'CUC', 'UYU'])
    })

    it('gives the whole list back for an empty query', () => {
        expect(matchCurrencies('  ', CATALOG)).toHaveLength(CATALOG.length)
    })
})

describe('customTickerFor', () => {
    it('takes three or four letters and nothing else', () => {
        expect(customTickerFor('BEER', CATALOG)).toBe('BEER')
        expect(customTickerFor('BEE', CATALOG)).toBe('BEE')
        expect(customTickerFor('  beer ', CATALOG)).toBe('BEER')
        expect(customTickerFor('BE', CATALOG)).toBeNull()
        expect(customTickerFor('BEERS', CATALOG)).toBeNull()
        expect(customTickerFor('BE3R', CATALOG)).toBeNull()
        // Cyrillic С survives NFKC, so the ASCII-only class is what refuses the homoglyph.
        expect(customTickerFor('СHF', CATALOG)).toBeNull()
    })

    it('never shadows a real currency, however it was typed', () => {
        expect(customTickerFor('EUR', CATALOG)).toBeNull()
        expect(customTickerFor('eur', CATALOG)).toBeNull()
    })

    it('still offers itself when real currencies matched too', () => {
        expect(customTickerFor('BRLX', CATALOG)).toBe('BRLX')
    })

    it('says nothing when the query is already the value', () => {
        expect(customTickerFor('BEER', CATALOG, { value: 'BEER' })).toBeNull()
    })

    it('is off where the pick has to receive other currencies', () => {
        expect(customTickerFor('BEER', CATALOG, { allowCustom: false })).toBeNull()
    })

    it('is off in a room that settles in a real currency, because it could never convert into it', () => {
        expect(customTickerFor('BEER', CATALOG, { requireRateTo: 'EUR' })).toBeNull()
        expect(customTickerFor('BEER', CATALOG, { requireRateTo: 'BEER' })).toBeNull()
    })
})

describe('offerableCurrencies', () => {
    it('offers the whole catalog when nothing has to be converted', () => {
        expect(offerableCurrencies(CATALOG, 'EUR')).toHaveLength(CATALOG.length)
    })

    it('drops the codes the feed does not carry in a room that settles in one it does', () => {
        const offerable = codesOf(offerableCurrencies(CATALOG, 'EUR', 'EUR'))

        expect(offerable).toContain('THB')
        expect(offerable).not.toContain('CUC')
        expect(offerable).not.toContain('KPW')
    })

    it('offers one row in a room whose own currency has no rate', () => {
        expect(codesOf(offerableCurrencies(CATALOG, 'CUC', 'CUC'))).toEqual(['CUC'])
    })

    it('offers one row in a room whose currency is an invented ticker', () => {
        expect(codesOf(offerableCurrencies(CATALOG, 'BEER', 'BEER'))).toEqual(['BEER'])
    })

    it('keeps the current value listed even when the constraint would drop it', () => {
        expect(codesOf(offerableCurrencies(CATALOG, 'CUC', 'EUR'))[0]).toBe('CUC')
    })
})

/**
 * The menu's chrome, measured against the rendered component: the search field and its frame (65),
 * the footer at its two-line worst case (49), the listbox's own padding (8) and the menu's border
 * (4). The listbox is what is left over, so a budget that forgets any of it clips rows.
 */
const CHROME = 65 + 49 + 8 + 4
const ROW = 48
const CUSTOM_ROW = 64
/** Five rows and the chrome around them, with room for one of the five to be the taller
 *  invent-a-ticker row. Past that the listbox scrolls. */
const MAX = CHROME + 5 * ROW + (CUSTOM_ROW - ROW)

describe('currencyMenuPlacement', () => {
    it('opens downward when the trigger is near the top of the sheet', () => {
        const placement = currencyMenuPlacement(trigger(120, 168), { width: 390, height: 844 }, 12)

        expect(placement.direction).toBe('down')
        expect(placement.top).toBe(176)
        expect(placement.left).toBe(24)
        // CHANGED BY DESIGN: was 256, a cap that predated the search field and the footer and could
        // never hold the five rows the menu opens on. The cap is now five rows plus the chrome.
        expect(placement.maxHeight).toBe(MAX)
    })

    it('flips upward only when the space above is genuinely better', () => {
        const placement = currencyMenuPlacement(trigger(720, 768), { width: 390, height: 844 }, 12)

        expect(placement.direction).toBe('up')
        expect(placement.top).toBe(720 - 8 - MAX)
        expect(placement.maxHeight).toBe(MAX)
    })

    it('shifts a wide trigger inside the visible viewport gutter', () => {
        const placement = currencyMenuPlacement(trigger(200, 248, 330, 90), { width: 390, height: 844 }, 4)

        // CHANGED BY DESIGN: the menu is 208 wide, not 176. At 176 the footer's "Search all 162
        // currencies" — the only way to reach the other 157 on a touch device — wrapped onto two
        // lines of 12px underlined text and read as fine print.
        expect(placement.left).toBe(170)
        expect(placement.width).toBe(208)
        expect(placement.left + placement.width).toBeLessThanOrEqual(378)
    })

    it('respects visual viewport offsets from a mobile keyboard', () => {
        const placement = currencyMenuPlacement(trigger(390, 438), { width: 390, height: 420, offsetTop: 180 }, 12)

        expect(placement.direction).toBe('up')
        expect(placement.top).toBeGreaterThanOrEqual(192)
    })

    it('shrinks rather than escaping when neither side has room for a full menu', () => {
        const placement = currencyMenuPlacement(trigger(42, 90), { width: 320, height: 140 }, 12)

        expect(placement.direction).toBe('down')
        expect(placement.maxHeight).toBe(30)
        expect(placement.top + placement.maxHeight).toBe(128)
    })

    /**
     * The search field and the footer are outside the scroller and neither shrinks, so a one-match
     * menu has to ask for both on top of the row. Budgeting the field but not the footer is what
     * left a single match as an 8px sliver with the row clipped away.
     */
    it('reserves the search field AND the footer on top of the rows', () => {
        const oneMatch = currencyMenuPlacement(trigger(120, 168), { width: 390, height: 844 }, 1)

        expect(oneMatch.maxHeight).toBe(CHROME + ROW)
    })

    /** The invent-a-ticker row is taller than a currency row, and it is usually the only row in the
     *  list — a query with no real match is exactly when it appears. */
    it('asks for the taller invent-a-ticker row', () => {
        const custom = currencyMenuPlacement(trigger(120, 168), { width: 390, height: 844 }, 1, true)

        expect(custom.maxHeight).toBe(CHROME + CUSTOM_ROW)
    })
})
