// DB access + orchestration for expense-splitting rooms. Pure money math lives
// in ../split/math; FX in ../split/fx. Everything here is anonymous — access is
// gated only by knowing the room slug (see schema.prisma § SPLIT ROOMS).

import { randomBytes } from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../db'
import { getReferenceRate } from '../split/fx'
import { isSupportedCurrency } from '../split/currencies'
import {
	convertToBaseMinor,
	splitEqual,
	normalizeExact,
	computeBalances,
	simplifyDebts,
	settleableAmount,
} from '../split/math'

/** Handler-mappable error: carries the HTTP status to return. */
export class SplitError extends Error {
	constructor(
		public readonly status: number,
		message: string
	) {
		super(message)
	}
}

// Reject absurd amounts before they overflow the BigInt/int8 column (→ 500).
// 10^15 minor units is 10 trillion in a 2-dp currency — far beyond any trip.
const MAX_MINOR = 10n ** 15n

function assertSaneAmount(amt: bigint, label = 'amount'): void {
	if (amt <= 0n) throw new SplitError(400, `${label} must be positive`)
	if (amt > MAX_MINOR) throw new SplitError(400, `${label} is too large`)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// A malformed path id would hit the uuid column cast and 500 — treat it as 404.
function assertUuidOr404(id: string): void {
	if (!UUID_RE.test(id)) throw new SplitError(404, 'not found')
}

/** URL-safe, high-entropy room token — possession of it IS the access control. */
function generateSlug(): string {
	return randomBytes(12).toString('base64url') // 96 bits, ~16 chars
}

function randomColorSeed(): number {
	return randomBytes(2).readUInt16BE(0) // 0..65535, client maps to a palette
}

export type NewExpenseInput = {
	description: string
	amountMinor: string
	currency: string
	paidByMemberId: string
	splitKind: 'EQUAL' | 'EXACT'
	/** EQUAL: who shares it (defaults to all members). */
	participantMemberIds?: string[]
	/** EXACT: each member's share in the expense currency's minor units. */
	exactShares?: { memberId: string; amountMinor: string }[]
	createdByMemberId?: string
}

export type NewSettlementInput = {
	fromMemberId: string
	toMemberId: string
	amountMinor: string
	method?: 'MANUAL' | 'PEANUT'
	/** Client-generated, stable across retries of the same tap. */
	idempotencyKey?: string
}

export type CreatedMember = { id: string; displayName: string; colorSeed: number }

export async function createRoom(input: { title?: string; baseCurrency: string }): Promise<string> {
	if (!isSupportedCurrency(input.baseCurrency)) {
		throw new SplitError(400, `unsupported base currency: ${input.baseCurrency}`)
	}
	const slug = generateSlug()
	await prisma.splitRoom.create({
		data: { slug, title: input.title?.trim() || null, baseCurrency: input.baseCurrency },
	})
	return slug
}

/**
 * Add a member and return the CREATED row. Callers must store this id directly
 * (never diff the members array): under concurrent joins the array order is not
 * insertion order, so a diff can hand a device the wrong identity.
 */
export async function addMember(slug: string, displayName: string): Promise<CreatedMember> {
	const room = await prisma.splitRoom.findUnique({ where: { slug }, select: { id: true } })
	if (!room) throw new SplitError(404, 'room not found')
	const name = displayName.trim()
	if (!name) throw new SplitError(400, 'display name required')
	return prisma.splitMember.create({
		data: { roomId: room.id, displayName: name, colorSeed: randomColorSeed() },
		select: { id: true, displayName: true, colorSeed: true },
	})
}

type RoomForExpense = { id: string; baseCurrency: string; memberIds: Set<string> }
type ComputedExpense = {
	amountMinor: bigint
	baseAmountMinor: bigint
	rate: number
	source: string
	participants: string[]
	shareAmounts: bigint[]
	/** Per-participant amount as typed in the expense currency (EXACT), else null. */
	enteredAmounts: (bigint | null)[]
}

/** Validate an expense input and compute its base amount + per-member shares.
 *  Shared by add + update so the invariants can't drift between the two. */
async function computeExpense(room: RoomForExpense, input: NewExpenseInput): Promise<ComputedExpense> {
	if (!isSupportedCurrency(input.currency)) throw new SplitError(400, `unsupported currency: ${input.currency}`)
	if (!room.memberIds.has(input.paidByMemberId)) throw new SplitError(400, 'payer is not a member of this room')
	// Unchecked, this reached the FK directly: a non-UUID 500s, and a real
	// member id borrowed from another room passes the constraint and quietly
	// cross-links the two rooms.
	if (input.createdByMemberId != null && !room.memberIds.has(input.createdByMemberId)) {
		throw new SplitError(400, 'author is not a member of this room')
	}

	const amountMinor = BigInt(input.amountMinor)
	assertSaneAmount(amountMinor)

	const participants =
		input.splitKind === 'EXACT'
			? (input.exactShares ?? []).map((s) => s.memberId)
			: input.participantMemberIds?.length
				? input.participantMemberIds
				: [...room.memberIds]
	if (participants.length === 0) throw new SplitError(400, 'expense needs at least one participant')
	for (const id of participants) {
		if (!room.memberIds.has(id)) throw new SplitError(400, 'a participant is not a member of this room')
	}
	// A member listed twice would violate the (expense, member) unique index → 500.
	if (new Set(participants).size !== participants.length) {
		throw new SplitError(400, 'a member appears more than once')
	}

	// EXACT: the shares are authoritative — they MUST sum to the entered total.
	// (normalizeExact below only absorbs sub-unit FX rounding, never a real gap.)
	if (input.splitKind === 'EXACT') {
		let exactSum = 0n
		for (const s of input.exactShares ?? []) {
			const v = BigInt(s.amountMinor)
			if (v < 0n) throw new SplitError(400, 'exact shares cannot be negative')
			assertSaneAmount(v, 'share')
			exactSum += v
		}
		if (exactSum !== amountMinor) throw new SplitError(400, 'exact shares must add up to the total')
	}

	const { rate, source } = await getReferenceRate(input.currency, room.baseCurrency)
	const baseAmountMinor = convertToBaseMinor(amountMinor, input.currency, room.baseCurrency, rate)

	let shareAmounts: bigint[]
	let enteredAmounts: (bigint | null)[]
	if (input.splitKind === 'EXACT') {
		const converted = (input.exactShares ?? []).map((s) =>
			convertToBaseMinor(BigInt(s.amountMinor), input.currency, room.baseCurrency, rate)
		)
		shareAmounts = normalizeExact(converted, baseAmountMinor)
		enteredAmounts = (input.exactShares ?? []).map((s) => BigInt(s.amountMinor))
	} else {
		shareAmounts = splitEqual(baseAmountMinor, participants.length)
		enteredAmounts = participants.map((): bigint | null => null)
	}

	return { amountMinor, baseAmountMinor, rate, source, participants, shareAmounts, enteredAmounts }
}

export async function addExpense(slug: string, input: NewExpenseInput): Promise<void> {
	const room = await prisma.splitRoom.findUnique({
		where: { slug },
		include: { members: { where: { deletedAt: null }, select: { id: true } } },
	})
	if (!room) throw new SplitError(404, 'room not found')
	const memberIds = new Set(room.members.map((m) => m.id))
	const c = await computeExpense({ id: room.id, baseCurrency: room.baseCurrency, memberIds }, input)

	await prisma.$transaction(async (tx) => {
		const expense = await tx.splitExpense.create({
			data: {
				roomId: room.id,
				description: input.description.trim() || 'Expense',
				amountMinor: c.amountMinor,
				currency: input.currency,
				baseAmountMinor: c.baseAmountMinor,
				fxRate: new Prisma.Decimal(c.rate),
				fxSource: c.source,
				splitKind: input.splitKind,
				paidByMemberId: input.paidByMemberId,
				createdByMemberId: input.createdByMemberId ?? null,
			},
		})
		await tx.splitShare.createMany({
			data: c.participants.map((memberId, i) => ({
				expenseId: expense.id,
				memberId,
				amountMinor: c.shareAmounts[i],
				enteredAmountMinor: c.enteredAmounts[i],
			})),
		})
	})
}

/** Edit an existing expense: revalidate + recompute + replace its shares atomically. */
export async function updateExpense(slug: string, expenseId: string, input: NewExpenseInput): Promise<void> {
	assertUuidOr404(expenseId)
	const room = await prisma.splitRoom.findUnique({
		where: { slug },
		include: { members: { where: { deletedAt: null }, select: { id: true } } },
	})
	if (!room) throw new SplitError(404, 'room not found')
	const existing = await prisma.splitExpense.findFirst({
		where: { id: expenseId, roomId: room.id, deletedAt: null },
		select: { id: true },
	})
	if (!existing) throw new SplitError(404, 'expense not found')

	const memberIds = new Set(room.members.map((m) => m.id))
	const c = await computeExpense({ id: room.id, baseCurrency: room.baseCurrency, memberIds }, input)

	await prisma.$transaction(async (tx) => {
		await tx.splitShare.deleteMany({ where: { expenseId } })
		await tx.splitExpense.update({
			where: { id: expenseId },
			data: {
				description: input.description.trim() || 'Expense',
				amountMinor: c.amountMinor,
				currency: input.currency,
				baseAmountMinor: c.baseAmountMinor,
				fxRate: new Prisma.Decimal(c.rate),
				fxSource: c.source,
				splitKind: input.splitKind,
				paidByMemberId: input.paidByMemberId,
			},
		})
		await tx.splitShare.createMany({
			data: c.participants.map((memberId, i) => ({
				expenseId,
				memberId,
				amountMinor: c.shareAmounts[i],
				enteredAmountMinor: c.enteredAmounts[i],
			})),
		})
	})
}

export async function deleteExpense(slug: string, expenseId: string): Promise<void> {
	assertUuidOr404(expenseId)
	const room = await prisma.splitRoom.findUnique({ where: { slug }, select: { id: true } })
	if (!room) throw new SplitError(404, 'room not found')
	await prisma.splitExpense.updateMany({
		where: { id: expenseId, roomId: room.id, deletedAt: null },
		data: { deletedAt: new Date() },
	})
}

/** Undo a delete (soft-delete is reversible). No-op if not found / not deleted. */
export async function restoreExpense(slug: string, expenseId: string): Promise<void> {
	assertUuidOr404(expenseId)
	const room = await prisma.splitRoom.findUnique({ where: { slug }, select: { id: true } })
	if (!room) throw new SplitError(404, 'room not found')
	await prisma.splitExpense.updateMany({
		where: { id: expenseId, roomId: room.id, deletedAt: { not: null } },
		data: { deletedAt: null },
	})
}

export async function recordSettlement(slug: string, input: NewSettlementInput): Promise<void> {
	const room = await prisma.splitRoom.findUnique({
		where: { slug },
		include: { members: { where: { deletedAt: null }, select: { id: true } } },
	})
	if (!room) throw new SplitError(404, 'room not found')
	const ids = new Set(room.members.map((m) => m.id))
	if (!ids.has(input.fromMemberId) || !ids.has(input.toMemberId)) throw new SplitError(400, 'member not in room')
	if (input.fromMemberId === input.toMemberId) throw new SplitError(400, 'cannot settle with yourself')
	const amt = BigInt(input.amountMinor)
	assertSaneAmount(amt)

	// Recording a payment is not idempotent by nature, and a settlement that
	// overshoots the debt flips who owes whom — so a double-tap used to invert
	// the ledger. Two independent guards: the key makes the retry a no-op, and
	// the debt ceiling makes a genuine second payment impossible to record.
	//
	// The key is checked first on purpose. Once the first attempt lands there is
	// nothing left to settle, so checking the ceiling first would answer a plain
	// retry with "nothing to settle" — an error about a payment that in fact
	// went through.
	// A Peanut payment already on its way settles this debt on confirmation.
	// Recording it by hand too is the single likeliest way a real room ends up
	// with the balance inverted.
	await expireStaleIntents(room.id)
	if (await livePendingIntent(room.id, input.fromMemberId, input.toMemberId)) {
		throw new SplitError(409, 'a Peanut payment for this is still confirming — give it a moment')
	}

	if (input.idempotencyKey) {
		const already = await prisma.splitSettlement.findFirst({
			where: { roomId: room.id, idempotencyKey: input.idempotencyKey },
			select: { id: true },
		})
		if (already) return
	}

	try {
		await prisma.$transaction(async (tx) => {
			const owed = await settleableBetween(tx, room.id, input.fromMemberId, input.toMemberId)
			if (owed <= 0n) throw new SplitError(400, 'there is nothing to settle between these two')
			if (amt > owed) throw new SplitError(400, 'that is more than is owed between these two')
			await tx.splitSettlement.create({
				data: {
					roomId: room.id,
					fromMemberId: input.fromMemberId,
					toMemberId: input.toMemberId,
					amountMinor: amt,
					method: input.method ?? 'MANUAL',
					idempotencyKey: input.idempotencyKey ?? null,
				},
			})
		})
	} catch (err) {
		// Same key twice == the same tap arriving twice. Already recorded.
		if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return
		throw err
	}
}

/** Current settleable amount between two members, read inside the caller's
 *  transaction so the ceiling reflects settlements recorded a moment ago. */
async function settleableBetween(
	tx: Prisma.TransactionClient,
	roomId: string,
	fromMemberId: string,
	toMemberId: string
): Promise<bigint> {
	const [members, expenses, settlements] = await Promise.all([
		tx.splitMember.findMany({ where: { roomId, deletedAt: null }, select: { id: true } }),
		tx.splitExpense.findMany({
			where: { roomId, deletedAt: null },
			select: {
				paidByMemberId: true,
				baseAmountMinor: true,
				shares: { select: { memberId: true, amountMinor: true } },
			},
		}),
		tx.splitSettlement.findMany({
			where: { roomId },
			select: { fromMemberId: true, toMemberId: true, amountMinor: true },
		}),
	])
	const net = computeBalances({ memberIds: members.map((m) => m.id), expenses, settlements })
	return settleableAmount(net, fromMemberId, toMemberId)
}

/** Undo a settlement (hard delete — a settlement is just a record of a payment). */
export async function deleteSettlement(slug: string, settlementId: string): Promise<void> {
	assertUuidOr404(settlementId)
	const room = await prisma.splitRoom.findUnique({ where: { slug }, select: { id: true } })
	if (!room) throw new SplitError(404, 'room not found')
	await prisma.splitSettlement.deleteMany({ where: { id: settlementId, roomId: room.id } })
}

/**
 * Full room snapshot for the client: members, live (non-deleted) expenses with
 * their shares, settlements, computed net balances, and the suggested minimal
 * transfers to settle up. All monetary values are stringified minor units
 * (BigInt isn't JSON-serializable).
 */
export async function buildRoomState(slug: string) {
	const room = await prisma.splitRoom.findUnique({
		where: { slug },
		include: {
			members: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
			expenses: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, include: { shares: true } },
			settlements: { orderBy: { createdAt: 'desc' } },
			settleIntents: {
				// Bounded by time as well as status: an unreaped backlog would
				// otherwise be loaded on every poll by every member forever.
				where: { status: 'PENDING', createdAt: { gte: new Date(Date.now() - INTENT_STALE_MS) } },
				orderBy: { createdAt: 'desc' },
				take: 50,
			},
		},
	})
	if (!room) return null

	const memberIds = room.members.map((m) => m.id)
	const balances = computeBalances({
		memberIds,
		expenses: room.expenses.map((e) => ({
			paidByMemberId: e.paidByMemberId,
			baseAmountMinor: e.baseAmountMinor,
			shares: e.shares.map((s) => ({ memberId: s.memberId, amountMinor: s.amountMinor })),
		})),
		settlements: room.settlements.map((s) => ({
			fromMemberId: s.fromMemberId,
			toMemberId: s.toMemberId,
			amountMinor: s.amountMinor,
		})),
	})
	const suggested = simplifyDebts(balances)

	return {
		slug: room.slug,
		title: room.title,
		baseCurrency: room.baseCurrency,
		createdAt: room.createdAt.toISOString(),
		members: room.members.map((m) => ({ id: m.id, displayName: m.displayName, colorSeed: m.colorSeed })),
		expenses: room.expenses.map((e) => ({
			id: e.id,
			description: e.description,
			amountMinor: e.amountMinor.toString(),
			currency: e.currency,
			baseAmountMinor: e.baseAmountMinor.toString(),
			fxRate: e.fxRate.toString(),
			splitKind: e.splitKind,
			paidByMemberId: e.paidByMemberId,
			createdByMemberId: e.createdByMemberId,
			createdAt: e.createdAt.toISOString(),
			shares: e.shares.map((s) => ({
				memberId: s.memberId,
				amountMinor: s.amountMinor.toString(),
				enteredAmountMinor: s.enteredAmountMinor === null ? null : s.enteredAmountMinor.toString(),
			})),
		})),
		settlements: room.settlements.map((s) => ({
			id: s.id,
			fromMemberId: s.fromMemberId,
			toMemberId: s.toMemberId,
			amountMinor: s.amountMinor.toString(),
			method: s.method,
			peanutRef: s.peanutRef,
			createdAt: s.createdAt.toISOString(),
		})),
		// Everyone in the room sees a payment in flight, not just the tab that
		// started it — that tab is usually gone, because paying happens in
		// another app. It's also what stops someone else marking the same debt
		// paid by hand while the payment is still settling.
		pendingSettleIntents: room.settleIntents.map((i) => ({
			reference: i.reference,
			fromMemberId: i.fromMemberId,
			toMemberId: i.toMemberId,
			amountMinor: i.amountMinor.toString(),
			createdAt: i.createdAt.toISOString(),
		})),
		balances: memberIds.map((id) => ({ memberId: id, netMinor: (balances.get(id) ?? 0n).toString() })),
		suggestedTransfers: suggested.map((t) => ({
			fromMemberId: t.fromMemberId,
			toMemberId: t.toMemberId,
			amountMinor: t.amountMinor.toString(),
		})),
	}
}

// ─── Settling through Peanut ────────────────────────────────────────────────

/** How long a pending intent is shown as "in flight" before the room stops
 *  waiting on it. The payment can still confirm afterwards — this only governs
 *  what the UI says, never whether money is recorded. */
const INTENT_STALE_MS = 30 * 60 * 1000

/**
 * Retire intents nobody came back for.
 *
 * Done lazily on the room's own writes rather than on a schedule: this product
 * has no cron and shouldn't grow one, and an intent only matters while someone
 * is looking at that room. EXPIRED is bookkeeping, not a refusal — a payment
 * that confirms later is still recorded, because the money moved.
 */
async function expireStaleIntents(roomId: string): Promise<void> {
	await prisma.splitSettleIntent.updateMany({
		where: { roomId, status: 'PENDING', createdAt: { lt: new Date(Date.now() - INTENT_STALE_MS) } },
		data: { status: 'EXPIRED' },
	})
}

/** A live, unconfirmed handoff for exactly this debt. */
async function livePendingIntent(roomId: string, fromMemberId: string, toMemberId: string) {
	return prisma.splitSettleIntent.findFirst({
		where: {
			roomId,
			fromMemberId,
			toMemberId,
			status: 'PENDING',
			createdAt: { gte: new Date(Date.now() - INTENT_STALE_MS) },
		},
		select: { id: true, amountMinor: true },
	})
}

export type SettleIntent = {
	reference: string
	amountMinor: bigint
	roomTitle: string | null
	baseCurrency: string
}

/**
 * Start a settle-up through Peanut. Writes a PENDING intent and returns the
 * opaque reference the payment must carry back.
 *
 * The debt ceiling applies HERE, where the user is still choosing — not on the
 * confirmation, where the money has already moved.
 */
export async function createSettleIntent(slug: string, input: NewSettlementInput): Promise<SettleIntent> {
	const room = await prisma.splitRoom.findUnique({
		where: { slug },
		include: { members: { where: { deletedAt: null }, select: { id: true } } },
	})
	if (!room) throw new SplitError(404, 'room not found')
	const ids = new Set(room.members.map((m) => m.id))
	if (!ids.has(input.fromMemberId) || !ids.has(input.toMemberId)) throw new SplitError(400, 'member not in room')
	if (input.fromMemberId === input.toMemberId) throw new SplitError(400, 'cannot settle with yourself')
	const amt = BigInt(input.amountMinor)
	assertSaneAmount(amt)

	await expireStaleIntents(room.id)
	// One live handoff per pair. Two intents for the same debt both pass the
	// ceiling on their own and both confirm, recording the debt twice.
	const inFlight = await livePendingIntent(room.id, input.fromMemberId, input.toMemberId)
	if (inFlight) throw new SplitError(409, 'a payment for this is already in progress')

	const owed = await settleableBetween(prisma, room.id, input.fromMemberId, input.toMemberId)
	if (owed <= 0n) throw new SplitError(400, 'there is nothing to settle between these two')
	if (amt > owed) throw new SplitError(400, 'that is more than is owed between these two')

	// 128 bits of opacity. Carries no room slug and no member names: this
	// string travels to Peanut and may end up in a payment memo, a receipt
	// email or a support console, so it must grant nothing to whoever sees it.
	const reference = randomBytes(16).toString('base64url')
	await prisma.splitSettleIntent.create({
		data: {
			reference,
			roomId: room.id,
			fromMemberId: input.fromMemberId,
			toMemberId: input.toMemberId,
			amountMinor: amt,
		},
	})
	return { reference, amountMinor: amt, roomTitle: room.title, baseCurrency: room.baseCurrency }
}

export type ConfirmResult =
	| { outcome: 'recorded'; overpaidBy: bigint }
	| { outcome: 'already-recorded' }
	| { outcome: 'already-confirmed' }
	| { outcome: 'unknown-reference' }
	| { outcome: 'amount-mismatch'; expected: bigint; got: bigint }
	| { outcome: 'currency-mismatch'; expected: string; got: string }

/**
 * Record a payment Peanut has confirmed.
 *
 * Deliberately NOT `recordSettlement`. That path guards a user's tap with a
 * debt ceiling, which is right when someone is asking to record something. Here
 * the money has already moved, and the balances may well have shifted since the
 * intent was created — someone else settled, an expense got added. Applying the
 * ceiling would reject a real payment and leave the ledger claiming it never
 * happened, which is the worst outcome available to us.
 *
 * So the DEBT CEILING does not apply here: an overpayment is recorded and
 * reported rather than refused, because it is a true statement about the world
 * and the room can simply show the balance owed back the other way.
 *
 * Two things are still refused, because they mean we cannot honestly call the
 * result a verified receipt: a payload that disagrees with the intent on amount
 * or currency, and an intent that has already been confirmed. Each is logged at
 * error level for a human, since money moved and the ledger won't show it.
 */
export async function confirmPeanutSettlement(args: {
	reference: string
	paymentId: string
	idempotencyKey: string
	amountMinor: bigint
	currency: string
}): Promise<ConfirmResult> {
	const intent = await prisma.splitSettleIntent.findUnique({
		where: { reference: args.reference },
		include: { room: { select: { id: true, baseCurrency: true } } },
	})
	if (!intent) return { outcome: 'unknown-reference' }

	// The receipt asserts that this much money moved, so the assertion rests on
	// what Peanut reported — not on the amount someone asked us to quote.
	if (intent.room.baseCurrency !== args.currency) {
		return { outcome: 'currency-mismatch', expected: intent.room.baseCurrency, got: args.currency }
	}
	if (intent.amountMinor !== args.amountMinor) {
		return { outcome: 'amount-mismatch', expected: intent.amountMinor, got: args.amountMinor }
	}

	if (intent.status === 'CONFIRMED') {
		// One settle-up is one payment. Without this an intent is a standing
		// licence to mint receipts: a redelivery carrying a fresh id, or a
		// payment-request link paid twice, would each add another settlement
		// against a debt that is already cleared and flip who owes whom.
		return { outcome: 'already-confirmed' }
	}

	let overpaidBy = 0n
	try {
		await prisma.$transaction(async (tx) => {
			// Claim the intent FIRST, conditionally. Two callbacks for two
			// different payments against one intent would otherwise both read
			// PENDING and both write. Whoever loses this update writes nothing.
			// PENDING *or* EXPIRED. Expiry is only about what the room stops
			// waiting on; a payment that confirms an hour late is still real
			// money, and refusing it would leave the ledger denying it happened.
			// Only CONFIRMED blocks, which is what makes this one-shot.
			const claimed = await tx.splitSettleIntent.updateMany({
				where: { id: intent.id, status: { in: ['PENDING', 'EXPIRED'] } },
				data: { status: 'CONFIRMED', peanutPaymentId: args.paymentId, confirmedAt: new Date() },
			})
			if (claimed.count === 0) throw new AlreadyClaimed()

			// Read inside the transaction: outside it, two concurrent confirms
			// both see the pre-payment balance and each reports no overpayment
			// while the room ends up overpaid.
			const owed = await settleableBetween(tx, intent.roomId, intent.fromMemberId, intent.toMemberId)
			overpaidBy = args.amountMinor > owed ? args.amountMinor - owed : 0n

			await tx.splitSettlement.create({
				data: {
					roomId: intent.roomId,
					fromMemberId: intent.fromMemberId,
					toMemberId: intent.toMemberId,
					amountMinor: args.amountMinor,
					method: 'PEANUT',
					peanutRef: args.paymentId,
					idempotencyKey: args.idempotencyKey,
				},
			})
		})
	} catch (err) {
		if (err instanceof AlreadyClaimed) return { outcome: 'already-confirmed' }
		// Same payment delivered twice at once. One won; either way it's recorded.
		if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
			return { outcome: 'already-recorded' }
		}
		throw err
	}
	return { outcome: 'recorded', overpaidBy }
}

/** Internal signal that another delivery claimed this intent first. */
class AlreadyClaimed extends Error {}
