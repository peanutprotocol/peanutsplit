import { prisma } from '@/server/db'
import { publish } from '@/server/events'
import { buildExpense } from '@/server/expenses'
import { memberTokenOf, readJson, respond } from '@/server/http'
import { notifyRoomWrite } from '@/server/push'
import { WRITE_LIMIT, enforceRateLimit } from '@/server/rateLimit'
import { loadRoom, memberIdForToken, toRoomState } from '@/server/roomState'
import { assertWritable } from '@/server/rooms'
import { expenseSchema } from '@/server/validation'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string }> }

export const POST = (request: Request, ctx: Ctx) =>
    respond(async () => {
        enforceRateLimit(request, WRITE_LIMIT, 'write')
        const { slug } = await ctx.params
        const body = expenseSchema.parse(await readJson(request))
        const room = await loadRoom(slug)
        assertWritable(room)
        const write = await buildExpense(room, body)
        const actorMemberId = memberIdForToken(room, memberTokenOf(request))

        const expense = await prisma.expense.create({
            data: {
                roomId: room.id,
                description: write.description,
                amountMinor: write.amountMinor,
                currency: write.currency,
                baseAmountMinor: write.baseAmountMinor,
                fxRate: write.fxRate,
                paidById: write.paidById,
                createdById: actorMemberId,
                splitMode: write.splitMode,
                date: write.date,
                category: write.category,
                shares: { createMany: { data: write.shares } },
            },
        })

        const fresh = await loadRoom(slug)
        const state = toRoomState(fresh)
        // Everyone with the room open refetches now instead of up to 8s from now.
        // Same placement rule as the push below: after the write committed.
        publish(room.id)
        // After the response value exists, never before it: a push service that
        // times out must not turn a saved expense into a 500 for the person who
        // saved it. `notifyRoomWrite` is void and swallows its own failures.
        notifyRoomWrite({
            room: fresh,
            state,
            actorMemberId,
            event: { kind: 'expense_added', expenseId: expense.id },
        })
        return state
    }, 201)
