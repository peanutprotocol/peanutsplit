import { prisma } from '@/server/db'
import { publish } from '@/server/events'
import { memberTokenOf, notFound, respond } from '@/server/http'
import { WRITE_LIMIT, enforceRateLimit } from '@/server/rateLimit'
import { loadRoom, toRoomState } from '@/server/roomState'
import { actorFromToken, appendRoomAuditEvent, expenseAuditSnapshot, lockRoomWrite } from '@/server/history'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** Undo. Slug-free by design: the toast only has the expense id in hand. */
export const POST = (request: Request, ctx: Ctx) =>
    respond(async () => {
        enforceRateLimit(request, WRITE_LIMIT, 'write')
        const { id } = await ctx.params
        const initial = await prisma.expense.findUnique({ where: { id } })
        if (!initial) throw notFound('expense not found', 'EXPENSE_NOT_FOUND')
        const result = await prisma.$transaction(async (tx) => {
            await lockRoomWrite(tx, initial.roomId)
            const expense = await tx.expense.findUnique({
                where: { id },
                include: {
                    shares: { orderBy: { memberId: 'asc' } },
                    reactions: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
                },
            })
            if (!expense) throw notFound('expense not found', 'EXPENSE_NOT_FOUND')
            const roomRow = await tx.room.findUniqueOrThrow({ where: { id: expense.roomId }, select: { slug: true } })
            const room = await loadRoom(roomRow.slug, tx)
            if (expense.deletedAt) {
                await tx.expense.update({ where: { id }, data: { deletedAt: null } })
                await appendRoomAuditEvent({
                    tx,
                    request,
                    roomId: room.id,
                    actor: actorFromToken(room.members, memberTokenOf(request)),
                    event: {
                        kind: 'expense_restored',
                        subjectType: 'expense',
                        subjectId: id,
                        before: expenseAuditSnapshot(expense),
                        after: expenseAuditSnapshot({ ...expense, deletedAt: null }),
                    },
                })
                return { changed: true, state: toRoomState(await loadRoom(roomRow.slug, tx)) }
            }
            return { changed: false, state: toRoomState(room) }
        })
        if (result.changed) publish(initial.roomId)
        return result.state
    })
