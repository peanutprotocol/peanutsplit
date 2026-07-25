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
 * Normalize caller-supplied exact shares so they sum EXACTLY to `total`. Any
 * rounding drift (e.g. from currency conversion) is absorbed by the
 * largest-magnitude share so the ledger always balances.
 */
export function normalizeExact(shares: bigint[], total: bigint): bigint[] {
	if (shares.length === 0) throw new Error('normalizeExact requires at least one share')
	const sum = shares.reduce((a, b) => a + b, 0n)
	const drift = total - sum
	if (drift === 0n) return shares.slice()
	let idx = 0
	for (let i = 1; i < shares.length; i++) {
		if (abs(shares[i]) > abs(shares[idx])) idx = i
	}
	const out = shares.slice()
	out[idx] += drift
	return out
}

function abs(x: bigint): bigint {
	return x < 0n ? -x : x
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

/**
 * Minimal-ish set of transfers that zeroes the balances (the "settle up"
 * suggestion). Greedy min-cash-flow: repeatedly pay the biggest debtor into the
 * biggest creditor. Produces at most n-1 transfers — the same heuristic
 * Splitwise uses (optimal partition is NP-hard and not worth it here).
 */
export function simplifyDebts(balances: Map<string, bigint>): Transfer[] {
	const net = new Map<string, bigint>()
	for (const [id, amt] of balances) if (amt !== 0n) net.set(id, amt)

	const transfers: Transfer[] = []
	while (net.size > 0) {
		let maxCreditor: string | null = null
		let maxDebtor: string | null = null
		for (const [id, amt] of net) {
			if (amt > 0n && (maxCreditor === null || amt > net.get(maxCreditor)!)) maxCreditor = id
			if (amt < 0n && (maxDebtor === null || amt < net.get(maxDebtor)!)) maxDebtor = id
		}
		if (maxCreditor === null || maxDebtor === null) break // residue (shouldn't happen when sum==0)

		const credit = net.get(maxCreditor)!
		const debt = -net.get(maxDebtor)!
		const pay = credit < debt ? credit : debt
		transfers.push({ fromMemberId: maxDebtor, toMemberId: maxCreditor, amountMinor: pay })

		const newCredit = credit - pay
		const newDebt = net.get(maxDebtor)! + pay
		if (newCredit === 0n) net.delete(maxCreditor)
		else net.set(maxCreditor, newCredit)
		if (newDebt === 0n) net.delete(maxDebtor)
		else net.set(maxDebtor, newDebt)
	}
	return transfers
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
