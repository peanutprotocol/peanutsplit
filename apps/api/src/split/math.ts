// Pure money math for expense-splitting rooms. All amounts are BigInt minor
// units. The room's base currency is authoritative for shares, balances and
// settlements; per-expense amounts are converted into it at creation time.

import { currencyDecimals } from './currencies'

/**
 * Convert `amountMinor` (in `fromCurrency` smallest units) into the room base
 * currency's smallest units, at `rate` (major-to-major from→base). Indicative
 * rounding to the base currency's smallest unit — good enough for display; not
 * a settlement figure.
 */
export function convertToBaseMinor(
	amountMinor: bigint,
	fromCurrency: string,
	baseCurrency: string,
	rate: number
): bigint {
	if (fromCurrency === baseCurrency && rate === 1) return amountMinor
	const fromDec = currencyDecimals(fromCurrency)
	const baseDec = currencyDecimals(baseCurrency)
	const amountMajor = Number(amountMinor) / 10 ** fromDec
	const baseMajor = amountMajor * rate
	return BigInt(Math.round(baseMajor * 10 ** baseDec))
}

/**
 * Split `total` evenly across `n` members using largest-remainder rounding so
 * the shares sum EXACTLY to `total` (no cent is lost or invented). The first
 * `total % n` members each absorb one extra minor unit.
 */
export function splitEqual(total: bigint, n: number): bigint[] {
	if (n <= 0) throw new Error('splitEqual requires at least one member')
	const base = total / BigInt(n)
	const remainder = total - base * BigInt(n) // magnitude < n, sign follows total
	const extras = Number(remainder < 0n ? -remainder : remainder)
	const bump = remainder < 0n ? -1n : 1n
	return Array.from({ length: n }, (_, i) => base + (i < extras ? bump : 0n))
}

/**
 * Normalize caller-supplied exact shares so they sum EXACTLY to `total`.
 *
 * Positive rounding drift is absorbed by the largest share. Negative drift is
 * removed from the largest shares in order, but never below zero. Fractional FX
 * remainders are no longer available at this layer, so this deterministic
 * largest-first adjustment is the narrowest safe reconciliation.
 */
export function normalizeExact(shares: bigint[], total: bigint): bigint[] {
	if (shares.length === 0) throw new Error('normalizeExact requires at least one share')
	if (total < 0n || shares.some((share) => share < 0n)) {
		throw new Error('normalizeExact requires non-negative amounts')
	}
	const sum = shares.reduce((a, b) => a + b, 0n)
	const drift = total - sum
	if (drift === 0n) return shares.slice()

	const order = shares
		.map((amount, index) => ({ amount, index }))
		.sort((a, b) => (a.amount === b.amount ? a.index - b.index : a.amount > b.amount ? -1 : 1))
	const out = shares.slice()

	if (drift > 0n) {
		out[order[0].index] += drift
		return out
	}

	let remaining = -drift
	for (const { index } of order) {
		const take = out[index] < remaining ? out[index] : remaining
		out[index] -= take
		remaining -= take
		if (remaining === 0n) break
	}
	if (remaining !== 0n) throw new Error('exact shares cannot reconcile to a negative total')
	return out
}

export type BalanceInput = {
	memberIds: string[]
	expenses: {
		paidByMemberId: string
		baseAmountMinor: bigint
		shares: { memberId: string; amountMinor: bigint }[]
	}[]
	settlements: { fromMemberId: string; toMemberId: string; amountMinor: bigint }[]
}

/**
 * Net balance per member, in base minor units. Positive = the group owes them
 * (they fronted more than their share); negative = they owe. Sums to zero.
 *
 * A settlement from A→B means A handed B money to clear a debt: it raises A's
 * balance (less in the hole) and lowers B's (they've been paid back).
 */
export function computeBalances(input: BalanceInput): Map<string, bigint> {
	const net = new Map<string, bigint>(input.memberIds.map((id) => [id, 0n]))
	const add = (id: string, delta: bigint) => net.set(id, (net.get(id) ?? 0n) + delta)
	for (const e of input.expenses) {
		add(e.paidByMemberId, e.baseAmountMinor)
		for (const s of e.shares) add(s.memberId, -s.amountMinor)
	}
	for (const s of input.settlements) {
		add(s.fromMemberId, s.amountMinor)
		add(s.toMemberId, -s.amountMinor)
	}
	return net
}

export type Transfer = { fromMemberId: string; toMemberId: string; amountMinor: bigint }

type BalanceEntry = { id: string; amount: bigint }

/**
 * The exact solver is exponential and runs synchronously inside
 * `buildRoomState`, which serves reads as well as writes. Eighteen nonzero
 * balances require 262,144 subset states; twenty require 1,048,576. Keep the
 * same bounded policy as the web room engine so both APIs suggest the same
 * minimum-transfer plan for ordinary rooms and stay predictable for large
 * imports.
 */
export const EXACT_SETTLEMENT_MAX_NONZERO_BALANCES = 18

const byAmountThenId = (a: BalanceEntry, b: BalanceEntry) =>
	a.amount === b.amount ? a.id.localeCompare(b.id) : a.amount > b.amount ? -1 : 1

const byTransferAmountThenParties = (a: Transfer, b: Transfer) => {
	if (a.amountMinor !== b.amountMinor) return a.amountMinor > b.amountMinor ? -1 : 1
	const from = a.fromMemberId.localeCompare(b.fromMemberId)
	return from !== 0 ? from : a.toMemberId.localeCompare(b.toMemberId)
}

/**
 * The bounded fallback: sort each side by amount and member id, then walk them
 * linearly. It is deterministic regardless of Map insertion order and clears
 * every valid balance map in at most n - 1 transfers.
 */
function greedyTransfers(balances: Map<string, bigint>): Transfer[] {
	const entries = [...balances.entries()].map(([id, amount]) => ({ id, amount }))
	const debtors = entries
		.filter((entry) => entry.amount < 0n)
		.map((entry) => ({ id: entry.id, amount: -entry.amount }))
		.sort(byAmountThenId)
	const creditors = entries
		.filter((entry) => entry.amount > 0n)
		.map((entry) => ({ id: entry.id, amount: entry.amount }))
		.sort(byAmountThenId)
	const transfers: Transfer[] = []
	let debtorIndex = 0
	let creditorIndex = 0
	while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
		const debtor = debtors[debtorIndex]
		const creditor = creditors[creditorIndex]
		const amount = debtor.amount < creditor.amount ? debtor.amount : creditor.amount
		if (amount > 0n) {
			transfers.push({ fromMemberId: debtor.id, toMemberId: creditor.id, amountMinor: amount })
		}
		debtor.amount -= amount
		creditor.amount -= amount
		if (debtor.amount === 0n) debtorIndex++
		if (creditor.amount === 0n) creditorIndex++
	}
	return transfers
}

/**
 * Partition nonzero balances into as many zero-sum groups as possible.
 *
 * If K is that maximum and m people have nonzero balances, an exact plan needs
 * m - K transfers: every zero-sum component of size s needs at least s - 1,
 * and the greedy walk realizes that bound inside each reconstructed component.
 *
 * `groups[mask]` is the greatest number of zero-sum prefixes in an ordering of
 * that subset. Appending one entry creates another group exactly when the whole
 * subset sums to zero. This is O(m * 2^m) time and O(2^m) memory.
 */
function exactTransfers(entries: readonly BalanceEntry[]): Transfer[] {
	if (entries.length === 0) return []

	// Canonical input order makes DP tie-breaking and the resulting plan
	// independent of Map insertion order.
	const ordered = [...entries].sort((a, b) => a.id.localeCompare(b.id))
	const stateCount = 2 ** ordered.length
	// First this byte marks zero-sum subsets; the ascending DP can overwrite a
	// mask with its group count after every smaller predecessor is final. A
	// Gray-code walk finds those zero sums with one BigInt delta per mask, so the
	// serialization hot path needs no 262k-element BigInt array.
	const groups = new Uint8Array(stateCount)
	let previousMask = 0
	let runningSum = 0n
	for (let step = 1; step < stateCount; step++) {
		const grayMask = step ^ (step >>> 1)
		const changedBit = grayMask ^ previousMask
		const changedIndex = 31 - Math.clz32(changedBit)
		runningSum += (grayMask & changedBit) !== 0 ? ordered[changedIndex].amount : -ordered[changedIndex].amount
		if (runningSum === 0n) groups[grayMask] = 1
		previousMask = grayMask
	}

	for (let mask = 1; mask < stateCount; mask++) {
		const closesGroup = groups[mask]
		let bestPreviousGroups = 0
		let candidates = mask
		while (candidates !== 0) {
			const bit = candidates & -candidates
			const previousGroups = groups[mask ^ bit]
			if (previousGroups > bestPreviousGroups) bestPreviousGroups = previousGroups
			candidates ^= bit
		}
		groups[mask] = bestPreviousGroups + closesGroup
	}

	// Recover a canonical predecessor that attains each stored optimum. Only m
	// masks are revisited, so recomputing sums is O(m^2) and avoids storing a
	// second BigInt table.
	const order = new Array<number>(ordered.length)
	let mask = stateCount - 1
	for (let position = ordered.length - 1; position >= 0; position--) {
		let sum = 0n
		let summands = mask
		while (summands !== 0) {
			const bit = summands & -summands
			sum += ordered[31 - Math.clz32(bit)].amount
			summands ^= bit
		}

		const previousGroupCount = groups[mask] - (sum === 0n ? 1 : 0)
		let candidates = mask
		while (candidates !== 0) {
			const bit = candidates & -candidates
			if (groups[mask ^ bit] === previousGroupCount) {
				order[position] = 31 - Math.clz32(bit)
				mask ^= bit
				break
			}
			candidates ^= bit
		}
	}

	const zeroSumGroups: BalanceEntry[][] = []
	let current: BalanceEntry[] = []
	let currentSum = 0n
	for (const index of order) {
		const entry = ordered[index]
		current.push(entry)
		currentSum += entry.amount
		if (currentSum === 0n) {
			zeroSumGroups.push(current)
			current = []
		}
	}

	return zeroSumGroups.flatMap((group) => greedyTransfers(new Map(group.map((entry) => [entry.id, entry.amount]))))
}

/**
 * An exact minimum-transfer plan for ordinary rooms, with deterministic greedy
 * fallback for large or malformed balance maps. This matches the web room
 * engine's bounded settlement policy while retaining the API Transfer shape.
 */
export function simplifyDebts(balances: Map<string, bigint>): Transfer[] {
	const nonzero = [...balances.entries()]
		.filter(([, amount]) => amount !== 0n)
		.map(([id, amount]) => ({ id, amount }))
	const total = nonzero.reduce((sum, entry) => sum + entry.amount, 0n)
	const greedy = greedyTransfers(balances)

	if (total !== 0n || nonzero.length > EXACT_SETTLEMENT_MAX_NONZERO_BALANCES) return greedy

	// Every nonzero debtor and creditor must touch at least one transfer. When
	// greedy reaches that lower bound, it is already proven exact and common
	// one-payer rooms avoid allocating the subset table.
	const debtorCount = nonzero.filter((entry) => entry.amount < 0n).length
	const creditorCount = nonzero.length - debtorCount
	if (greedy.length === Math.max(debtorCount, creditorCount)) return greedy

	const exact = exactTransfers(nonzero)
	// Keep the established deterministic plan when exact search cannot remove a
	// step. Improved plans put the largest payment first for the settle UI.
	return exact.length < greedy.length ? exact.sort(byTransferAmountThenParties) : greedy
}

/**
 * The most `from` can hand `to` without inverting the ledger: the smaller of
 * what `from` still owes the group and what `to` is still owed by it. Zero (or
 * negative) means there is nothing to settle in that direction.
 *
 * Recording a payment is not naturally idempotent, so without this ceiling a
 * double-tapped "mark as paid" recorded the debt twice and flipped who owed
 * whom.
 */
export function settleableAmount(balances: Map<string, bigint>, fromMemberId: string, toMemberId: string): bigint {
	const owes = -(balances.get(fromMemberId) ?? 0n)
	const isOwed = balances.get(toMemberId) ?? 0n
	if (owes <= 0n || isOwed <= 0n) return 0n
	return owes < isOwed ? owes : isOwed
}
