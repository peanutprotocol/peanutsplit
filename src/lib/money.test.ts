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
})

describe('formatting', () => {
    it('renders minor units with the right separator and symbol', () => {
        expect(formatMinorPlain('1234', 2)).toBe('12.34')
        expect(formatMinorPlain('4', 2)).toBe('0.04')
        expect(formatMinorPlain('4500', 0)).toBe('4500')
        expect(formatMoney('1234', 'EUR')).toBe('€12.34')
        expect(formatMoney('4500', 'JPY')).toBe('¥4500')
        expect(formatMoney('-1234', 'EUR')).toBe('-€12.34')
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
