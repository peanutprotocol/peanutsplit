import { describe, expect, test } from '@jest/globals'
import {
	convertToBaseMinor,
	splitEqual,
	normalizeExact,
	computeBalances,
	simplifyDebts,
	settleableAmount,
} from './math'

describe('splitEqual', () => {
	test('divides evenly when it divides cleanly', () => {
		expect(splitEqual(900n, 3)).toEqual([300n, 300n, 300n])
	})

	test('largest-remainder: shares always sum back to the total', () => {
		const shares = splitEqual(1000n, 3) // 10.00 / 3
		expect(shares).toEqual([334n, 333n, 333n])
		expect(shares.reduce((a, b) => a + b, 0n)).toBe(1000n)
	})

	test('handles n larger than total minor units', () => {
		const shares = splitEqual(2n, 5)
		expect(shares.reduce((a, b) => a + b, 0n)).toBe(2n)
		expect(shares).toEqual([1n, 1n, 0n, 0n, 0n])
	})

	test('rejects zero members', () => {
		expect(() => splitEqual(100n, 0)).toThrow()
	})
})

describe('normalizeExact', () => {
	test('leaves already-exact shares untouched', () => {
		expect(normalizeExact([500n, 500n], 1000n)).toEqual([500n, 500n])
	})

	test('absorbs positive drift onto the largest share', () => {
		// conversion produced 333+333+333 = 999 but total is 1000
		expect(normalizeExact([333n, 333n, 333n], 1000n)).toEqual([334n, 333n, 333n])
	})

	test('absorbs negative drift onto the largest share', () => {
		expect(normalizeExact([400n, 400n, 300n], 1000n)).toEqual([300n, 400n, 300n])
	})
})

describe('convertToBaseMinor', () => {
	test('identity when same currency and unit rate', () => {
		expect(convertToBaseMinor(1234n, 'EUR', 'EUR', 1)).toBe(1234n)
	})

	test('converts across 2-decimal currencies', () => {
		// 10.00 THB at 0.028 USD/THB → 0.28 USD → 28 minor
		expect(convertToBaseMinor(1000n, 'THB', 'USD', 0.028)).toBe(28n)
	})

	test('converts across differing decimals (JPY 0dp → USD 2dp)', () => {
		// 1000 JPY at 0.0067 → 6.70 USD → 670 minor
		expect(convertToBaseMinor(1000n, 'JPY', 'USD', 0.0067)).toBe(670n)
	})
})

describe('computeBalances', () => {
	test('two people, one expense split equally', () => {
		// Alice pays 10.00, split 5.00 each → Bob owes Alice 5.00
		const net = computeBalances({
			memberIds: ['a', 'b'],
			expenses: [
				{
					paidByMemberId: 'a',
					baseAmountMinor: 1000n,
					shares: [
						{ memberId: 'a', amountMinor: 500n },
						{ memberId: 'b', amountMinor: 500n },
					],
				},
			],
			settlements: [],
		})
		expect(net.get('a')).toBe(500n)
		expect(net.get('b')).toBe(-500n)
	})

	test('settlement zeroes out the debt', () => {
		const net = computeBalances({
			memberIds: ['a', 'b'],
			expenses: [
				{
					paidByMemberId: 'a',
					baseAmountMinor: 1000n,
					shares: [
						{ memberId: 'a', amountMinor: 500n },
						{ memberId: 'b', amountMinor: 500n },
					],
				},
			],
			settlements: [{ fromMemberId: 'b', toMemberId: 'a', amountMinor: 500n }],
		})
		expect(net.get('a')).toBe(0n)
		expect(net.get('b')).toBe(0n)
	})

	test('balances always sum to zero', () => {
		const net = computeBalances({
			memberIds: ['a', 'b', 'c'],
			expenses: [
				{
					paidByMemberId: 'a',
					baseAmountMinor: 3000n,
					shares: [
						{ memberId: 'a', amountMinor: 1000n },
						{ memberId: 'b', amountMinor: 1000n },
						{ memberId: 'c', amountMinor: 1000n },
					],
				},
				{
					paidByMemberId: 'b',
					baseAmountMinor: 1500n,
					shares: [
						{ memberId: 'a', amountMinor: 500n },
						{ memberId: 'b', amountMinor: 500n },
						{ memberId: 'c', amountMinor: 500n },
					],
				},
			],
			settlements: [],
		})
		const sum = [...net.values()].reduce((a, b) => a + b, 0n)
		expect(sum).toBe(0n)
	})
})

describe('simplifyDebts', () => {
	test('single debt', () => {
		const transfers = simplifyDebts(
			new Map([
				['a', 500n],
				['b', -500n],
			])
		)
		expect(transfers).toEqual([{ fromMemberId: 'b', toMemberId: 'a', amountMinor: 500n }])
	})

	test('three-way nets down to at most n-1 transfers and clears everyone', () => {
		// a is owed 20, b owes 15, c owes 5
		const balances = new Map([
			['a', 2000n],
			['b', -1500n],
			['c', -500n],
		])
		const transfers = simplifyDebts(balances)
		expect(transfers.length).toBeLessThanOrEqual(2)
		// Apply the transfers and confirm all balances reach zero
		const settled = new Map(balances)
		for (const t of transfers) {
			settled.set(t.fromMemberId, settled.get(t.fromMemberId)! + t.amountMinor)
			settled.set(t.toMemberId, settled.get(t.toMemberId)! - t.amountMinor)
		}
		for (const v of settled.values()) expect(v).toBe(0n)
	})

	test('no transfers when everyone is square', () => {
		expect(
			simplifyDebts(
				new Map([
					['a', 0n],
					['b', 0n],
				])
			)
		).toEqual([])
	})
})

describe('settleableAmount', () => {
	const ALICE = 'alice'
	const BOB = 'bob'
	const CARA = 'cara'
	// Alice owes 20.00, Bob is owed 20.00.
	const simple = () =>
		new Map<string, bigint>([
			[ALICE, -2000n],
			[BOB, 2000n],
		])

	test('is the debt when both sides match', () => {
		expect(settleableAmount(simple(), ALICE, BOB)).toBe(2000n)
	})

	test('is zero once the debt is cleared — this is what stops a double-tap flipping the ledger', () => {
		const settled = new Map<string, bigint>([
			[ALICE, 0n],
			[BOB, 0n],
		])
		expect(settleableAmount(settled, ALICE, BOB)).toBe(0n)
	})

	test('is zero in the wrong direction', () => {
		expect(settleableAmount(simple(), BOB, ALICE)).toBe(0n)
	})

	test('is capped by whichever side is smaller', () => {
		// Alice owes 30.00 but Bob is only owed 12.00 — the rest is owed to Cara.
		const balances = new Map<string, bigint>([
			[ALICE, -3000n],
			[BOB, 1200n],
			[CARA, 1800n],
		])
		expect(settleableAmount(balances, ALICE, BOB)).toBe(1200n)
		expect(settleableAmount(balances, ALICE, CARA)).toBe(1800n)
	})

	test('is zero for members with no balance at all', () => {
		expect(settleableAmount(simple(), 'nobody', BOB)).toBe(0n)
		expect(settleableAmount(simple(), ALICE, 'nobody')).toBe(0n)
	})

	test('every suggested transfer is settleable in full', () => {
		const balances = new Map<string, bigint>([
			[ALICE, -3000n],
			[BOB, 1200n],
			[CARA, 1800n],
		])
		for (const t of simplifyDebts(balances)) {
			expect(settleableAmount(balances, t.fromMemberId, t.toMemberId)).toBeGreaterThanOrEqual(t.amountMinor)
		}
	})
})
