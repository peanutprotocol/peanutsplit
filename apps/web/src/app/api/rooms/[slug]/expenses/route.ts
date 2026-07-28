import { prisma } from '@/server/db'
import { buildExpense } from '@/server/expenses'
import { memberTokenOf, readJson, respond } from '@/server/http'
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

        await prisma.expense.create({
            data: {
                roomId: room.id,
                description: write.description,
                amountMinor: write.amountMinor,
                currency: write.currency,
                baseAmountMinor: write.baseAmountMinor,
                fxRate: write.fxRate,
                paidById: write.paidById,
                createdById: memberIdForToken(room, memberTokenOf(request)),
                splitMode: write.splitMode,
                date: write.date,
                category: write.category,
                shares: { createMany: { data: write.shares } },
            },
        })
        return toRoomState(await loadRoom(slug))
    }, 201)
