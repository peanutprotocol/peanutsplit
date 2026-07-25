import { formatMoney, toMinorString, memberColor, initials } from '@/utils/split-format'
import type { CurrencyInfo } from '@/services/split.types'

const MAP: Record<string, CurrencyInfo> = {
	EUR: { code: 'EUR', symbol: '€', name: 'Euro', decimals: 2 },
	JPY: { code: 'JPY', symbol: '¥', name: 'Japanese Yen', decimals: 0 },
	THB: { code: 'THB', symbol: '฿', name: 'Thai Baht', decimals: 2 },
}

describe('toMinorString', () => {
	test.each([
		['12.34', 2, '1234'],
		['12', 2, '1200'],
		['0.5', 2, '50'],
		['1,234.5', 2, '123450'],
		['3000', 0, '3000'],
		['', 2, '0'],
		['.', 2, '0'],
	])('parses %p (dp=%p) -> %p', (input, dp, want) => {
		expect(toMinorString(input, dp)).toBe(want)
	})

	test.each(['1e3', '0x10', 'Infinity', '-5', 'abc'])('rejects unsafe input %p -> "0"', (input) => {
		expect(toMinorString(input, 2)).toBe('0')
	})
})

describe('formatMoney', () => {
	test('2-decimal with symbol', () => {
		expect(formatMoney('1234', 'EUR', MAP)).toBe('€12.34')
		expect(formatMoney('50', 'EUR', MAP)).toBe('€0.50')
	})
	test('negative keeps the sign before the symbol', () => {
		expect(formatMoney('-815', 'EUR', MAP)).toBe('-€8.15')
	})
	test('0-decimal currency has no fractional part + thousands separator', () => {
		expect(formatMoney('300000', 'JPY', MAP)).toBe('¥300,000')
	})
	test('thousands separator on 2-decimal', () => {
		expect(formatMoney('100000', 'THB', MAP)).toBe('฿1,000.00')
	})
	test('unknown currency falls back to code prefix + 2 decimals', () => {
		expect(formatMoney('1234', 'XYZ')).toBe('XYZ 12.34')
	})
})

describe('member display helpers', () => {
	test('memberColor is deterministic and within the palette', () => {
		expect(memberColor(0)).toBe(memberColor(8)) // wraps at palette length 8
		expect(memberColor(3)).toBe(memberColor(11))
	})
	test('initials', () => {
		expect(initials('Alice')).toBe('AL')
		expect(initials('Al Bo')).toBe('AB')
		expect(initials('konrad')).toBe('KO')
	})
})
