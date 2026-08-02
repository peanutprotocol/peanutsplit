import type { Prisma } from '@prisma/client'
import { prisma } from '@/server/db'
import { publish } from '@/server/events'
import { buildExpense } from '@/server/expenses'
import { getRateTable } from '@/server/fx'
import { badRequest, conflict, notFound, readJson, respond } from '@/server/http'
import { WRITE_LIMIT, enforceRateLimit } from '@/server/rateLimit'
import { loadRoom, toRoomState, type RoomWithRelations } from '@/server/roomState'
import { assertWritable } from '@/server/rooms'
import { expenseUpdateSchema } from '@/server/validation'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string; id: string }> }

type ExpenseReader = Pick<Prisma.TransactionClient, 'expense'>

const findExpense = async (room: RoomWithRelations, id: string, db: ExpenseReader = prisma) => {
    const expense = await db.expense.findFirst({ where: { id, roomId: room.id } })
    if (!expense) throw notFound('expense not found', 'EXPENSE_NOT_FOUND')
    return expense
}

export const PATCH = (request: Request, ctx: Ctx) =>
    respond(async () => {
        enforceRateLimit(request, WRITE_LIMIT, 'write')
        const { slug, id } = await ctx.params
        const body = expenseUpdateSchema.parse(await readJson(request))
        if (!body.paidById || body.newPaidByName)
            throw badRequest('a new payer can only be added with a new expense', 'NEW_PAYER_ON_EDIT')
        const editBody = { ...body, paidById: body.paidById }
        const initial = await loadRoom(slug)
        assertWritable(initial)
        const initialExpense = await findExpense(initial, id)
        if (initialExpense.deletedAt) throw conflict('restore this expense before editing it', 'EXPENSE_DELETED')
        // Resolve FX before the transaction so a slow rate source never holds
        // the room's write lock.
        const rateTable = await getRateTable()

        const state = await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${initial.id}, 0))`
            const room = await loadRoom(slug, tx)
            assertWritable(room)
            const existing = await findExpense(room, id, tx)
            if (existing.deletedAt) throw conflict('restore this expense before editing it', 'EXPENSE_DELETED')
            const weightedExisting = existing.splitMode === 'PERCENTAGE' || existing.splitMode === 'SHARES'
            if (
                (weightedExisting && body.expectedSplitMode !== existing.splitMode) ||
                (body.expectedSplitMode !== undefined && body.expectedSplitMode !== existing.splitMode)
            ) {
                throw conflict('the split type changed — reopen the expense and try again', 'SPLIT_MODE_CONFLICT')
            }

            // An edit replaces every column it is handed, so a field the client did
            // not send has to be filled from the row rather than from a schema
            // default: `expenseUpdateSchema` leaves `description` undefined on a
            // PATCH that only moved the amount, and defaulting it to '' silently
            // blanked the name. An explicit '' still clears it.
            const write = await buildExpense(
                room,
                { ...editBody, description: editBody.description ?? existing.description },
                existing,
                rateTable
            )
            // Shares are rebuilt wholesale: an edit must behave exactly like a
            // fresh write, or EQUAL splits keep stale per-member amounts.
            await tx.expenseShare.deleteMany({ where: { expenseId: id } })
            await tx.expense.update({
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
            })
            return toRoomState(await loadRoom(slug, tx))
        })
        publish(initial.id)
        return state
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
        publish(room.id)
        return toRoomState(await loadRoom(slug))
    })
