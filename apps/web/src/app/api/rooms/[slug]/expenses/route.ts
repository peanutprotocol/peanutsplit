import { Prisma } from '@prisma/client'
import { prisma } from '@/server/db'
import { publish } from '@/server/events'
import { buildExpense } from '@/server/expenses'
import { getRateTable } from '@/server/fx'
import { conflict, memberTokenOf, readJson, respond } from '@/server/http'
import { notifyRoomWrite } from '@/server/push'
import { WRITE_LIMIT, enforceRateLimit } from '@/server/rateLimit'
import { loadRoom, memberIdForToken, toRoomState } from '@/server/roomState'
import { addMemberInLockedTransaction, assertWritable } from '@/server/rooms'
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
        const token = memberTokenOf(request)
        // Read once before entering the transaction. New-payer creation and the
        // expense still commit together; this only avoids holding a room lock
        // while the FX table is read.
        const rateTable = await getRateTable()

        let result: {
            created: boolean
            expenseId: string
            actorMemberId: string | null
            fresh: Awaited<ReturnType<typeof loadRoom>>
            state: ReturnType<typeof toRoomState>
        }
        try {
            result = await prisma.$transaction(async (tx) => {
                // Member removal checks every payer/share reference under this
                // same room lock. Every expense create must join that order, or
                // an ordinary write can add a reference after the check and
                // have PostgreSQL cascade it away with the member.
                await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${room.id}, 0))`
                let lockedRoom = await loadRoom(slug, tx)
                assertWritable(lockedRoom)
                const actorMemberId = memberIdForToken(lockedRoom, token)

                // A lost-response retry must return before creating another
                // provisional payer.
                if (body.clientKey) {
                    const existing = await tx.expense.findUnique({
                        where: { id: body.clientKey },
                        select: { id: true, roomId: true },
                    })
                    if (existing) {
                        if (existing.roomId !== lockedRoom.id)
                            throw conflict('request key is already in use', 'IDEMPOTENCY_KEY_REUSED')
                        return {
                            created: false,
                            expenseId: existing.id,
                            actorMemberId,
                            fresh: lockedRoom,
                            state: toRoomState(lockedRoom),
                        }
                    }
                }

                let paidById = body.paidById
                if (body.newPaidByName) {
                    const added = await addMemberInLockedTransaction(
                        tx,
                        lockedRoom.id,
                        body.newPaidByName,
                        undefined,
                        true
                    )
                    paidById = added.memberId
                    // The default equal split is “everyone at commit time”, so
                    // reload before building it and include the new payer.
                    lockedRoom = await loadRoom(slug, tx)
                }
                if (!paidById) throw new Error('validated expense did not have a payer')

                const write = await buildExpense(lockedRoom, { ...body, paidById }, undefined, rateTable)
                const expense = await tx.expense.create({
                    data: {
                        ...(body.clientKey ? { id: body.clientKey } : {}),
                        roomId: lockedRoom.id,
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
                const fresh = await loadRoom(slug, tx)
                return {
                    created: true,
                    expenseId: expense.id,
                    actorMemberId,
                    fresh,
                    state: toRoomState(fresh),
                }
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
                if (existing?.roomId === room.id) {
                    const fresh = await loadRoom(slug)
                    result = {
                        created: false,
                        expenseId: body.clientKey,
                        actorMemberId: memberIdForToken(fresh, token),
                        fresh,
                        state: toRoomState(fresh),
                    }
                } else if (existing) throw conflict('request key is already in use', 'IDEMPOTENCY_KEY_REUSED')
                else throw error
            } else {
                throw error
            }
        }

        if (!result.created) return result.state
        // Everyone with the room open refetches now instead of up to 8s from now.
        // Same placement rule as the push below: after the write committed.
        publish(room.id)
        // After the response value exists, never before it: a push service that
        // times out must not turn a saved expense into a 500 for the person who
        // saved it. `notifyRoomWrite` is void and swallows its own failures.
        notifyRoomWrite({
            room: result.fresh,
            state: result.state,
            actorMemberId: result.actorMemberId,
            event: { kind: 'expense_added', expenseId: result.expenseId },
        })
        return result.state
    }, 201)
