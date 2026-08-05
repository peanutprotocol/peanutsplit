import { Prisma } from '@prisma/client'
import { prisma } from '@/server/db'
import { publish } from '@/server/events'
import { buildExpense, expenseNeedsRateTable, latchFirstSharedBalance } from '@/server/expenses'
import { getRateTable } from '@/server/fx'
import { conflict, memberTokenOf, readJson, respond } from '@/server/http'
import {
    actorFromToken,
    appendRoomAuditEvent,
    expenseAuditSnapshot,
    lockRoomWrite,
    type PushRoomWriteEvent,
} from '@/server/history'
import { notifyRoomWrite } from '@/server/push'
import { WRITE_LIMIT, enforceRateLimit } from '@/server/rateLimit'
import { loadRoom, memberIdForToken, toRoomState } from '@/server/roomState'
import { addMemberInLockedTransaction } from '@/server/rooms'
import { expenseSchema } from '@/server/validation'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string }> }

type ExpenseWriteResult = {
    expenseId: string
    actorMemberId: string | null
    fresh: Awaited<ReturnType<typeof loadRoom>>
    state: ReturnType<typeof toRoomState>
    createdFirstSharedBalance: boolean
} & ({ created: true; event: PushRoomWriteEvent } | { created: false; event?: never })

export const POST = (request: Request, ctx: Ctx) =>
    respond(async () => {
        enforceRateLimit(request, WRITE_LIMIT, 'write')
        const { slug } = await ctx.params
        const body = expenseSchema.parse(await readJson(request))
        const room = await loadRoom(slug)
        const token = memberTokenOf(request)
        // Read catalog FX before entering the transaction only when this pair
        // needs it. Manual custom rates, identity pairs, and validation failures
        // must not wake the cache/feed path merely to save an expense.
        const rateTable = expenseNeedsRateTable(room.currency, body.currency, undefined, body.manualFxRate)
            ? await getRateTable(room.currency)
            : undefined

        let result: ExpenseWriteResult
        try {
            result = await prisma.$transaction(async (tx) => {
                // Member removal checks every payer/share reference under this
                // same room lock. Every expense create must join that order, or
                // an ordinary write can add a reference after the check and
                // have PostgreSQL cascade it away with the member.
                await lockRoomWrite(tx, room.id)
                let lockedRoom = await loadRoom(slug, tx)
                const actor = actorFromToken(lockedRoom.members, token)
                const actorMemberId = actor.memberId

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
                            createdFirstSharedBalance: lockedRoom.firstSharedBalanceExpenseId === existing.id,
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
                const createdFirstSharedBalance = await latchFirstSharedBalance(
                    tx,
                    lockedRoom,
                    expense.id,
                    write.paidById,
                    write.shares
                )
                const newPayer = body.newPaidByName
                    ? (lockedRoom.members.find((member) => member.id === paidById) ?? null)
                    : null
                const event: PushRoomWriteEvent = {
                    kind: 'expense_added',
                    expenseId: expense.id,
                    subjectType: 'expense',
                    subjectId: expense.id,
                    after: expenseAuditSnapshot({ ...expense, shares: write.shares, reactions: [] }),
                    ...(newPayer
                        ? {
                              detail: {
                                  memberAddedWithExpense: {
                                      id: newPayer.id,
                                      name: newPayer.name,
                                      avatar: newPayer.avatar,
                                      avatarPalette: newPayer.avatarPalette,
                                      provisional: newPayer.provisional,
                                  },
                              },
                          }
                        : {}),
                }
                await appendRoomAuditEvent({ tx, request, roomId: lockedRoom.id, actor, event })
                const fresh = await loadRoom(slug, tx)
                return {
                    created: true,
                    expenseId: expense.id,
                    actorMemberId,
                    fresh,
                    state: toRoomState(fresh),
                    event,
                    createdFirstSharedBalance,
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
                        createdFirstSharedBalance: fresh.firstSharedBalanceExpenseId === body.clientKey,
                    }
                } else if (existing) throw conflict('request key is already in use', 'IDEMPOTENCY_KEY_REUSED')
                else throw error
            } else {
                throw error
            }
        }

        if (!result.created) return { ...result.state, createdFirstSharedBalance: result.createdFirstSharedBalance }
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
            event: result.event,
        })
        return { ...result.state, createdFirstSharedBalance: result.createdFirstSharedBalance }
    }, 201)
