import { prisma } from '@/server/db'
import { publish } from '@/server/events'
import { memberTokenOf, notFound, respond } from '@/server/http'
import { WRITE_LIMIT, enforceRateLimit } from '@/server/rateLimit'
import { loadRoom, toRoomState } from '@/server/roomState'
import { actorFromToken, appendRoomAuditEvent, expenseAuditSnapshot, lockRoomWrite } from '@/server/history'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string; id: string }> }

/** Undo within the room capability already held by the expense drawer. */
export const POST = (request: Request, ctx: Ctx) =>
    respond(async () => {
        enforceRateLimit(request, WRITE_LIMIT, 'write')
        const { slug, id } = await ctx.params
        const initialRoom = await loadRoom(slug)
        const initialExpense = await prisma.expense.findFirst({
            where: { id, roomId: initialRoom.id },
            select: { id: true },
        })
        if (!initialExpense) throw notFound('expense not found', 'EXPENSE_NOT_FOUND')

        const result = await prisma.$transaction(async (tx) => {
            await lockRoomWrite(tx, initialRoom.id)
            const room = await loadRoom(slug, tx)
            const expense = await tx.expense.findFirst({
                where: { id, roomId: room.id },
                include: {
                    shares: { orderBy: { memberId: 'asc' } },
                    reactions: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
                },
            })
            if (!expense) throw notFound('expense not found', 'EXPENSE_NOT_FOUND')
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
                return { changed: true, state: toRoomState(await loadRoom(slug, tx)) }
            }
            return { changed: false, state: toRoomState(room) }
        })
        if (result.changed) publish(initialRoom.id)
        return result.state
    })
