import type { Prisma } from '@prisma/client'
import { prisma } from '@/server/db'
import { publish } from '@/server/events'
import {
    buildExpense,
    changeEqualExpenseParticipant,
    expenseNeedsRateTable,
    latchFirstSharedBalance,
} from '@/server/expenses'
import { getRateTable } from '@/server/fx'
import { badRequest, conflict, memberTokenOf, notFound, readJson, respond } from '@/server/http'
import {
    actorFromToken,
    appendRoomAuditEvent,
    expenseAuditSnapshot,
    expenseAuditValues,
    lockRoomWrite,
} from '@/server/history'
import { CATCH_UP_LIMIT, WRITE_LIMIT, enforceRateLimit, enforceRateLimitPreflight } from '@/server/rateLimit'
import { loadRoom, toRoomState, type RoomWithRelations } from '@/server/roomState'
import { expensePatchSchema } from '@/server/validation'

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
        const { slug, id } = await ctx.params
        // The command discriminator lives in JSON. Invalid payloads spend from
        // a tight pre-parse budget; valid requests spend from the appropriate
        // ordinary or bulk-command budget after discrimination.
        enforceRateLimitPreflight(request, WRITE_LIMIT, 'expense-patch-invalid')
        let body: ReturnType<typeof expensePatchSchema.parse>
        try {
            body = expensePatchSchema.parse(await readJson(request))
        } catch (error) {
            enforceRateLimit(request, WRITE_LIMIT, 'expense-patch-invalid')
            throw error
        }
        enforceRateLimit(
            request,
            'operation' in body ? CATCH_UP_LIMIT : WRITE_LIMIT,
            'operation' in body ? 'catch-up' : 'write'
        )
        const initial = await loadRoom(slug)
        const initialExpense = await findExpense(initial, id)
        if (initialExpense.deletedAt) throw conflict('restore this expense before editing it', 'EXPENSE_DELETED')

        if ('operation' in body) {
            const result = await prisma.$transaction(async (tx) => {
                await lockRoomWrite(tx, initial.id)
                const room = await loadRoom(slug, tx)
                const previous = room.expenses.find((expense) => expense.id === id)
                const changed = await changeEqualExpenseParticipant(tx, room, id, body)
                if (!changed) return { changed: false, state: toRoomState(room) }
                if (!previous) throw conflict('restore this expense before editing it', 'EXPENSE_DELETED')

                const updatedRoom = await loadRoom(slug, tx)
                const updated = updatedRoom.expenses.find((expense) => expense.id === id)
                if (!updated) throw conflict('the expense changed during catch-up', 'CATCH_UP_REVIEW_CONFLICT')
                if (body.action === 'add') {
                    await latchFirstSharedBalance(tx, room, id, updated.paidById, updated.shares)
                }
                await appendRoomAuditEvent({
                    tx,
                    request,
                    roomId: room.id,
                    actor: actorFromToken(room.members, memberTokenOf(request)),
                    event: {
                        kind: 'expense_edited',
                        subjectType: 'expense',
                        subjectId: id,
                        before: expenseAuditSnapshot(previous),
                        after: expenseAuditSnapshot(updated),
                        detail: {
                            operation: 'catch_up_equal_participant',
                            action: body.action,
                            memberId: body.memberId,
                        },
                    },
                })
                return { changed: true, state: toRoomState(updatedRoom) }
            })
            if (result.changed) publish(initial.id)
            return result
        }

        if (!body.paidById || body.newPaidByName)
            throw badRequest('a new payer can only be added with a new expense', 'NEW_PAYER_ON_EDIT')
        const editBody = { ...body, paidById: body.paidById }
        // Resolve a genuinely new catalog pair before the transaction. A
        // same-pair edit owns the stored rate, while custom/manual and identity
        // writes cannot use the feed and should not wait for it.
        const rateTable = expenseNeedsRateTable(
            initial.currency,
            body.currency,
            initialExpense.currency,
            body.manualFxRate
        )
            ? await getRateTable()
            : undefined

        const result = await prisma.$transaction(async (tx) => {
            await lockRoomWrite(tx, initial.id)
            const room = await loadRoom(slug, tx)
            const existing = await findExpense(room, id, tx)
            if (existing.deletedAt) throw conflict('restore this expense before editing it', 'EXPENSE_DELETED')
            const previous = room.expenses.find((expense) => expense.id === id)
            if (!previous) throw conflict('restore this expense before editing it', 'EXPENSE_DELETED')
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
                { ...existing, shares: previous.shares },
                rateTable
            )
            const after = expenseAuditSnapshot({
                id,
                roomId: room.id,
                description: write.description,
                amountMinor: write.amountMinor,
                currency: write.currency,
                baseAmountMinor: write.baseAmountMinor,
                fxRate: write.fxRate,
                paidById: write.paidById,
                createdById: existing.createdById,
                splitMode: write.splitMode,
                date: write.date,
                category: write.category,
                createdAt: existing.createdAt,
                deletedAt: existing.deletedAt,
                shares: write.shares,
                reactions: previous.reactions,
            })
            const changed = JSON.stringify(expenseAuditValues(previous)) !== JSON.stringify(expenseAuditValues(after))
            if (!changed) return { changed: false, state: toRoomState(room) }
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
            await latchFirstSharedBalance(tx, room, id, write.paidById, write.shares)
            await appendRoomAuditEvent({
                tx,
                request,
                roomId: room.id,
                actor: actorFromToken(room.members, memberTokenOf(request)),
                event: {
                    kind: 'expense_edited',
                    subjectType: 'expense',
                    subjectId: id,
                    before: expenseAuditSnapshot(previous),
                    after,
                },
            })
            return { changed: true, state: toRoomState(await loadRoom(slug, tx)) }
        })
        if (result.changed) publish(initial.id)
        return result.state
    })

/** Soft delete — the client shows a 6s Undo that calls /api/expenses/:id/restore.
 *  Deleting twice is a no-op, not an error: the undo toast is tappable twice. */
export const DELETE = (request: Request, ctx: Ctx) =>
    respond(async () => {
        enforceRateLimit(request, WRITE_LIMIT, 'write')
        const { slug, id } = await ctx.params
        const initial = await loadRoom(slug)
        const result = await prisma.$transaction(async (tx) => {
            await lockRoomWrite(tx, initial.id)
            const room = await loadRoom(slug, tx)
            const existing = await findExpense(room, id, tx)
            if (!existing.deletedAt) {
                const deletedAt = new Date()
                const previous = room.expenses.find((expense) => expense.id === id)
                if (!previous) throw conflict('restore this expense before deleting it', 'EXPENSE_DELETED')
                await tx.expense.update({ where: { id }, data: { deletedAt } })
                await appendRoomAuditEvent({
                    tx,
                    request,
                    roomId: room.id,
                    actor: actorFromToken(room.members, memberTokenOf(request)),
                    event: {
                        kind: 'expense_deleted',
                        subjectType: 'expense',
                        subjectId: id,
                        before: expenseAuditSnapshot(previous),
                        after: expenseAuditSnapshot({ ...previous, deletedAt }),
                    },
                })
                return { changed: true, state: toRoomState(await loadRoom(slug, tx)) }
            }
            return { changed: false, state: toRoomState(room) }
        })
        if (result.changed) publish(initial.id)
        return result.state
    })
