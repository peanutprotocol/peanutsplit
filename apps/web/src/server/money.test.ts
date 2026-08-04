import { describe, expect, it } from 'vitest'
import { CURRENCY_CATALOG } from '@/lib/currency-catalog'
import {
    convertMinorAtManualFxRate,
    convertMinorAtRate,
    currency,
    CUSTOM_DECIMALS,
    decimalsOf,
    formatMinor,
    formatStoredFxRate,
    FX_RATE_DIGITS,
    isCatalogCode,
    isValidCode,
    normaliseCode,
    parseManualFxRate,
    parseMinor,
    publicCurrencies,
    quantiseRate,
    RATE_SCALE,
    scaleRate,
    STATIC_USD_PER_UNIT,
} from '@/server/money'

const staticRate = (from: string, to: string) => STATIC_USD_PER_UNIT[from] / STATIC_USD_PER_UNIT[to]
const codesWith = (decimals: number) => CURRENCY_CATALOG.filter((c) => c.decimals === decimals).map((c) => c.code)

/** The twelve codes every existing prod room holds, exactly as they shipped. */
const LEGACY = [
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
]

describe('currency catalog', () => {
    it('carries the whole ICU list, every code three uppercase letters', () => {
        expect(publicCurrencies()).toHaveLength(162)
        expect(publicCurrencies().every((c) => /^[A-Z]{3}$/.test(c.code))).toBe(true)
    })

    /** The back-compat lock. If any of these moves, a live room changes what it means or what it
     *  shows, and the generator's diff is where that has to be caught. */
    it('leaves the twelve legacy codes byte-identical', () => {
        for (const expected of LEGACY) {
            expect(currency(expected.code)).toMatchObject(expected)
        }
    })

    it('pins the decimals buckets ICU handed us, so a Node upgrade cannot move them quietly', () => {
        expect(codesWith(0)).toEqual([
            'AFN',
            'ALL',
            'BIF',
            'CLP',
            'COP',
            'DJF',
            'GNF',
            'HUF',
            'IDR',
            'IQD',
            'IRR',
            'ISK',
            'JPY',
            'KMF',
            'KPW',
            'KRW',
            'LAK',
            'LBP',
            'MGA',
            'MMK',
            'PKR',
            'PYG',
            'RWF',
            'SLL',
            'SOS',
            'SYP',
            'UGX',
            'VND',
            'VUV',
            'XAF',
            'XOF',
            'XPF',
            'YER',
        ])
        expect(codesWith(3)).toEqual(['BHD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'])
        expect(codesWith(0).length + codesWith(2).length + codesWith(3).length).toBe(162)
    })

    it('says which codes the rate feed carries', () => {
        expect(CURRENCY_CATALOG.filter((c) => !c.hasRate).map((c) => c.code)).toEqual(['CUC', 'KPW', 'SVC', 'XSU'])
        expect(LEGACY.every((c) => currency(c.code).hasRate)).toBe(true)
    })

    it('never leaks a static rate into the public catalog', () => {
        expect(publicCurrencies()[0]).not.toHaveProperty('usdPerUnit')
        expect(Object.keys(STATIC_USD_PER_UNIT)).toHaveLength(12)
    })
})

describe('currency() is total', () => {
    it('never throws, whatever it is handed', () => {
        for (const code of ['DOGE', 'ZZZ', '', 'not a code', 'ЕUR']) {
            expect(() => currency(code)).not.toThrow()
        }
    })

    it('gives an invented ticker a symbol-less, two-decimal entry named after itself', () => {
        expect(currency('DOGE')).toEqual({
            code: 'DOGE',
            name: 'DOGE',
            symbol: '',
            decimals: CUSTOM_DECIMALS,
            hasRate: false,
        })
        expect(CUSTOM_DECIMALS).toBe(2)
        expect(decimalsOf('DOGE')).toBe(2)
    })

    it('keeps JPY and COP zero-decimal and reads KWD as three', () => {
        expect(decimalsOf('JPY')).toBe(0)
        expect(decimalsOf('COP')).toBe(0)
        expect(decimalsOf('EUR')).toBe(2)
        expect(decimalsOf('KWD')).toBe(3)
    })
})

describe('normaliseCode and isValidCode', () => {
    it('folds case, whitespace and fullwidth text onto the one spelling a currency has', () => {
        expect(normaliseCode('usd')).toBe('USD')
        expect(normaliseCode('  eur  ')).toBe('EUR')
        expect(normaliseCode('ＵＳＤ')).toBe('USD')
        expect(normaliseCode('doge')).toBe('DOGE')
    })

    it('accepts three and four letters, real or invented', () => {
        for (const code of ['usd', '  eur  ', 'ＵＳＤ', 'DOGE', 'ZZZ', 'BEER', 'KWD', 'XOF']) {
            expect(isValidCode(code)).toBe(true)
        }
    })

    it('refuses anything that is not three or four ASCII letters', () => {
        for (const code of ['US', 'EUROS', 'US1', 'U-S', 'US D', '', '   ', 'U S', '€€€', 'x'.repeat(200)]) {
            expect(isValidCode(code)).toBe(false)
        }
    })

    /**
     * The anti-spoofing test. Cyrillic and Greek twins are not compatibility-equivalent to the
     * Latin letters, so NFKC leaves them alone and `[A-Z]` is what refuses them. Without this a
     * room could hold two different strings that both read as "USD" to a person.
     */
    it('refuses Cyrillic and Greek homoglyphs', () => {
        expect(isValidCode('ЅЅЅ')).toBe(false) // Cyrillic Ѕ ×3
        expect(isValidCode('ЕUR')).toBe(false) // Cyrillic Е, then UR
        expect(isValidCode('ΕUR')).toBe(false) // Greek Ε, then UR
        expect(isValidCode('USDе')).toBe(false) // trailing Cyrillic е
    })

    it('separates a real currency from an invented one', () => {
        expect(isCatalogCode('USD')).toBe(true)
        expect(isCatalogCode('KWD')).toBe(true)
        expect(isCatalogCode('DOGE')).toBe(false)
        expect(isCatalogCode('CNH')).toBe(false) // in the rate feed, not in ISO 4217
    })
})

describe('scaleRate', () => {
    it('keeps every digit RATE_SCALE can hold, at both ends of the catalog', () => {
        expect(scaleRate(1)).toBe(RATE_SCALE)
        // IRR → KWD, the smallest live cross rate and the reason RATE_SCALE moved off 1e9.
        expect(scaleRate(0.0000002418180611634891)).toBe(241_818_061_163n)
        // KWD → IRR, the largest.
        expect(scaleRate(4_135_340.409184394)).toBe(4_135_340_409_184_393_938_630_819n)
    })

    it('scales a negative rate symmetrically and holds zero', () => {
        expect(scaleRate(-1.5)).toBe(-scaleRate(1.5))
        expect(scaleRate(0)).toBe(0n)
    })

    it('refuses a rate that is not a finite number', () => {
        expect(() => scaleRate(NaN)).toThrow()
        expect(() => scaleRate(Infinity)).toThrow()
    })
})

describe('quantiseRate', () => {
    it('rounds to the digits the fxRate column holds', () => {
        expect(FX_RATE_DIGITS).toBe(12)
        expect(quantiseRate(staticRate('GBP', 'EUR'))).toBe(1.175925925926)
        expect(quantiseRate(1)).toBe(1)
    })

    /**
     * The property the whole edit path rests on: a quantised rate survives the round trip through
     * `Decimal(24,12)` unchanged. Written down as a test because it is not obvious — above roughly
     * 4 500 a double's spacing is wider than the twelfth decimal, and the reason it still holds is
     * that the rounded decimal is nearer to its own double than any other double is.
     */
    it('is a fixed point of the column round trip, across the range the catalog reaches', () => {
        const rates = [
            1,
            0.5,
            staticRate('USD', 'CHF'),
            staticRate('GBP', 'EUR'),
            0.0000002418180611634891, // IRR → KWD, the smallest cross rate
            4_135_340.409184394, // KWD → IRR, the largest
            1e-12,
            12_345.6789,
        ]
        for (const rate of rates) {
            const q = quantiseRate(rate)
            expect(Number(q.toFixed(FX_RATE_DIGITS))).toBe(q)
            expect(quantiseRate(q)).toBe(q)
        }
    })

    it('rounds a rate under half the last place to zero, which the write path has to refuse', () => {
        expect(quantiseRate(4e-13)).toBe(0)
        expect(quantiseRate(6e-13)).toBe(1e-12)
    })
})

describe('formatStoredFxRate', () => {
    it('keeps tiny stored decimals out of exponent notation without padding ordinary rates', () => {
        expect(formatStoredFxRate({ toFixed: () => '0.000000000001' })).toBe('0.000000000001')
        expect(formatStoredFxRate({ toFixed: () => '5.000000000000' })).toBe('5')
        expect(formatStoredFxRate({ toFixed: () => '5.120000000000' })).toBe('5.12')
        expect(formatStoredFxRate({ toFixed: () => '100.000000000000' })).toBe('100')
        expect(formatStoredFxRate({ toFixed: () => '120.000000000000' })).toBe('120')
    })
})

describe('convertMinorAtRate', () => {
    it('is the identity for same-currency conversion', () => {
        expect(convertMinorAtRate(12345n, 'EUR', 'EUR', 1)).toBe(12345n)
    })

    it('converts THB 3000.00 to EUR 77.78 on the static table', () => {
        expect(convertMinorAtRate(300_000n, 'THB', 'EUR', staticRate('THB', 'EUR'))).toBe(7778n)
    })

    it('crosses the decimals gap into a zero-decimal currency', () => {
        // €10.00 at 1.08 USD/EUR into JPY (0.0064 USD/JPY) → ¥1688
        expect(convertMinorAtRate(1000n, 'EUR', 'JPY', staticRate('EUR', 'JPY'))).toBe(1688n)
    })

    it('crosses the decimals gap out of a zero-decimal currency', () => {
        expect(convertMinorAtRate(1688n, 'JPY', 'EUR', staticRate('JPY', 'EUR'))).toBe(1000n)
    })

    it('rounds half-up', () => {
        // 1 minor unit at rate 0.5 lands exactly on the half → rounds away from zero.
        expect(convertMinorAtRate(1n, 'USD', 'EUR', 0.5)).toBe(1n)
        expect(convertMinorAtRate(1n, 'USD', 'EUR', 0.4)).toBe(0n)
    })

    it('rounds negatives symmetrically', () => {
        expect(convertMinorAtRate(-1n, 'USD', 'EUR', 0.5)).toBe(-1n)
        expect(convertMinorAtRate(-300_000n, 'THB', 'EUR', staticRate('THB', 'EUR'))).toBe(-7778n)
    })

    it('stays exact on amounts far beyond float precision', () => {
        const huge = 9_007_199_254_740_993n // 2^53 + 1: unrepresentable as a double
        expect(convertMinorAtRate(huge, 'USD', 'EUR', 1)).toBe(huge)
    })

    /**
     * The regression test for the scale, at the smallest cross rate the 162-code catalog reaches.
     *
     * At 1e9 the IRR→KWD rate held three significant figures (242), so 2 000 000 000 IRR — about
     * $47 — converted to 484 000 fils instead of 483 636. That is 0.364 KWD, roughly $1.19, wrong
     * with nothing failing anywhere. The old arithmetic is spelled out here rather than described,
     * so the test states the size of the bug it is holding shut.
     */
    it('does not lose the low digits of the smallest cross rate in the catalog', () => {
        const rate = 0.0000002418180611634891
        const amount = 2_000_000_000n // IRR, 0 decimals → KWD, 3 decimals

        const atOldScale = (amount * BigInt(Math.round(rate * 1e9)) * 1000n) / 1_000_000_000n
        expect(atOldScale).toBe(484_000n)

        const got = convertMinorAtRate(amount, 'IRR', 'KWD', rate)
        expect(got).toBe(483_636n)
        const exact = (amount * scaleRate(rate) * 1000n) / RATE_SCALE
        expect(got - exact >= -1n && got - exact <= 1n).toBe(true)
    })

    it('round-trips a three-decimal currency within one minor unit', () => {
        const usd = 123_456n
        const kwd = convertMinorAtRate(usd, 'USD', 'KWD', 3.27)
        expect(convertMinorAtRate(kwd, 'KWD', 'USD', 1 / 3.27) - usd).toBe(0n)
    })

    it('round-trips a zero-decimal currency within one minor unit', () => {
        const eur = 98_765n
        const jpy = convertMinorAtRate(eur, 'EUR', 'JPY', staticRate('EUR', 'JPY'))
        const back = convertMinorAtRate(jpy, 'JPY', 'EUR', staticRate('JPY', 'EUR'))
        expect(back - eur >= -2n && back - eur <= 2n).toBe(true)
    })
})

describe('exact manual FX rates', () => {
    it('preserves all 24 Decimal digits and converts without passing through Number', () => {
        const raw = '123456789012.123456789012'
        const rate = parseManualFxRate(raw)
        expect(rate).toEqual({
            decimal: raw,
            scaled: 123_456_789_012_123_456_789_012n,
        })

        // At this amount the nearest double crosses the half-up boundary by one
        // room minor unit. The exact 1e12-scaled path must stay on the stored
        // decimal's side of that boundary.
        expect(convertMinorAtManualFxRate(3001n, 'BEER', 'EUR', rate!)).toBe(370_493_823_825_382n)
        expect(convertMinorAtRate(3001n, 'BEER', 'EUR', Number(raw))).toBe(370_493_823_825_383n)
    })

    it('canonicalises to 12dp and rounds negative conversions symmetrically', () => {
        const rate = parseManualFxRate('  0.5  ')
        expect(rate).toEqual({ decimal: '0.500000000000', scaled: 500_000_000_000n })
        expect(convertMinorAtManualFxRate(1n, 'BEER', 'EUR', rate!)).toBe(1n)
        expect(convertMinorAtManualFxRate(-1n, 'BEER', 'EUR', rate!)).toBe(-1n)
    })
})

describe('parseMinor', () => {
    it('accepts a decimal string of minor units', () => {
        expect(parseMinor('1234')).toBe(1234n)
    })

    it('rejects anything that is not a whole number', () => {
        expect(() => parseMinor('12.34')).toThrow()
        expect(() => parseMinor('1e3')).toThrow()
        expect(() => parseMinor('')).toThrow()
    })
})

describe('formatMinor', () => {
    it('renders two-decimal currencies', () => {
        expect(formatMinor(1234n, 'EUR')).toBe('€12.34')
        expect(formatMinor(5n, 'EUR')).toBe('€0.05')
    })

    it('renders zero-decimal currencies without a separator', () => {
        expect(formatMinor(1688n, 'JPY')).toBe('¥1688')
    })

    it('renders three-decimal currencies with three places', () => {
        expect(formatMinor(1234n, 'KWD')).toBe('1.234 KWD')
    })

    it('puts the sign before the symbol', () => {
        expect(formatMinor(-1234n, 'USD')).toBe('-$12.34')
    })

    /** 61 catalog codes have no symbol, and so does every invented ticker. Without the code after
     *  the amount they print bare — a number with no currency at all, on the OG card included. */
    it('puts the code after the amount when there is no symbol, once', () => {
        expect(formatMinor(1234n, 'AED')).toBe('12.34 AED')
        expect(formatMinor(1234n, 'DOGE')).toBe('12.34 DOGE')
        expect(formatMinor(-1234n, 'DOGE')).toBe('-12.34 DOGE')
        expect(formatMinor(1688n, 'ALL')).toBe('1688 ALL')
    })
})
