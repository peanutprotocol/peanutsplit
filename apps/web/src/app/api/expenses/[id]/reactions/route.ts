/**
 * Add (POST) or take back (DELETE) one emoji on one expense.
 *
 * Two decisions worth the words:
 *
 * 1. This write needs a TOKEN-PROVEN member, unlike expenses and settlements.
 *    Ledger attribution is deliberately weak — anyone with the link can record
 *    that Ana paid, because inside a room that is visible and fixable. A
 *    reaction is not a ledger row, it is social identity: "María laughed" has to
 *    be really María, or the feature is a way to put words in a friend's mouth.
 *    So it mirrors the push-subscription precedent — the proof is the member
 *    token the server minted at join time, and it travels in the body because
 *    here the token is proof rather than attribution.
 *
 * 2. Slug-free, like the restore endpoint: the expense id is an unguessable
 *    uuid, the room is looked up from it, and the row a reaction bar is sitting
 *    on only ever has that id in hand.
 */
import { prisma } from '@/server/db'
import { conflict, notFound, readJson, respond } from '@/server/http'
import { WRITE_LIMIT, enforceRateLimit } from '@/server/rateLimit'
import { assertProvenMember, loadRoomById, toRoomState } from '@/server/roomState'
import { assertWritable } from '@/server/rooms'
import { reactionSchema } from '@/server/validation'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** The expense, its room, and the proof — everything both verbs need first. */
async function authorize(request: Request, ctx: Ctx) {
    enforceRateLimit(request, WRITE_LIMIT, 'reaction')
    const { id } = await ctx.params
    const body = reactionSchema.parse(await readJson(request))

    const expense = await prisma.expense.findUnique({ where: { id }, select: { id: true, roomId: true, deletedAt: true } })
    if (!expense) throw notFound('expense not found', 'EXPENSE_NOT_FOUND')
    // A deleted expense is off the wire entirely, so its reactions cannot be
    // seen — writing one would be writing into the dark.
    if (expense.deletedAt) throw conflict('this expense was deleted', 'EXPENSE_DELETED')

    const room = await loadRoomById(expense.roomId)
    assertWritable(room)
    assertProvenMember(room, body.memberId, body.memberToken)
    return { expense, room, body }
}

/**
 * Idempotent: a second tap on a reaction you already left inserts nothing and is
 * not a conflict — a retry after a flaky connection must not be an error. It
 * still answers with the full RoomState, because every mutation in this product
 * seeds the client's cache in one hop and a bodiless 204 would leave the
 * retrying device holding stale state.
 */
export const POST = (request: Request, ctx: Ctx) =>
    respond(async () => {
        const { expense, room, body } = await authorize(request, ctx)
        await prisma.expenseReaction.createMany({
            data: [{ expenseId: expense.id, memberId: body.memberId, emoji: body.emoji }],
            skipDuplicates: true,
        })
        return toRoomState(await loadRoomById(room.id))
    })

/** Your own reaction only — the proven member id is part of the key, so there is
 *  no shape of this request that removes somebody else's. */
export const DELETE = (request: Request, ctx: Ctx) =>
    respond(async () => {
        const { expense, room, body } = await authorize(request, ctx)
        await prisma.expenseReaction.deleteMany({
            where: { expenseId: expense.id, memberId: body.memberId, emoji: body.emoji },
        })
        return toRoomState(await loadRoomById(room.id))
    })
