import { prisma } from '@/server/db'
import { publish } from '@/server/events'
import { memberTokenOf, notFound, respond } from '@/server/http'
import { actorFromToken, appendRoomAuditEvent, lockRoomWrite } from '@/server/history'
import { WRITE_LIMIT, enforceRateLimit } from '@/server/rateLimit'
import { loadRoom, toRoomState } from '@/server/roomState'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string; id: string }> }

/** Soft delete, same as expenses — a mistaken "paid" is the scariest thing in a
 *  split app, so the row survives for audit. */
export const DELETE = (request: Request, ctx: Ctx) =>
    respond(async () => {
        enforceRateLimit(request, WRITE_LIMIT, 'write')
        const { slug, id } = await ctx.params
        const initial = await loadRoom(slug)
        const result = await prisma.$transaction(async (tx) => {
            await lockRoomWrite(tx, initial.id)
            const room = await loadRoom(slug, tx)
            const existing = await tx.settlement.findFirst({ where: { id, roomId: room.id } })
            if (!existing) throw notFound('settlement not found', 'SETTLEMENT_NOT_FOUND')
            if (!existing.deletedAt) {
                const deletedAt = new Date()
                await tx.settlement.update({ where: { id }, data: { deletedAt } })
                await appendRoomAuditEvent({
                    tx,
                    request,
                    roomId: room.id,
                    actor: actorFromToken(room.members, memberTokenOf(request)),
                    event: {
                        kind: 'settlement_deleted',
                        subjectType: 'settlement',
                        subjectId: id,
                        before: existing,
                        after: { ...existing, deletedAt },
                    },
                })
                return { changed: true, state: toRoomState(await loadRoom(slug, tx)) }
            }
            return { changed: false, state: toRoomState(room) }
        })
        if (result.changed) publish(initial.id)
        return result.state
    })
