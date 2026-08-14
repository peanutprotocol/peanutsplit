import { describe, expect, it } from 'vitest'
import { formatMinor } from '@/server/money'
import {
    currencyDisplayName,
    currencyInfo,
    displaySymbol,
    equalSplitMinor,
    formatAmountInput,
    formatCompactMoney,
    formatLargeAmountPreview,
    formatMinorPlain,
    formatMoney,
    formatMoneyParts,
    isAmountInputAcceptable,
    MAX_SIGNED_MINOR,
    minorToExactNumber,
    overviewMoneyPresentation,
    parseAmountToMinor,
    parseExportAmountToMinor,
} from './money'

describe('parseAmountToMinor', () => {
    it('parses the shapes a phone keyboard actually produces', () => {
        expect(parseAmountToMinor('12.34', 2)).toBe('1234')
        expect(parseAmountToMinor('12,34', 2)).toBe('1234')
        expect(parseAmountToMinor('12', 2)).toBe('1200')
        expect(parseAmountToMinor('.5', 2)).toBe('50')
        expect(parseAmountToMinor(' 7.5 ', 2)).toBe('750')
    })

    it('respects zero-decimal currencies', () => {
        expect(parseAmountToMinor('4500', 0)).toBe('4500')
        expect(parseAmountToMinor('4500.4', 0)).toBe('4500')
        expect(parseAmountToMinor('4500.5', 0)).toBe('4501')
    })

    it('rounds extra fraction digits half-up rather than silently truncating', () => {
        expect(parseAmountToMinor('12.344', 2)).toBe('1234')
        expect(parseAmountToMinor('12.345', 2)).toBe('1235')
        expect(parseAmountToMinor('0.999', 2)).toBe('100')
    })

    it('rejects anything that is not a non-negative amount', () => {
        expect(parseAmountToMinor('', 2)).toBeNull()
        expect(parseAmountToMinor('.', 2)).toBeNull()
        expect(parseAmountToMinor('-5', 2)).toBeNull()
        expect(parseAmountToMinor('12.3.4', 2)).toBeNull()
        expect(parseAmountToMinor('abc', 2)).toBeNull()
    })

    it('shares PostgreSQL BIGINT bounds with API validation without constructing giant BigInts', () => {
        expect(parseAmountToMinor(MAX_SIGNED_MINOR.toString(), 0)).toBe(MAX_SIGNED_MINOR.toString())
        expect(parseAmountToMinor((MAX_SIGNED_MINOR + 1n).toString(), 0)).toBeNull()
        expect(parseAmountToMinor('9'.repeat(100_000), 0)).toBeNull()
    })

    /**
     * The locale-aware half. A pt-BR keyboard produces "1.234,56" and an en one "1,234.56" for
     * the same amount — with both separators present the last one is unambiguously the decimal
     * point, so neither has to be refused.
     */
    it('reads a grouped amount in either convention when both separators are present', () => {
        expect(parseAmountToMinor('1.234,56', 2)).toBe('123456')
        expect(parseAmountToMinor('1,234.56', 2)).toBe('123456')
        expect(parseAmountToMinor('1.234.567,89', 2)).toBe('123456789')
        expect(parseAmountToMinor('1,234,567.89', 2)).toBe('123456789')
        expect(parseAmountToMinor('1.234,5', 2)).toBe('123450')
        expect(parseAmountToMinor('9.999,99', 0)).toBe('10000')
    })

    it('still refuses to guess when the reading is genuinely ambiguous', () => {
        // One separator, more than one group: could be 1234 or 1.234 and we will not pick.
        expect(parseAmountToMinor('1.234.567', 2)).toBeNull()
        expect(parseAmountToMinor('1,234,567', 2)).toBeNull()
        // Both present but the decimal candidate repeats — no single reading exists.
        expect(parseAmountToMinor('1.2.3,4', 2)).toBeNull()
        expect(parseAmountToMinor('1,2,3.4', 2)).toBeNull()
    })

    /**
     * The documented safety choice, unchanged: a lone separator is ALWAYS the decimal point.
     * Reading "1.234" as one thousand two hundred and thirty-four would multiply a dinner by a
     * thousand, and no locale signal is worth that risk when the field shows what was typed.
     */
    it('never treats a single separator as grouping', () => {
        expect(parseAmountToMinor('1.234', 2)).toBe('123')
        expect(parseAmountToMinor('1,234', 2)).toBe('123')
    })

    describe('interactive input with a known locale', () => {
        it.each([
            ['en', '1,234', '123400'],
            ['en', '1,234.56', '123456'],
            ['en', '1,023.45', '102345'],
            ['es', '1.234', '123400'],
            ['es', '1.234,56', '123456'],
            ['es', '1.023,45', '102345'],
            ['pt-BR', '1.234', '123400'],
            ['pt-BR', '1.234,56', '123456'],
            ['pt-BR', '1.023,45', '102345'],
        ])('reads locale grouping in %s without changing the intended units', (locale, input, expected) => {
            expect(parseAmountToMinor(input, 2, locale)).toBe(expected)
        })

        it.each([
            ['en', '0.12'],
            ['es', '0,12'],
            ['pt-BR', '0,12'],
        ])('preserves a canonical fractional value in %s', (locale, input) => {
            expect(parseAmountToMinor(input, 2, locale)).toBe('12')
        })

        it.each([
            ['en', '0,123', 2],
            ['en', '00,123', 2],
            ['es', '0.123', 2],
            ['es', '00.123', 2],
            ['pt-BR', '0.123', 2],
            ['pt-BR', '00.123', 2],
            ['en', '0,123', 0],
            ['en', '00,123', 0],
            ['es', '0.123', 0],
            ['es', '00.123', 0],
            ['pt-BR', '0.123', 0],
            ['pt-BR', '00.123', 0],
        ])('rejects noncanonical leading-zero grouping in %s at %idp', (locale, input, decimals) => {
            expect(parseAmountToMinor(input, decimals, locale)).toBeNull()
        })

        it.each([
            ['en', '0,123.45'],
            ['en', '00,123.45'],
            ['es', '0.123,45'],
            ['es', '00.123,45'],
            ['pt-BR', '0.123,45'],
            ['pt-BR', '00.123,45'],
        ])('rejects leading-zero grouping before a decimal mark in %s', (locale, input) => {
            expect(parseAmountToMinor(input, 2, locale)).toBeNull()
        })

        it.each([
            ['en', '12,34'],
            ['es', '12.34'],
            ['pt-BR', '12.34'],
        ])('accepts the other phone-keyboard decimal mark in %s when it cannot be grouping', (locale, input) => {
            expect(parseAmountToMinor(input, 2, locale)).toBe('1234')
        })

        it.each([
            ['en', '12.345'],
            ['es', '12,345'],
            ['pt-BR', '12,345'],
        ])('rejects excess precision in %s instead of rounding behind the typed value', (locale, input) => {
            expect(parseAmountToMinor(input, 2, locale)).toBeNull()
        })

        it.each([
            ['en', '4,500'],
            ['es', '4.500'],
            ['pt-BR', '4.500'],
        ])('preserves grouped whole units for zero-decimal currencies in %s', (locale, input) => {
            expect(parseAmountToMinor(input, 0, locale)).toBe('4500')
        })

        it.each([
            ['en', '4500.4'],
            ['es', '4500,4'],
            ['pt-BR', '4500,4'],
        ])('rejects fractional units for zero-decimal currencies in %s', (locale, input) => {
            expect(parseAmountToMinor(input, 0, locale)).toBeNull()
        })
    })
})

describe('parseExportAmountToMinor', () => {
    it('uses zero-decimal currency metadata to read either grouping convention', () => {
        expect(parseExportAmountToMinor('1,234', 0)).toBe('1234')
        expect(parseExportAmountToMinor('1.234', 0)).toBe('1234')
        expect(parseExportAmountToMinor('1,234,567', 0)).toBe('1234567')
        expect(parseExportAmountToMinor('1.234.567', 0)).toBe('1234567')
    })

    it('accepts explicit zero fractions but refuses fractional zero-decimal source money', () => {
        expect(parseExportAmountToMinor('1234.00', 0)).toBe('1234')
        expect(parseExportAmountToMinor('1,234.00', 0)).toBe('1234')
        expect(parseExportAmountToMinor('1234.5', 0)).toBeNull()
        expect(parseExportAmountToMinor('12,34', 0)).toBeNull()
    })

    it('retains the established decimal and grouping rules for currencies with fractions', () => {
        expect(parseExportAmountToMinor('1,234.56', 2)).toBe('123456')
        expect(parseExportAmountToMinor('1.234,56', 2)).toBe('123456')
        expect(parseExportAmountToMinor('1,234', 2)).toBe('123400')
        expect(parseExportAmountToMinor('1.234', 2)).toBe('123400')
        expect(parseExportAmountToMinor('1,234,567', 2)).toBe('123456700')
        expect(parseExportAmountToMinor('0,123', 2)).toBeNull()
        expect(parseExportAmountToMinor('1,234.567', 2)).toBeNull()
        expect(parseExportAmountToMinor('1.234,567', 2)).toBeNull()
    })

    it('refuses the 1000x-ambiguous single-separator shape for three-decimal exports', () => {
        expect(parseExportAmountToMinor('1,234', 3)).toBeNull()
        expect(parseExportAmountToMinor('1.234', 3)).toBeNull()
        expect(parseExportAmountToMinor('0.234', 3)).toBe('234')
        expect(parseExportAmountToMinor('1,234,567', 3)).toBe('1234567000')
    })
})

describe('isAmountInputAcceptable', () => {
    it('lets an amount be typed one character at a time', () => {
        for (const partial of ['', '1', '12', '12.', '12.3', '12.34']) {
            expect(isAmountInputAcceptable(partial, 2, 'en')).toBe(true)
        }
    })

    it.each([
        ['en', ['1', '1,', '1,2', '1,23', '1,234', '1,234,', '1,234,5', '1,234,56', '1,234,567']],
        ['es', ['1', '1.', '1.2', '1.23', '1.234', '1.234.', '1.234.5', '1.234.56', '1.234.567']],
        ['pt-BR', ['1', '1.', '1.2', '1.23', '1.234', '1.234.', '1.234.5', '1.234.56', '1.234.567']],
    ])('lets a grouped million be typed one character at a time in %s', (locale, partials) => {
        for (const partial of partials) expect(isAmountInputAcceptable(partial, 2, locale)).toBe(true)
    })

    it('lets a grouped whole be typed in a currency with no cents', () => {
        // COP: the separator can only be grouping here, and every step of
        // "1,234" is mid-group until the last digit lands.
        for (const partial of ['1', '1,', '1,2', '1,23', '1,234']) {
            expect(isAmountInputAcceptable(partial, 0, 'en')).toBe(true)
        }
    })

    it('allows a field to be emptied, and a decimal mark before its digits', () => {
        expect(isAmountInputAcceptable('', 2, 'en')).toBe(true)
        expect(isAmountInputAcceptable('.', 2, 'en')).toBe(true)
        expect(isAmountInputAcceptable(',', 2, 'es')).toBe(true)
    })

    it('refuses whitespace on its own — it is on the way to nothing', () => {
        expect(isAmountInputAcceptable('   ', 2, 'en')).toBe(false)
        expect(isAmountInputAcceptable('\t', 2, 'en')).toBe(false)
    })

    it('refuses what the parser could never read as money', () => {
        expect(isAmountInputAcceptable('taxi', 2, 'en')).toBe(false)
        expect(isAmountInputAcceptable('12e5', 2, 'en')).toBe(false)
        expect(isAmountInputAcceptable('-5', 2, 'en')).toBe(false)
        expect(isAmountInputAcceptable('+5', 2, 'en')).toBe(false)
        expect(isAmountInputAcceptable('12.3.4', 2, 'en')).toBe(false)
        expect(isAmountInputAcceptable('12.34.', 2, 'en')).toBe(false)
        // A second decimal mark, in either convention.
        expect(isAmountInputAcceptable('12.34.5', 2, 'en')).toBe(false)
        expect(isAmountInputAcceptable('12,34,5', 2, 'es')).toBe(false)
    })

    it('stops at the precision the currency actually has', () => {
        expect(isAmountInputAcceptable('12.345', 2, 'en')).toBe(false)
        expect(isAmountInputAcceptable('1,2345', 2, 'en')).toBe(false)
        expect(isAmountInputAcceptable('4500.4', 0, 'en')).toBe(false)
        expect(isAmountInputAcceptable('4500', 0, 'en')).toBe(true)
    })

    it.each([
        ['en', '1,234'],
        ['es', '1.234'],
        ['pt-BR', '1.234'],
    ])('accepts locale grouping in %s, the same as the parser does', (locale, input) => {
        expect(isAmountInputAcceptable(input, 2, locale)).toBe(true)
    })

    it('accepts exactly what the parser accepts once the value is complete', () => {
        for (const input of ['0', '0.5', '1234.56', '1,234.56']) {
            expect(isAmountInputAcceptable(input, 2, 'en')).toBe(parseAmountToMinor(input, 2, 'en') !== null)
        }
    })
})

describe('formatting', () => {
    it('normalises editable amounts with the locale decimal mark and no grouping', () => {
        expect(formatAmountInput('123456', 2, 'en')).toBe('1234.56')
        expect(formatAmountInput('123456', 2, 'es')).toBe('1234,56')
        expect(formatAmountInput('123456', 2, 'pt-BR')).toBe('1234,56')
        expect(formatAmountInput('4500', 0, 'pt-BR')).toBe('4500')
    })

    it('renders minor units with the right separator and symbol', () => {
        expect(formatMinorPlain('1234', 2)).toBe('12.34')
        expect(formatMinorPlain('4', 2)).toBe('0.04')
        expect(formatMinorPlain('4500', 0)).toBe('4500')
        expect(formatMoney('1234', 'EUR')).toBe('€12.34')
        expect(formatMoney('-1234', 'EUR')).toBe('-€12.34')
    })

    /**
     * The catalog owns the decimal count. Intl's own default for COP is 2 and the API says 0,
     * and a hero balance formatted with the wrong scale is the JPY bug from the changelog.
     *
     * `\u00a0` throughout: Intl separates symbol from amount with a NO-BREAK space, not an
     * ordinary one, and an assertion written with a plain space fails in a way that looks like
     * the two strings are identical.
     */
    it('keeps the catalog decimals rather than the currency default', () => {
        expect(formatMoney('4500', 'JPY')).toBe('¥4,500')
        expect(formatMoney('4500', 'COP')).toBe('COP\u00a04,500')
    })

    /** The whole point of the change: separators and symbol placement follow the reader. */
    it('formats in the active locale', () => {
        expect(formatMoney('123456', 'EUR', undefined, 'en')).toBe('€1,234.56')
        // Spanish puts the symbol last and, by its own rule, does not group a four-digit whole.
        expect(formatMoney('123456', 'EUR', undefined, 'es')).toBe('1234,56\u00a0€')
        expect(formatMoney('123456', 'BRL', undefined, 'pt-BR')).toBe('R$\u00a01.234,56')
    })

    /** Formatting must never throw mid-render — an unknown code falls back, it does not blow up. */
    it('survives a currency code Intl has never heard of', () => {
        expect(() => formatMoney('1234', 'WAT')).not.toThrow()
        expect(() => formatMoney('1234', 'not-a-code')).not.toThrow()
    })

    /** `Intl.NumberFormat` is handed the exact decimal string, so nothing rounds through a double. */
    it('does not lose digits past 2^53', () => {
        expect(formatMoney('900719925474099123', 'EUR', undefined, 'en')).toBe('€9,007,199,254,740,991.23')
    })

    it('keeps both signed bigint ceilings exact', () => {
        expect(formatMoney('9223372036854775807', 'EUR', undefined, 'en')).toBe('€92,233,720,368,547,758.07')
        expect(formatMoney('-9223372036854775808', 'EUR', undefined, 'en')).toBe('-€92,233,720,368,547,758.08')
    })

    it.each([
        ['en', '¥1,234,567', 'ARS\u00a0123,456,789.00'],
        ['es-419', '\u00a51,234,567', '$123,456,789.00'],
        ['pt-br', 'JP¥\u00a01.234.567', 'ARS\u00a0123.456.789,00'],
    ])('uses native JPY and ARS grouping in %s', (locale, jpy, ars) => {
        expect(formatMoney('1234567', 'JPY', undefined, locale)).toBe(jpy)
        expect(formatMoney('12345678900', 'ARS', undefined, locale)).toBe(ars)
    })

    /**
     * THE back-compat lock. Every room in production settles in one of these twelve, and widening
     * the catalog from twelve codes to 162 must not move a single character of what they render.
     * The twelve symbols are pinned in the generated catalog for exactly this reason, and pinned
     * symbols are what keeps all twelve on the Intl branch.
     */
    it('renders the twelve legacy currencies exactly as it always has', () => {
        expect([
            formatMoney('123456', 'USD', undefined, 'en'),
            formatMoney('123456', 'EUR', undefined, 'en'),
            formatMoney('123456', 'GBP', undefined, 'en'),
            formatMoney('123456', 'ARS', undefined, 'en'),
            formatMoney('123456', 'BRL', undefined, 'en'),
            formatMoney('123456', 'MXN', undefined, 'en'),
            formatMoney('123456', 'COP', undefined, 'en'),
            formatMoney('123456', 'CHF', undefined, 'en'),
            formatMoney('123456', 'THB', undefined, 'en'),
            formatMoney('123456', 'JPY', undefined, 'en'),
            formatMoney('123456', 'AUD', undefined, 'en'),
            formatMoney('123456', 'CAD', undefined, 'en'),
        ]).toEqual([
            '$1,234.56',
            '€1,234.56',
            '£1,234.56',
            'ARS\u00a01,234.56',
            'R$1,234.56',
            'MX$1,234.56',
            'COP\u00a0123,456',
            'CHF\u00a01,234.56',
            'THB\u00a01,234.56',
            '¥123,456',
            'A$1,234.56',
            'CA$1,234.56',
        ])
        expect(formatMoney('123456', 'EUR', undefined, 'es')).toBe('1234,56\u00a0€')
        expect(formatMoney('123456', 'BRL', undefined, 'pt-BR')).toBe('R$\u00a01.234,56')
    })

    /**
     * es-419 resolved the default symbol display to the bare ISO code, so `$34.87` used to render
     * as `USD 34.87` across the app and on the recap card. `narrowSymbol` restores the graphical
     * symbol for Spanish; en (and pt-br) already resolve one, so the fix is a no-op there.
     */
    it('renders a currency symbol, not the ISO code, for es-419', () => {
        const usd = formatMoney('3487', 'USD', undefined, 'es-419')
        expect(usd).toContain('$')
        expect(usd).not.toContain('USD')
        const eur = formatMoney('9000', 'EUR', undefined, 'es-419')
        expect(eur).toContain('€')
        expect(eur).not.toContain('EUR')
        // The fix is scoped to Spanish — English keeps its exact symbol, unchanged.
        expect(formatMoney('3487', 'USD', undefined, 'en')).toBe('$34.87')
    })

    /**
     * 61 of the 162 catalog codes have no symbol, and every invented ticker has none either. Those
     * print `12.34 AED` — the rule lives in `currency-rules.ts` and BOTH sides import it, so the
     * balance in the app, the amount on the OG card and the number in an error all agree.
     *
     * Under a thousand so no grouping is involved: the server does not group and the client does,
     * which is a difference of locale rather than of rule.
     */
    it('agrees with the server on a currency that has no symbol', () => {
        for (const code of ['AED', 'BEER', 'WAT']) {
            expect(formatMoney('1234', code, undefined, 'en')).toBe(formatMinor(1234n, code))
        }
        expect(formatMoney('1234', 'AED', undefined, 'en')).toBe('12.34 AED')
    })

    /**
     * The two ways Intl was wrong about a code it should not have been asked about. A four-letter
     * ticker it refuses outright, which used to drop the currency and print a bare `1234.00`; a
     * three-letter non-currency it accepts happily, because it never checks ISO 4217.
     */
    it('keeps the code on an amount Intl cannot or should not format', () => {
        expect(formatMoney('123456', 'BEER', undefined, 'en')).toBe('1,234.56 BEER')
        expect(formatMoney('1234', 'DOG', undefined, 'en')).toBe('12.34 DOG')
        expect(currencyInfo('BEER').decimals).toBe(2)
    })
})

describe('dense overview money', () => {
    it.each([
        ['en', '¥1.2M', 'ARS\u00a0123.5M'],
        ['es-419', '\u00a51.2\u00a0M', '$123.5\u00a0M'],
        ['pt-br', 'JP¥\u00a01,2\u00a0mi', 'ARS\u00a0123,5\u00a0mi'],
    ])('uses the locale-native JPY and ARS compact convention in %s', (locale, jpy, ars) => {
        expect(formatCompactMoney('1234567', 'JPY', undefined, locale)).toBe(jpy)
        expect(formatCompactMoney('12345678900', 'ARS', undefined, locale)).toBe(ars)
    })

    it('shrinks exact text before compacting and always carries the full amount', () => {
        expect(overviewMoneyPresentation('123456', 'ARS', undefined, 'en')).toEqual({
            exact: 'ARS\u00a01,234.56',
            visible: 'ARS\u00a01,234.56',
            compact: false,
            scale: 'smallest',
        })
        expect(overviewMoneyPresentation('12345678900', 'ARS', undefined, 'en')).toEqual({
            exact: 'ARS\u00a0123,456,789.00',
            visible: 'ARS\u00a0123.5M',
            compact: true,
            scale: 'regular',
        })
    })
})

describe('large raw-input preview', () => {
    it('stays quiet for ordinary values and groups large JPY without changing the field', () => {
        expect(formatLargeAmountPreview('9999', 'JPY', undefined, 'en')).toBeNull()
        expect(formatLargeAmountPreview('10000', 'JPY', undefined, 'en')).toBe('¥10,000')
        expect(formatLargeAmountPreview('10000', 'JPY', undefined, 'es-419')).toBe('\u00a510,000')
        expect(formatLargeAmountPreview('10000', 'JPY', undefined, 'pt-br')).toBe('JP¥\u00a010.000')
    })

    it('uses the reader locale for large ARS entry', () => {
        expect(formatLargeAmountPreview('12345678900', 'ARS', undefined, 'en')).toBe('ARS\u00a0123,456,789.00')
        expect(formatLargeAmountPreview('12345678900', 'ARS', undefined, 'es-419')).toBe('$123,456,789.00')
        expect(formatLargeAmountPreview('12345678900', 'ARS', undefined, 'pt-br')).toBe('ARS\u00a0123.456.789,00')
    })
})

describe('minorToExactNumber', () => {
    it('admits only values whose major-unit Number returns to the identical minor bigint', () => {
        expect(minorToExactNumber('1234', 2)).toBe(12.34)
        // Division by 100 collapses this otherwise-safe integer onto its neighbour.
        expect(minorToExactNumber('9007199254740990', 2)).toBeNull()
        expect(minorToExactNumber('9007199254740991', 2)).toBe(90071992547409.9)
    })

    it('locks the 2^53 boundary instead of assuming every large integer behaves alike', () => {
        expect(minorToExactNumber('9007199254740991', 0)).toBe(9007199254740991)
        // 2^53 is representable, but it is outside the safe-integer contract used
        // for decimal display and must therefore take the exact static path too.
        expect(minorToExactNumber('9007199254740992', 0)).toBeNull()
        expect(minorToExactNumber('9007199254740993', 0)).toBeNull()
        expect(minorToExactNumber('-9007199254740993', 0)).toBeNull()
    })

    it('keeps signed bigint ceilings out of NumberFlow', () => {
        expect(minorToExactNumber('9223372036854775807', 0)).toBeNull()
        expect(minorToExactNumber('-9223372036854775808', 0)).toBeNull()
    })
})

describe('formatMoneyParts', () => {
    /** The contract that matters: reassembling the parts must give back exactly `formatMoney`.
     *  Styling the symbol is not allowed to change, drop or reorder a single character. */
    const rejoin = (...args: Parameters<typeof formatMoneyParts>) =>
        formatMoneyParts(...args)
            .map((part) => part.value)
            .join('')

    it('reassembles into the same string formatMoney produces', () => {
        for (const [minor, code, locale] of [
            ['123456', 'EUR', 'en'],
            ['123456', 'EUR', 'es'],
            ['123456', 'BRL', 'pt-BR'],
            ['-1148', 'GBP', 'en'],
            ['4500', 'JPY', 'en'],
            ['0', 'CHF', 'es'],
        ] as const) {
            expect(rejoin(minor, code, undefined, locale)).toBe(formatMoney(minor, code, undefined, locale))
        }
    })

    it('isolates the symbol wherever the locale puts it', () => {
        expect(formatMoneyParts('123456', 'EUR', undefined, 'en')).toEqual([
            { type: 'currency', value: '€' },
            { type: 'text', value: '1,234.56' },
        ])
        // Spanish puts it last, behind a non-breaking space that belongs to the text run.
        expect(formatMoneyParts('123456', 'EUR', undefined, 'es')).toEqual([
            { type: 'text', value: '1234,56 ' },
            { type: 'currency', value: '€' },
        ])
    })

    it('keeps the minus sign with the digits, not with the symbol', () => {
        expect(formatMoneyParts('-1148', 'EUR', undefined, 'en')).toEqual([
            { type: 'text', value: '-' },
            { type: 'currency', value: '€' },
            { type: 'text', value: '11.48' },
        ])
    })

    /** A currency with no symbol still gets a `currency` part, or the styling would have nothing
     *  to hold on to and the code would be styled as three digits of the number. */
    it('makes the code its own run when the currency has no symbol', () => {
        expect(formatMoneyParts('123456', 'BEER', undefined, 'en')).toEqual([
            { type: 'text', value: '1,234.56 ' },
            { type: 'currency', value: 'BEER' },
        ])
        expect(formatMoneyParts('1234', 'not-a-code')).toEqual([
            { type: 'text', value: '12.34 ' },
            { type: 'currency', value: 'not-a-code' },
        ])
    })
})

describe('displaySymbol', () => {
    it('drops a symbol that only repeats the code', () => {
        // The catalog gives CHF the symbol "CHF " — "CHF CHF" is not a currency chip.
        expect(displaySymbol(currencyInfo('CHF'))).toBe('')
        expect(displaySymbol(currencyInfo('BRL'))).toBe('R$')
        expect(displaySymbol(currencyInfo('USD'))).toBe('$')
    })
})

describe('currencyDisplayName', () => {
    it('names the currency in the active locale', () => {
        expect(currencyDisplayName('BRL', 'en').toLowerCase()).toContain('brazilian')
        expect(currencyDisplayName('BRL', 'pt-BR').toLowerCase()).toContain('real')
    })

    it('never answers with the bare code when the catalog has a name', () => {
        // A locale Intl has no currency data for must still not produce "BRL — BRL".
        expect(currencyDisplayName('BRL', 'zz-ZZ')).not.toBe('BRL')
    })

    it('falls back to the code for something outside the catalog entirely', () => {
        expect(currencyDisplayName('not-a-code', 'en')).toBe('not-a-code')
    })
})

describe('equalSplitMinor', () => {
    it('spreads the remainder one unit at a time and always sums to the total', () => {
        expect(equalSplitMinor('1000', 3)).toEqual(['334', '333', '333'])
        expect(equalSplitMinor('1000', 3).reduce((a, b) => a + BigInt(b), 0n)).toBe(1000n)
        expect(equalSplitMinor('0', 2)).toEqual(['0', '0'])
        expect(equalSplitMinor('100', 0)).toEqual([])
    })
})
