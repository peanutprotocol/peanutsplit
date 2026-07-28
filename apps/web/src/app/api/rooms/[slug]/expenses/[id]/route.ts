import { prisma } from '@/server/db'
import { buildExpense } from '@/server/expenses'
import { conflict, notFound, readJson, respond } from '@/server/http'
import { WRITE_LIMIT, enforceRateLimit } from '@/server/rateLimit'
import { loadRoom, toRoomState, type RoomWithRelations } from '@/server/roomState'
import { assertWritable } from '@/server/rooms'
import { expenseSchema } from '@/server/validation'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string; id: string }> }

const findExpense = async (room: RoomWithRelations, id: string) => {
    const expense = await prisma.expense.findFirst({ where: { id, roomId: room.id } })
    if (!expense) throw notFound('expense not found')
    return expense
}

export const PATCH = (request: Request, ctx: Ctx) =>
    respond(async () => {
        enforceRateLimit(request, WRITE_LIMIT, 'write')
        const { slug, id } = await ctx.params
        const body = expenseSchema.parse(await readJson(request))
        const room = await loadRoom(slug)
        assertWritable(room)
        const existing = await findExpense(room, id)
        if (existing.deletedAt) throw conflict('restore this expense before editing it', 'EXPENSE_DELETED')

        const write = await buildExpense(room, body, existing)
        // Shares are rebuilt wholesale: an edit must behave exactly like a fresh
        // write, or EQUAL splits would keep stale per-member amounts.
        await prisma.$transaction([
            prisma.expenseShare.deleteMany({ where: { expenseId: id } }),
            prisma.expense.update({
                where: { id },
                data: {
                    description: write.description,
                    amountMinor: write.amountMinor,
                    currency: write.currency,
                    baseAmountMinor: write.baseAmountMinor,
                    fxRate: write.fxRate,
                    paidById: write.paidById,
                    splitMode: write.splitMode,
                    date: write.date,
                    category: write.category,
                    shares: { createMany: { data: write.shares } },
                },
            }),
        ])
        return toRoomState(await loadRoom(slug))
    })

/** Soft delete — the client shows a 6s Undo that calls /api/expenses/:id/restore.
 *  Deleting twice is a no-op, not an error: the undo toast is tappable twice. */
export const DELETE = (request: Request, ctx: Ctx) =>
    respond(async () => {
        enforceRateLimit(request, WRITE_LIMIT, 'write')
        const { slug, id } = await ctx.params
        const room = await loadRoom(slug)
        const existing = await findExpense(room, id)
        if (!existing.deletedAt) {
            await prisma.expense.update({ where: { id }, data: { deletedAt: new Date() } })
        }
        return toRoomState(await loadRoom(slug))
    })
