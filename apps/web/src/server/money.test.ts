import { describe, expect, it } from 'vitest'
import { CURRENCIES, convertMinorAtRate, decimalsOf, formatMinor, parseMinor, publicCurrencies } from '@/server/money'

const usdPerUnit = (code: string) => CURRENCIES.find((c) => c.code === code)!.usdPerUnit
const staticRate = (from: string, to: string) => usdPerUnit(from) / usdPerUnit(to)

describe('currency catalog', () => {
    it('carries the twelve supported currencies', () => {
        expect(publicCurrencies()).toHaveLength(12)
    })

    it('keeps JPY and COP zero-decimal', () => {
        expect(decimalsOf('JPY')).toBe(0)
        expect(decimalsOf('COP')).toBe(0)
        expect(decimalsOf('EUR')).toBe(2)
    })

    it('never leaks the static rate into the public catalog', () => {
        expect(publicCurrencies()[0]).not.toHaveProperty('usdPerUnit')
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

    it('puts the sign before the symbol', () => {
        expect(formatMinor(-1234n, 'USD')).toBe('-$12.34')
    })
})
