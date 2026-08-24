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
 * 2. Slug-free behind token-proven identity: the expense id locates the room,
 *    and the member token proves who may write the reaction. Expense restore
 *    deliberately differs and also requires the room slug because attribution
 *    tokens there are optional rather than authorization proof.
 *
 * Two deviations from the house shape, both deliberate. POST answers 200 rather
 * than the 201 every other create uses, because the verb here is a toggle and
 * not a creation — a second tap on a reaction you already left writes no row and
 * must not claim it did. And the rate-limit scope is `reaction` rather than the
 * shared `write` bucket: tapping an emoji is the cheapest thing in the product
 * and must not spend the allowance a room needs for its expenses.
 */
import { prisma } from '@/server/db'
import { publish } from '@/server/events'
import { conflict, notFound, readJson, respond } from '@/server/http'
import { WRITE_LIMIT, enforceRateLimit } from '@/server/rateLimit'
import { assertProvenMember, loadRoom, loadRoomById, toRoomState } from '@/server/roomState'
import { actorForMember, appendRoomAuditEvent, lockRoomWrite } from '@/server/history'
import { reactionSchema } from '@/server/validation'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** The expense, its room, and the proof — everything both verbs need first. */
async function authorize(request: Request, ctx: Ctx) {
    enforceRateLimit(request, WRITE_LIMIT, 'reaction')
    const { id } = await ctx.params
    const body = reactionSchema.parse(await readJson(request))

    const expense = await prisma.expense.findUnique({
        where: { id },
        select: { id: true, roomId: true, deletedAt: true },
    })
    if (!expense) throw notFound('expense not found', 'EXPENSE_NOT_FOUND')
    // A deleted expense is off the wire entirely, so its reactions cannot be
    // seen — writing one would be writing into the dark.
    if (expense.deletedAt) throw conflict('this expense was deleted', 'EXPENSE_DELETED')

    const room = await loadRoomById(expense.roomId)
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
        const result = await prisma.$transaction(async (tx) => {
            await lockRoomWrite(tx, room.id)
            const currentExpense = await tx.expense.findUnique({
                where: { id: expense.id },
                select: { id: true, deletedAt: true },
            })
            if (!currentExpense) throw notFound('expense not found', 'EXPENSE_NOT_FOUND')
            if (currentExpense.deletedAt) throw conflict('this expense was deleted', 'EXPENSE_DELETED')
            const lockedRoom = await loadRoom(room.slug, tx)
            assertProvenMember(lockedRoom, body.memberId, body.memberToken)
            const created = await tx.expenseReaction.createMany({
                data: [{ expenseId: expense.id, memberId: body.memberId, emoji: body.emoji }],
                skipDuplicates: true,
            })
            if (created.count > 0) {
                const member = lockedRoom.members.find(
                    (candidate) => candidate.id === body.memberId
                ) as (typeof lockedRoom.members)[number]
                await appendRoomAuditEvent({
                    tx,
                    request,
                    roomId: room.id,
                    actor: actorForMember(member),
                    event: {
                        kind: 'reaction_added',
                        subjectType: 'reaction',
                        subjectId: `${expense.id}:${body.memberId}:${body.emoji}`,
                        after: { expenseId: expense.id, memberId: body.memberId, emoji: body.emoji },
                    },
                })
            }
            return { changed: created.count > 0 }
        })
        const state = toRoomState(await loadRoomById(room.id))
        // After the commit, like every other write. A reaction that only travels
        // on the poll arrives up to 45s late for anyone holding an open stream —
        // slower than it was before the stream existed.
        if (result.changed) publish(room.id)
        return state
    })

/** Your own reaction only — the proven member id is part of the key, so there is
 *  no shape of this request that removes somebody else's. */
export const DELETE = (request: Request, ctx: Ctx) =>
    respond(async () => {
        const { expense, room, body } = await authorize(request, ctx)
        const result = await prisma.$transaction(async (tx) => {
            await lockRoomWrite(tx, room.id)
            const currentExpense = await tx.expense.findUnique({
                where: { id: expense.id },
                select: { id: true, deletedAt: true },
            })
            if (!currentExpense) throw notFound('expense not found', 'EXPENSE_NOT_FOUND')
            if (currentExpense.deletedAt) throw conflict('this expense was deleted', 'EXPENSE_DELETED')
            const lockedRoom = await loadRoom(room.slug, tx)
            assertProvenMember(lockedRoom, body.memberId, body.memberToken)
            const removed = await tx.expenseReaction.deleteMany({
                where: { expenseId: expense.id, memberId: body.memberId, emoji: body.emoji },
            })
            if (removed.count > 0) {
                const member = lockedRoom.members.find(
                    (candidate) => candidate.id === body.memberId
                ) as (typeof lockedRoom.members)[number]
                await appendRoomAuditEvent({
                    tx,
                    request,
                    roomId: room.id,
                    actor: actorForMember(member),
                    event: {
                        kind: 'reaction_removed',
                        subjectType: 'reaction',
                        subjectId: `${expense.id}:${body.memberId}:${body.emoji}`,
                        before: { expenseId: expense.id, memberId: body.memberId, emoji: body.emoji },
                    },
                })
            }
            return { changed: removed.count > 0 }
        })
        const state = toRoomState(await loadRoomById(room.id))
        // Taking one back is as visible as leaving one — same poke, same reason.
        if (result.changed) publish(room.id)
        return state
    })
