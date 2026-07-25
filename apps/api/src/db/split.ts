// DB access + orchestration for expense-splitting rooms. Pure money math lives
// in ../split/math; FX in ../split/fx. Everything here is anonymous — access is
// gated only by knowing the room slug (see schema.prisma § SPLIT ROOMS).

import { randomBytes } from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../db'
import { getReferenceRate } from '../split/fx'
import { isSupportedCurrency } from '../split/currencies'
import { convertToBaseMinor, splitEqual, normalizeExact, computeBalances, simplifyDebts } from '../split/math'

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
	await prisma.splitSettlement.create({
		data: {
			roomId: room.id,
			fromMemberId: input.fromMemberId,
			toMemberId: input.toMemberId,
			amountMinor: amt,
			method: input.method ?? 'MANUAL',
		},
	})
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
			createdAt: s.createdAt.toISOString(),
		})),
		balances: memberIds.map((id) => ({ memberId: id, netMinor: (balances.get(id) ?? 0n).toString() })),
		suggestedTransfers: suggested.map((t) => ({
			fromMemberId: t.fromMemberId,
			toMemberId: t.toMemberId,
			amountMinor: t.amountMinor.toString(),
		})),
	}
}
