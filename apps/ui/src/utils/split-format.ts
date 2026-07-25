// Display helpers for split rooms: money formatting + deterministic member
// colors. Amounts arrive as stringified minor units.

import type { CurrencyInfo } from '@/services/split.types'

export type CurrencyMap = Record<string, CurrencyInfo>

export function toCurrencyMap(list: CurrencyInfo[]): CurrencyMap {
	return Object.fromEntries(list.map((c) => [c.code, c]))
}

/** Format minor units into a human string, e.g. "€25.93" or "-฿1,000". */
export function formatMoney(minor: string | number | bigint, code: string, currencies?: CurrencyMap): string {
	const meta = currencies?.[code]
	const decimals = meta?.decimals ?? 2
	const symbol = meta?.symbol ?? `${code} `
	const negative = String(minor).startsWith('-')
	const abs = BigInt(negative ? String(minor).slice(1) : String(minor))
	const divisor = 10n ** BigInt(decimals)
	const whole = abs / divisor
	const frac = abs % divisor
	const wholeStr = whole.toLocaleString('en-US')
	const fracStr = decimals > 0 ? '.' + frac.toString().padStart(decimals, '0') : ''
	return `${negative ? '-' : ''}${symbol}${wholeStr}${fracStr}`
}

/** Parse a user-typed major amount ("12.34") into a minor-unit string.
 *  Strict: only digits + one optional decimal point. Rejects '', '-' (no
 *  negatives), scientific notation ('1e3'), hex ('0x10') and 'Infinity' — all
 *  of which Number() would accept and then blow up BigInt() downstream. */
export function toMinorString(input: string, decimals: number): string {
	const cleaned = input.trim().replace(/,/g, '')
	if (cleaned === '' || cleaned === '.' || !/^\d*\.?\d*$/.test(cleaned)) return '0'
	const [whole = '0', frac = ''] = cleaned.split('.')
	const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals)
	const digits = `${whole}${fracPadded}`.replace(/^0+(?=\d)/, '')
	return digits || '0'
}

/** Readable green for credit amounts. `green-1` (#98E9AB) is a pastel fill and
 *  fails contrast as text, so balances use this darker green instead. */
export const CREDIT_GREEN = '#1f9d55'
export const DEBT_RED = '#e11900'

const MEMBER_COLORS = [
	'#FF90E8', // peanut pink
	'#98E9AB', // green
	'#FFC900', // yellow
	'#90C2FF', // blue
	'#C9A0FF', // purple
	'#FFB27A', // orange
	'#7AE0D0', // teal
	'#FF8A8A', // red
]

export function memberColor(colorSeed: number): string {
	return MEMBER_COLORS[colorSeed % MEMBER_COLORS.length]
}

export function initials(name: string): string {
	const parts = name.trim().split(/\s+/)
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
