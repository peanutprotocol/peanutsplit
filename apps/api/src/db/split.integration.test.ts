/**
 * Integration tests for the money-writing paths, against a real Postgres.
 *
 * CLAUDE.md's hard line is that money code needs a test before it ships, and
 * the interesting failures here are not arithmetic — they're what happens when
 * two writes race, when a payment confirms twice, or when the balances move
 * underneath a payment in flight. None of that can be tested without a database.
 *
 * Each test works in its OWN room and nothing is ever truncated, so this is safe
 * to run against a shared dev database and safe to run concurrently with the app.
 * The ordinary unit command may skip when no database is reachable; the
 * `test:integration` release gate sets REQUIRE_DB=1 and fails closed.
 */

import 'dotenv/config'
import { describe, expect, test, beforeAll, afterAll } from '@jest/globals'
import { prisma } from '../db'
import {
	addExpense,
	addMember,
	confirmPeanutSettlement,
	createRoom,
	createSettleIntent,
	recordSettlement,
	buildRoomState,
	SplitError,
} from './split'

let dbUp = false

beforeAll(async () => {
	try {
		await prisma.$queryRaw`SELECT 1`
		dbUp = true
	} catch (error) {
		if (process.env.REQUIRE_DB === '1') throw error
		console.warn('[split] no database reachable — skipping integration tests')
	}
})

afterAll(async () => {
	if (dbUp) await prisma.$disconnect()
})

const itDb = (name: string, fn: () => Promise<void>) =>
	test(
		name,
		async () => {
			if (!dbUp) return
			await fn()
		},
		30000
	)

/** A room where Alice owes Bob exactly 20.00, plus Carol who owes nothing. */
async function roomWithDebt() {
	const slug = await createRoom({ title: 'Test room', baseCurrency: 'EUR' })
	const alice = await addMember(slug, 'Alice')
	const bob = await addMember(slug, 'Bob')
	await addExpense(slug, {
		description: 'Dinner',
		amountMinor: '4000',
		currency: 'EUR',
		splitKind: 'EQUAL',
		paidByMemberId: bob.id,
		participantMemberIds: [alice.id, bob.id],
	})
	return { slug, alice: alice.id, bob: bob.id }
}

const netOf = async (slug: string, memberId: string) => {
	const state = await buildRoomState(slug)
	return BigInt(state!.balances.find((b) => b.memberId === memberId)!.netMinor)
}
const settlementCount = async (slug: string) => (await buildRoomState(slug))!.settlements.length

const confirm = (reference: string, paymentId: string, amountMinor = 2000n, currency = 'EUR') =>
	confirmPeanutSettlement({
		reference,
		paymentId,
		idempotencyKey: `peanut:${paymentId}`,
		amountMinor,
		currency,
	})

describe('confirming a Peanut payment', () => {
	itDb('records the settlement and clears the debt', async () => {
		const { slug, alice, bob } = await roomWithDebt()
		const intent = await createSettleIntent(slug, { fromMemberId: alice, toMemberId: bob, amountMinor: '2000' })

		const result = await confirm(intent.reference, 'pay_happy')
		expect(result.outcome).toBe('recorded')
		expect(await settlementCount(slug)).toBe(1)
		expect(await netOf(slug, alice)).toBe(0n)
		expect(await netOf(slug, bob)).toBe(0n)
	})

	itDb('is a one-shot: a second, different payment on the same intent is refused', async () => {
		const { slug, alice, bob } = await roomWithDebt()
		const intent = await createSettleIntent(slug, { fromMemberId: alice, toMemberId: bob, amountMinor: '2000' })

		expect((await confirm(intent.reference, 'pay_1')).outcome).toBe('recorded')
		expect((await confirm(intent.reference, 'pay_2')).outcome).toBe('already-confirmed')
		expect((await confirm(intent.reference, 'pay_3')).outcome).toBe('already-confirmed')

		// The bug this guards: three receipts against one debt, inverting it.
		expect(await settlementCount(slug)).toBe(1)
		expect(await netOf(slug, alice)).toBe(0n)
	})

	itDb('the same payment delivered twice records once', async () => {
		const { slug, alice, bob } = await roomWithDebt()
		const intent = await createSettleIntent(slug, { fromMemberId: alice, toMemberId: bob, amountMinor: '2000' })

		expect((await confirm(intent.reference, 'pay_dup')).outcome).toBe('recorded')
		const second = await confirm(intent.reference, 'pay_dup')
		expect(['already-recorded', 'already-confirmed']).toContain(second.outcome)
		expect(await settlementCount(slug)).toBe(1)
	})

	itDb('survives concurrent delivery of the same payment', async () => {
		const { slug, alice, bob } = await roomWithDebt()
		const intent = await createSettleIntent(slug, { fromMemberId: alice, toMemberId: bob, amountMinor: '2000' })

		const results = await Promise.all(Array.from({ length: 8 }, () => confirm(intent.reference, 'pay_race')))
		expect(results.filter((r) => r.outcome === 'recorded')).toHaveLength(1)
		expect(await settlementCount(slug)).toBe(1)
	})

	itDb('STILL records when the balances moved while the payment was in flight', async () => {
		// The regression that matters most: rejecting here would mean real money
		// moved and the ledger says it never happened.
		const slug = await createRoom({ title: 'Midflight', baseCurrency: 'EUR' })
		const alice = await addMember(slug, 'Alice')
		const bob = await addMember(slug, 'Bob')
		const carol = await addMember(slug, 'Carol')
		await addExpense(slug, {
			description: 'Villa',
			amountMinor: '9000',
			currency: 'EUR',
			splitKind: 'EQUAL',
			paidByMemberId: bob.id,
		})
		const intent = await createSettleIntent(slug, {
			fromMemberId: alice.id,
			toMemberId: bob.id,
			amountMinor: '3000',
		})

		// Carol squares up by hand, so Bob is owed less than when Alice started.
		await recordSettlement(slug, { fromMemberId: carol.id, toMemberId: bob.id, amountMinor: '3000' })

		const result = await confirm(intent.reference, 'pay_midflight', 3000n)
		expect(result.outcome).toBe('recorded')
		expect(await netOf(slug, alice.id)).toBe(0n)
	})

	itDb('reports an overpayment rather than refusing it', async () => {
		const { slug, alice, bob } = await roomWithDebt()
		// Quote the full debt, then let someone else clear part of it first.
		const intent = await createSettleIntent(slug, { fromMemberId: alice, toMemberId: bob, amountMinor: '2000' })
		await prisma.splitSettleIntent.updateMany({
			where: { reference: intent.reference },
			data: { status: 'EXPIRED' },
		})
		await recordSettlement(slug, { fromMemberId: alice, toMemberId: bob, amountMinor: '1500' })

		const result = await confirm(intent.reference, 'pay_over', 2000n)
		expect(result.outcome).toBe('recorded')
		if (result.outcome === 'recorded') expect(result.overpaidBy).toBe(1500n)
		// Overpaying is a true fact, so the room now owes Alice the difference.
		expect(await netOf(slug, alice)).toBe(1500n)
	})

	itDb('still records a payment that confirms long after the room stopped waiting', async () => {
		// Expiry governs what the UI shows, never whether money is recorded.
		// Refusing a late confirmation would mean the money moved and the ledger
		// denies it — the exact failure this whole path exists to avoid.
		const { slug, alice, bob } = await roomWithDebt()
		const intent = await createSettleIntent(slug, { fromMemberId: alice, toMemberId: bob, amountMinor: '2000' })
		await prisma.splitSettleIntent.updateMany({
			where: { reference: intent.reference },
			data: { status: 'EXPIRED' },
		})

		expect((await confirm(intent.reference, 'pay_late')).outcome).toBe('recorded')
		expect(await netOf(slug, alice)).toBe(0n)
	})

	itDb('refuses a payload that disagrees with the intent', async () => {
		const { slug, alice, bob } = await roomWithDebt()
		const intent = await createSettleIntent(slug, { fromMemberId: alice, toMemberId: bob, amountMinor: '2000' })

		expect((await confirm(intent.reference, 'pay_wrong_amt', 1n)).outcome).toBe('amount-mismatch')
		expect((await confirm(intent.reference, 'pay_wrong_ccy', 2000n, 'USD')).outcome).toBe('currency-mismatch')
		expect(await settlementCount(slug)).toBe(0)
	})

	itDb('ignores a reference it has never issued', async () => {
		expect((await confirm('never-issued', 'pay_unknown')).outcome).toBe('unknown-reference')
	})
})

describe('starting a settle-up', () => {
	itDb('refuses a second handoff for the same debt', async () => {
		const { slug, alice, bob } = await roomWithDebt()
		await createSettleIntent(slug, { fromMemberId: alice, toMemberId: bob, amountMinor: '2000' })

		await expect(
			createSettleIntent(slug, { fromMemberId: alice, toMemberId: bob, amountMinor: '2000' })
		).rejects.toBeInstanceOf(SplitError)
	})

	itDb('mints only one handoff when the same debt is requested concurrently', async () => {
		const { slug, alice, bob } = await roomWithDebt()
		const attempts = await Promise.allSettled(
			Array.from({ length: 8 }, () =>
				createSettleIntent(slug, { fromMemberId: alice, toMemberId: bob, amountMinor: '2000' })
			)
		)

		expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1)
		expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(7)
		expect((await buildRoomState(slug))!.pendingSettleIntents).toHaveLength(1)
	})

	itDb('refuses a manual mark while a payment is confirming', async () => {
		const { slug, alice, bob } = await roomWithDebt()
		await createSettleIntent(slug, { fromMemberId: alice, toMemberId: bob, amountMinor: '2000' })

		await expect(
			recordSettlement(slug, { fromMemberId: alice, toMemberId: bob, amountMinor: '2000' })
		).rejects.toBeInstanceOf(SplitError)
		expect(await settlementCount(slug)).toBe(0)
	})

	itDb('refuses more than is owed, and the wrong direction', async () => {
		const { slug, alice, bob } = await roomWithDebt()
		await expect(
			createSettleIntent(slug, { fromMemberId: alice, toMemberId: bob, amountMinor: '2001' })
		).rejects.toBeInstanceOf(SplitError)
		await expect(
			createSettleIntent(slug, { fromMemberId: bob, toMemberId: alice, amountMinor: '100' })
		).rejects.toBeInstanceOf(SplitError)
	})

	itDb('lets a genuine second payment through once the first is done', async () => {
		const { slug, alice, bob } = await roomWithDebt()
		const first = await createSettleIntent(slug, { fromMemberId: alice, toMemberId: bob, amountMinor: '1000' })
		await confirm(first.reference, 'pay_part_1', 1000n)

		// Half the debt is left, so a fresh handoff must be allowed.
		const second = await createSettleIntent(slug, { fromMemberId: alice, toMemberId: bob, amountMinor: '1000' })
		expect((await confirm(second.reference, 'pay_part_2', 1000n)).outcome).toBe('recorded')
		expect(await netOf(slug, alice)).toBe(0n)
		expect(await settlementCount(slug)).toBe(2)
	})

	itDb('allows either an intent or a manual mark to claim a debt concurrently, never both', async () => {
		const { slug, alice, bob } = await roomWithDebt()
		const attempts = await Promise.allSettled([
			createSettleIntent(slug, { fromMemberId: alice, toMemberId: bob, amountMinor: '2000' }),
			recordSettlement(slug, {
				fromMemberId: alice,
				toMemberId: bob,
				amountMinor: '2000',
				idempotencyKey: 'manual-vs-intent',
			}),
		])

		expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1)
		expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1)
		const state = (await buildRoomState(slug))!
		expect(state.pendingSettleIntents.length + state.settlements.length).toBe(1)
	})
})

describe('manual settlements', () => {
	itDb('records once for a repeated tap with the same key', async () => {
		const { slug, alice, bob } = await roomWithDebt()
		const key = 'tap-abc'
		await recordSettlement(slug, { fromMemberId: alice, toMemberId: bob, amountMinor: '1000', idempotencyKey: key })
		await recordSettlement(slug, { fromMemberId: alice, toMemberId: bob, amountMinor: '1000', idempotencyKey: key })
		expect(await settlementCount(slug)).toBe(1)
	})

	itDb('cannot be pushed past the debt', async () => {
		const { slug, alice, bob } = await roomWithDebt()
		await recordSettlement(slug, { fromMemberId: alice, toMemberId: bob, amountMinor: '2000' })
		await expect(
			recordSettlement(slug, { fromMemberId: alice, toMemberId: bob, amountMinor: '2000' })
		).rejects.toBeInstanceOf(SplitError)
		expect(await netOf(slug, alice)).toBe(0n)
	})

	itDb('serializes distinct concurrent marks so their sum cannot exceed the debt', async () => {
		const { slug, alice, bob } = await roomWithDebt()
		const attempts = await Promise.allSettled(
			Array.from({ length: 8 }, (_, index) =>
				recordSettlement(slug, {
					fromMemberId: alice,
					toMemberId: bob,
					amountMinor: '1000',
					idempotencyKey: `concurrent-mark-${index}`,
				})
			)
		)

		// Two €10 marks consume the €20 debt. Every waiter after them must read
		// the committed remainder rather than the original €20 snapshot.
		expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(2)
		expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(6)
		expect(await settlementCount(slug)).toBe(2)
		expect(await netOf(slug, alice)).toBe(0n)
		expect(await netOf(slug, bob)).toBe(0n)
	})
})
