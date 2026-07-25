import { prisma } from '@/server/db'
import { notFound, respond } from '@/server/http'
import { loadRoom, toRoomState } from '@/server/roomState'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string; id: string }> }

/** Soft delete, same as expenses — a mistaken "paid" is the scariest thing in a
 *  split app, so the row survives for audit. */
export const DELETE = (_request: Request, ctx: Ctx) =>
    respond(async () => {
        const { slug, id } = await ctx.params
        const room = await loadRoom(slug)
        const existing = await prisma.settlement.findFirst({ where: { id, roomId: room.id } })
        if (!existing) throw notFound('settlement not found')
        if (!existing.deletedAt) {
            await prisma.settlement.update({ where: { id }, data: { deletedAt: new Date() } })
        }
        return toRoomState(await loadRoom(slug))
    })
