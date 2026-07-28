import { describe, expect, it } from 'vitest'
import { equalSplitMinor, formatMinorPlain, formatMoney, parseAmountToMinor } from './money'

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
})

describe('formatting', () => {
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
})

describe('equalSplitMinor', () => {
    it('spreads the remainder one unit at a time and always sums to the total', () => {
        expect(equalSplitMinor('1000', 3)).toEqual(['334', '333', '333'])
        expect(equalSplitMinor('1000', 3).reduce((a, b) => a + BigInt(b), 0n)).toBe(1000n)
        expect(equalSplitMinor('0', 2)).toEqual(['0', '0'])
        expect(equalSplitMinor('100', 0)).toEqual([])
    })
})
