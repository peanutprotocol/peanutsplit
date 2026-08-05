import { describe, expect, test } from '@jest/globals'
import {
	convertToBaseMinor,
	splitEqual,
	normalizeExact,
	computeBalances,
	simplifyDebts,
	settleableAmount,
	EXACT_SETTLEMENT_MAX_NONZERO_BALANCES,
} from './math'

const balancesAfterSuggestions = (balances: Map<string, bigint>) => {
	const after = new Map(balances)
	for (const transfer of simplifyDebts(balances)) {
		after.set(transfer.fromMemberId, (after.get(transfer.fromMemberId) ?? 0n) + transfer.amountMinor)
		after.set(transfer.toMemberId, (after.get(transfer.toMemberId) ?? 0n) - transfer.amountMinor)
	}
	return after
}

/** Independent exact oracle for small property cases. It chooses zero-sum
 * groups containing the first remaining member instead of using the production
 * solver's entry-order DP. */
function exactMinimumTransferCount(amounts: readonly bigint[]): number {
	const nonzero = amounts.filter((amount) => amount !== 0n)
	if (nonzero.length === 0) return 0

	const stateCount = 2 ** nonzero.length
	const sums = new Array<bigint>(stateCount)
	sums[0] = 0n
	for (let mask = 1; mask < stateCount; mask++) {
		const bit = mask & -mask
		const index = 31 - Math.clz32(bit)
		sums[mask] = sums[mask ^ bit] + nonzero[index]
	}

	const memo = new Map<number, number>([[0, 0]])
	const maximumGroups = (mask: number): number => {
		const remembered = memo.get(mask)
		if (remembered !== undefined) return remembered

		const first = mask & -mask
		let best = Number.NEGATIVE_INFINITY
		for (let subset = mask; subset !== 0; subset = (subset - 1) & mask) {
			if ((subset & first) === 0 || sums[subset] !== 0n) continue
			best = Math.max(best, 1 + maximumGroups(mask ^ subset))
		}
		memo.set(mask, best)
		return best
	}

	return nonzero.length - maximumGroups(stateCount - 1)
}

function mulberry32(seed: number): () => number {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
		mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296
	}
}

const randomBalancedAmounts = (seed: number): bigint[] => {
	const random = mulberry32(seed)
	const count = 2 + Math.floor(random() * 7)
	const amounts = Array.from({ length: count - 1 }, () => BigInt(Math.floor(random() * 11) - 5))
	amounts.push(-amounts.reduce((sum, amount) => sum + amount, 0n))
	return amounts
}

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

	test('never makes a share negative when independent FX rounding exceeds the converted total', () => {
		// R$0.03 converts to a little over half a euro cent, so each share
		// independently rounds to one cent. The R$0.12 total converts to only two.
		const rate = 0.2 / 1.08
		const baseTotal = convertToBaseMinor(12n, 'BRL', 'EUR', rate)
		const converted = Array.from({ length: 4 }, () => convertToBaseMinor(3n, 'BRL', 'EUR', rate))
		const normalized = normalizeExact(converted, baseTotal)

		expect(baseTotal).toBe(2n)
		expect(converted).toEqual([1n, 1n, 1n, 1n])
		expect(normalized).toEqual([0n, 0n, 1n, 1n])
		expect(normalized.every((share) => share >= 0n)).toBe(true)
		expect(normalized.reduce((sum, share) => sum + share, 0n)).toBe(baseTotal)
	})

	test('preserves non-negativity and the exact target across varied inputs', () => {
		for (let size = 1; size <= 12; size++) {
			const shares = Array.from({ length: size }, (_, index) => BigInt((index * 7 + size) % 19))
			const sum = shares.reduce((a, b) => a + b, 0n)
			for (let target = 0n; target <= sum + 3n; target++) {
				const normalized = normalizeExact(shares, target)
				expect(normalized.every((share) => share >= 0n)).toBe(true)
				expect(normalized.reduce((a, b) => a + b, 0n)).toBe(target)
			}
		}
	})

	test('rejects negative amounts rather than manufacturing a ledger', () => {
		expect(() => normalizeExact([-1n, 2n], 1n)).toThrow('non-negative')
		expect(() => normalizeExact([1n, 2n], -1n)).toThrow('non-negative')
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

	test('finds the three-transfer optimum that greedy misses for five people', () => {
		const balances = new Map([
			['ada', -700n],
			['bo', -600n],
			['cora', 600n],
			['dev', 400n],
			['emi', 300n],
		])

		expect(simplifyDebts(balances)).toHaveLength(3)
		expect([...balancesAfterSuggestions(balances).values()]).toEqual([0n, 0n, 0n, 0n, 0n])
	})

	test('matches an independent exact oracle across deterministic small balance maps', () => {
		for (let seed = 1; seed <= 120; seed++) {
			const amounts = randomBalancedAmounts(seed)
			const balances = new Map(amounts.map((amount, index) => [`m${index}`, amount]))
			const transfers = simplifyDebts(balances)

			expect(`${seed}:${transfers.length}`).toBe(`${seed}:${exactMinimumTransferCount(amounts)}`)
			expect(`${seed}:${[...balancesAfterSuggestions(balances).values()].every((amount) => amount === 0n)}`).toBe(
				`${seed}:true`
			)
		}
	})

	test('is independent of balance-map insertion order when exact plans tie', () => {
		const entries: [string, bigint][] = [
			['ada', -700n],
			['bo', -600n],
			['cora', 600n],
			['dev', 400n],
			['emi', 300n],
		]

		expect(simplifyDebts(new Map(entries))).toEqual(simplifyDebts(new Map([...entries].reverse())))
	})

	test('preserves the greedy plan when exact search cannot remove a transfer', () => {
		const balances = new Map([
			['a', 1n],
			['b', 1n],
			['c', -9n],
			['d', -2n],
			['e', -1n],
			['f', 10n],
		])

		expect(simplifyDebts(balances)).toEqual([
			{ fromMemberId: 'c', toMemberId: 'f', amountMinor: 9n },
			{ fromMemberId: 'd', toMemberId: 'f', amountMinor: 1n },
			{ fromMemberId: 'd', toMemberId: 'a', amountMinor: 1n },
			{ fromMemberId: 'e', toMemberId: 'b', amountMinor: 1n },
		])
	})

	test('puts the largest payment first when an exact plan improves on greedy', () => {
		const balances = new Map([
			['a', -44n],
			['b', 36n],
			['c', 16n],
			['d', -16n],
			['e', 8n],
		])

		const transfers = simplifyDebts(balances)
		expect(transfers).toHaveLength(3)
		expect(transfers[0]).toEqual({ fromMemberId: 'a', toMemberId: 'b', amountMinor: 36n })
		expect([...balancesAfterSuggestions(balances).values()].every((amount) => amount === 0n)).toBe(true)
	})

	test('keeps exact arithmetic above Number.MAX_SAFE_INTEGER', () => {
		const unit = BigInt(Number.MAX_SAFE_INTEGER) + 2n
		const balances = new Map([
			['ada', -7n * unit],
			['bo', -6n * unit],
			['cora', 6n * unit],
			['dev', 4n * unit],
			['emi', 3n * unit],
		])

		expect(simplifyDebts(balances)).toHaveLength(3)
		expect([...balancesAfterSuggestions(balances).values()].every((amount) => amount === 0n)).toBe(true)
	})

	test('uses deterministic greedy fallback for an unbalanced malformed map', () => {
		expect(
			simplifyDebts(
				new Map([
					['debtor', -7n],
					['creditor-a', 5n],
					['creditor-b', 1n],
				])
			)
		).toEqual([
			{ fromMemberId: 'debtor', toMemberId: 'creditor-a', amountMinor: 5n },
			{ fromMemberId: 'debtor', toMemberId: 'creditor-b', amountMinor: 1n },
		])
	})

	test('keeps the 18-balance exact search inside the RoomState serialization budget', () => {
		const credits = [101n, 103n, 107n, 109n, 113n, 127n, 131n, 137n]
		const debts = [-41n, -53n, -59n, -61n, -67n, -71n, -73n, -503n]
		const balances = new Map<string, bigint>([
			...credits.map((amount, index) => [`core-creditor-${index}`, amount] as const),
			...debts.map((amount, index) => [`core-debtor-${index}`, amount] as const),
			['padding-creditor', 10_000n],
			['padding-debtor', -10_000n],
		])
		expect([...balances.values()].filter((amount) => amount !== 0n)).toHaveLength(
			EXACT_SETTLEMENT_MAX_NONZERO_BALANCES
		)

		// Warm V8 before measuring the synchronous path used by buildRoomState.
		expect(simplifyDebts(balances)).toHaveLength(15)
		const started = performance.now()
		for (let run = 0; run < 3; run++) simplifyDebts(balances)
		const perCall = (performance.now() - started) / 3

		expect(perCall).toBeLessThan(80)
		expect([...balancesAfterSuggestions(balances).values()].every((amount) => amount === 0n)).toBe(true)
	})

	test('uses the established deterministic greedy plan above the exact-search ceiling', () => {
		const padding = Array.from({ length: 7 }, (_, index) => {
			const amount = BigInt((index + 1) * 10_000)
			return [[`pad-debtor-${index}`, -amount] as const, [`pad-creditor-${index}`, amount] as const]
		}).flat()
		const balances = new Map<string, bigint>([
			...padding,
			['ada', -700n],
			['bo', -600n],
			['cora', 600n],
			['dev', 400n],
			['emi', 300n],
		])
		expect([...balances.values()].filter((amount) => amount !== 0n)).toHaveLength(
			EXACT_SETTLEMENT_MAX_NONZERO_BALANCES + 1
		)

		const expectedPadding = Array.from({ length: 7 }, (_, position) => {
			const index = 6 - position
			return {
				fromMemberId: `pad-debtor-${index}`,
				toMemberId: `pad-creditor-${index}`,
				amountMinor: BigInt((index + 1) * 10_000),
			}
		})
		expect(simplifyDebts(balances)).toEqual([
			...expectedPadding,
			{ fromMemberId: 'ada', toMemberId: 'cora', amountMinor: 600n },
			{ fromMemberId: 'ada', toMemberId: 'dev', amountMinor: 100n },
			{ fromMemberId: 'bo', toMemberId: 'dev', amountMinor: 300n },
			{ fromMemberId: 'bo', toMemberId: 'emi', amountMinor: 300n },
		])
		expect([...balancesAfterSuggestions(balances).values()].every((amount) => amount === 0n)).toBe(true)
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
