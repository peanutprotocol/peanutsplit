// Link-based expense-splitting rooms. NO AUTH by design: a room is its
// shareable link and possession of the high-entropy slug is the entire access
// model (see prisma/schema.prisma § SPLIT ROOMS). Business logic + money math
// live in ../../db/split and ../../split/*.

import { Type } from '@sinclair/typebox'
import type { FastifyReply } from 'fastify'

import { app } from '../../app'
import { logger } from '../../utils'
import { CURRENCIES, isSupportedCurrency } from '../../split/currencies'
import { getReferenceRate } from '../../split/fx'
import {
	SplitError,
	createRoom,
	addMember,
	addExpense,
	updateExpense,
	deleteExpense,
	restoreExpense,
	recordSettlement,
	deleteSettlement,
	buildRoomState,
} from '../../db/split'

// ─── Response shapes (drive OpenAPI → peanut-ui gen:api) ────────────────────

const Money = Type.String({ pattern: '^-?[0-9]+$', description: 'amount in minor units' })

const MemberSchema = Type.Object({
	id: Type.String(),
	displayName: Type.String(),
	colorSeed: Type.Integer(),
})

const ShareSchema = Type.Object({
	memberId: Type.String(),
	amountMinor: Money,
	enteredAmountMinor: Type.Union([Money, Type.Null()]),
})

const ExpenseSchema = Type.Object({
	id: Type.String(),
	description: Type.String(),
	amountMinor: Money,
	currency: Type.String(),
	baseAmountMinor: Money,
	fxRate: Type.String(),
	splitKind: Type.Union([Type.Literal('EQUAL'), Type.Literal('EXACT')]),
	paidByMemberId: Type.String(),
	createdByMemberId: Type.Union([Type.String(), Type.Null()]),
	createdAt: Type.String(),
	shares: Type.Array(ShareSchema),
})

const SettlementSchema = Type.Object({
	id: Type.String(),
	fromMemberId: Type.String(),
	toMemberId: Type.String(),
	amountMinor: Money,
	method: Type.Union([Type.Literal('MANUAL'), Type.Literal('PEANUT')]),
	createdAt: Type.String(),
})

const TransferSchema = Type.Object({
	fromMemberId: Type.String(),
	toMemberId: Type.String(),
	amountMinor: Money,
})

const RoomStateSchema = Type.Object({
	slug: Type.String(),
	title: Type.Union([Type.String(), Type.Null()]),
	baseCurrency: Type.String(),
	createdAt: Type.String(),
	members: Type.Array(MemberSchema),
	expenses: Type.Array(ExpenseSchema),
	settlements: Type.Array(SettlementSchema),
	balances: Type.Array(Type.Object({ memberId: Type.String(), netMinor: Money })),
	suggestedTransfers: Type.Array(TransferSchema),
})

const ErrorSchema = Type.Object({ message: Type.String() })

// Reused by POST (add) and PATCH (edit) expense.
const ExpenseBodySchema = Type.Object({
	description: Type.String({ maxLength: 255 }),
	amountMinor: Money,
	currency: Type.String(),
	paidByMemberId: Type.String(),
	splitKind: Type.Union([Type.Literal('EQUAL'), Type.Literal('EXACT')]),
	participantMemberIds: Type.Optional(Type.Array(Type.String())),
	exactShares: Type.Optional(Type.Array(Type.Object({ memberId: Type.String(), amountMinor: Money }))),
	createdByMemberId: Type.Optional(Type.String()),
})

// POST /members returns the created member's id explicitly — clients store it
// directly rather than diffing the members array (which is racy on concurrent joins).
const MemberCreatedSchema = Type.Object({ createdMemberId: Type.String(), room: RoomStateSchema })

// ─── helpers ────────────────────────────────────────────────────────────────

/** Map a SplitError to its HTTP status; rethrow anything unexpected. */
function replyError(reply: FastifyReply, err: unknown): FastifyReply {
	if (err instanceof SplitError) return reply.code(err.status).send({ message: err.message })
	logger.error({ err }, 'split route failed')
	return reply.code(500).send({ message: 'internal error' })
}

/** Fetch + send the full room snapshot, or 404. Every mutation ends here so the
 *  client gets fresh balances back without a second round-trip. */
async function sendRoomState(reply: FastifyReply, slug: string): Promise<FastifyReply> {
	const state = await buildRoomState(slug)
	if (!state) return reply.code(404).send({ message: 'room not found' })
	return reply.send(state)
}

// ─── routes ──────────────────────────────────────────────────────────────────

app.get(
	'/split/currencies',
	{
		schema: {
			response: {
				200: Type.Array(
					Type.Object({
						code: Type.String(),
						symbol: Type.String(),
						name: Type.String(),
						decimals: Type.Integer(),
					})
				),
			},
		},
	},
	async () =>
		Object.entries(CURRENCIES).map(([code, m]) => ({ code, symbol: m.symbol, name: m.name, decimals: m.decimals }))
)

// Indicative reference rate for showing a live estimated base-currency total
// while entering a foreign expense. Display-only (same seam as expense FX).
app.get(
	'/split/rate',
	{
		schema: {
			querystring: Type.Object({ from: Type.String(), to: Type.String() }),
			response: {
				200: Type.Object({ rate: Type.Number(), source: Type.String() }),
				400: ErrorSchema,
			},
		},
	},
	async (request, reply) => {
		const { from, to } = request.query
		if (!isSupportedCurrency(from) || !isSupportedCurrency(to)) {
			return reply.code(400).send({ message: 'unsupported currency' })
		}
		return reply.send(await getReferenceRate(from, to))
	}
)

app.post(
	'/split/rooms',
	{
		schema: {
			body: Type.Object({
				title: Type.Optional(Type.String({ maxLength: 255 })),
				baseCurrency: Type.String(),
			}),
			response: { 200: RoomStateSchema, 400: ErrorSchema },
		},
	},
	async (request, reply) => {
		try {
			const slug = await createRoom(request.body)
			return await sendRoomState(reply, slug)
		} catch (err) {
			return replyError(reply, err)
		}
	}
)

app.get(
	'/split/rooms/:slug',
	{
		schema: {
			params: Type.Object({ slug: Type.String() }),
			response: { 200: RoomStateSchema, 404: ErrorSchema },
		},
	},
	async (request, reply) => sendRoomState(reply, request.params.slug)
)

app.post(
	'/split/rooms/:slug/members',
	{
		schema: {
			params: Type.Object({ slug: Type.String() }),
			body: Type.Object({ displayName: Type.String({ minLength: 1, maxLength: 80 }) }),
			response: { 200: MemberCreatedSchema, 400: ErrorSchema, 404: ErrorSchema },
		},
	},
	async (request, reply) => {
		try {
			const member = await addMember(request.params.slug, request.body.displayName)
			const room = await buildRoomState(request.params.slug)
			if (!room) return reply.code(404).send({ message: 'room not found' })
			return reply.send({ createdMemberId: member.id, room })
		} catch (err) {
			return replyError(reply, err)
		}
	}
)

app.post(
	'/split/rooms/:slug/expenses',
	{
		schema: {
			params: Type.Object({ slug: Type.String() }),
			body: ExpenseBodySchema,
			response: { 200: RoomStateSchema, 400: ErrorSchema, 404: ErrorSchema },
		},
	},
	async (request, reply) => {
		try {
			await addExpense(request.params.slug, request.body)
			return await sendRoomState(reply, request.params.slug)
		} catch (err) {
			return replyError(reply, err)
		}
	}
)

app.patch(
	'/split/rooms/:slug/expenses/:expenseId',
	{
		schema: {
			params: Type.Object({ slug: Type.String(), expenseId: Type.String() }),
			body: ExpenseBodySchema,
			response: { 200: RoomStateSchema, 400: ErrorSchema, 404: ErrorSchema },
		},
	},
	async (request, reply) => {
		try {
			await updateExpense(request.params.slug, request.params.expenseId, request.body)
			return await sendRoomState(reply, request.params.slug)
		} catch (err) {
			return replyError(reply, err)
		}
	}
)

app.post(
	'/split/rooms/:slug/expenses/:expenseId/restore',
	{
		schema: {
			params: Type.Object({ slug: Type.String(), expenseId: Type.String() }),
			response: { 200: RoomStateSchema, 404: ErrorSchema },
		},
	},
	async (request, reply) => {
		try {
			await restoreExpense(request.params.slug, request.params.expenseId)
			return await sendRoomState(reply, request.params.slug)
		} catch (err) {
			return replyError(reply, err)
		}
	}
)

app.delete(
	'/split/rooms/:slug/expenses/:expenseId',
	{
		schema: {
			params: Type.Object({ slug: Type.String(), expenseId: Type.String() }),
			response: { 200: RoomStateSchema, 404: ErrorSchema },
		},
	},
	async (request, reply) => {
		try {
			await deleteExpense(request.params.slug, request.params.expenseId)
			return await sendRoomState(reply, request.params.slug)
		} catch (err) {
			return replyError(reply, err)
		}
	}
)

app.post(
	'/split/rooms/:slug/settlements',
	{
		schema: {
			params: Type.Object({ slug: Type.String() }),
			body: Type.Object({
				fromMemberId: Type.String(),
				toMemberId: Type.String(),
				amountMinor: Money,
				method: Type.Optional(Type.Union([Type.Literal('MANUAL'), Type.Literal('PEANUT')])),
				idempotencyKey: Type.Optional(Type.String({ maxLength: 64 })),
			}),
			response: { 200: RoomStateSchema, 400: ErrorSchema, 404: ErrorSchema },
		},
	},
	async (request, reply) => {
		try {
			await recordSettlement(request.params.slug, request.body)
			return await sendRoomState(reply, request.params.slug)
		} catch (err) {
			return replyError(reply, err)
		}
	}
)

app.delete(
	'/split/rooms/:slug/settlements/:settlementId',
	{
		schema: {
			params: Type.Object({ slug: Type.String(), settlementId: Type.String() }),
			response: { 200: RoomStateSchema, 404: ErrorSchema },
		},
	},
	async (request, reply) => {
		try {
			await deleteSettlement(request.params.slug, request.params.settlementId)
			return await sendRoomState(reply, request.params.slug)
		} catch (err) {
			return replyError(reply, err)
		}
	}
)
