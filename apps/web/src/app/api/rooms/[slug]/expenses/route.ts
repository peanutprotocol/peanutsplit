import { Prisma } from '@prisma/client'
import { prisma } from '@/server/db'
import { publish } from '@/server/events'
import { buildExpense } from '@/server/expenses'
import { conflict, memberTokenOf, readJson, respond } from '@/server/http'
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
        if (body.clientKey) {
            const existing = await prisma.expense.findUnique({
                where: { id: body.clientKey },
                select: { roomId: true },
            })
            if (existing) {
                if (existing.roomId !== room.id)
                    throw conflict('request key is already in use', 'IDEMPOTENCY_KEY_REUSED')
                return toRoomState(await loadRoom(slug))
            }
        }
        const write = await buildExpense(room, body)
        const actorMemberId = memberIdForToken(room, memberTokenOf(request))

        let expense: Awaited<ReturnType<typeof prisma.expense.create>>
        try {
            expense = await prisma.expense.create({
                data: {
                    ...(body.clientKey ? { id: body.clientKey } : {}),
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
        } catch (error) {
            // Two deliveries can both pass the read above. The primary key
            // arbitrates that race; its loser is either a safe retry in this
            // room or an explicit cross-room collision, never a generic 500.
            if (body.clientKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                const existing = await prisma.expense.findUnique({
                    where: { id: body.clientKey },
                    select: { roomId: true },
                })
                if (existing?.roomId === room.id) return toRoomState(await loadRoom(slug))
                if (existing) throw conflict('request key is already in use', 'IDEMPOTENCY_KEY_REUSED')
            }
            throw error
        }

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
