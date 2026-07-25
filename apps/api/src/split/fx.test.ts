import { describe, expect, test } from '@jest/globals'
import { getReferenceRate } from './fx'
import { isSupportedCurrency, currencyDecimals } from './currencies'

describe('getReferenceRate', () => {
	test('identity for the same currency', async () => {
		const r = await getReferenceRate('EUR', 'EUR')
		expect(r).toEqual({ rate: 1, source: 'identity' })
	})

	test('cross-rate direction: units of `to` per 1 `from`', async () => {
		// THB (0.028 USD) -> EUR (1.08 USD): 1 THB = 0.028/1.08 EUR ≈ 0.02593
		const r = await getReferenceRate('THB', 'EUR')
		expect(r.source).toBe('reference-usd')
		expect(r.rate).toBeCloseTo(0.028 / 1.08, 6)
	})

	test('inverse pair multiplies back to ~1', async () => {
		const a = await getReferenceRate('THB', 'EUR')
		const b = await getReferenceRate('EUR', 'THB')
		expect(a.rate * b.rate).toBeCloseTo(1, 6)
	})

	test('throws on an unsupported currency', async () => {
		await expect(getReferenceRate('EUR', 'XYZ')).rejects.toThrow()
	})
})

describe('currency helpers', () => {
	test('known vs unknown support', () => {
		expect(isSupportedCurrency('USD')).toBe(true)
		expect(isSupportedCurrency('XYZ')).toBe(false)
	})

	test('decimals: fiat 2, zero-decimal currencies 0, unknown defaults 2', () => {
		expect(currencyDecimals('EUR')).toBe(2)
		expect(currencyDecimals('JPY')).toBe(0)
		expect(currencyDecimals('IDR')).toBe(0)
		expect(currencyDecimals('XYZ')).toBe(2)
	})
})
