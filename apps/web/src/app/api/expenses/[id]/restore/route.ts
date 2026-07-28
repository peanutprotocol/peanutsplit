import { prisma } from '@/server/db'
import { notFound, respond } from '@/server/http'
import { WRITE_LIMIT, enforceRateLimit } from '@/server/rateLimit'
import { loadRoomById, toRoomState } from '@/server/roomState'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** Undo. Slug-free by design: the toast only has the expense id in hand. */
export const POST = (request: Request, ctx: Ctx) =>
    respond(async () => {
        enforceRateLimit(request, WRITE_LIMIT, 'write')
        const { id } = await ctx.params
        const expense = await prisma.expense.findUnique({ where: { id } })
        if (!expense) throw notFound('expense not found', 'EXPENSE_NOT_FOUND')
        if (expense.deletedAt) await prisma.expense.update({ where: { id }, data: { deletedAt: null } })
        return toRoomState(await loadRoomById(expense.roomId))
    })
