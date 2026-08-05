import { Prisma } from '@prisma/client'
import { prisma } from '@/server/db'
import { publish } from '@/server/events'
import { badRequest, conflict, memberTokenOf, readJson, respond } from '@/server/http'
import { parseMinor } from '@/server/money'
import { notifyRoomWrite } from '@/server/push'
import { actorFromToken, appendRoomAuditEvent, lockRoomWrite, type PushRoomWriteEvent } from '@/server/history'
import { WRITE_LIMIT, enforceRateLimit } from '@/server/rateLimit'
import { balancesOf, loadRoom, memberIdForToken, toRoomState } from '@/server/roomState'
import { settlementSchema } from '@/server/validation'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string }> }

type SettlementWriteResult = {
    settlementId: string
    actorMemberId: string | null
    fresh: Awaited<ReturnType<typeof loadRoom>>
    state: ReturnType<typeof toRoomState>
} & ({ created: true; event: PushRoomWriteEvent } | { created: false; event?: never })

export const POST = (request: Request, ctx: Ctx) =>
    respond(async () => {
        enforceRateLimit(request, WRITE_LIMIT, 'write')
        const { slug } = await ctx.params
        const body = settlementSchema.parse(await readJson(request))
        const room = await loadRoom(slug)
        const amountMinor = parseMinor(body.amountMinor)
        if (amountMinor <= 0n) throw badRequest('settlement amount must be greater than zero', 'AMOUNT_NOT_POSITIVE')

        const token = memberTokenOf(request)
        let result: SettlementWriteResult
        try {
            result = await prisma.$transaction(async (tx) => {
                // The outstanding debt read and insert are one room-scoped
                // critical section. Distinct keys cannot both spend the same
                // pre-payment balance.
                await lockRoomWrite(tx, room.id)
                const lockedRoom = await loadRoom(slug, tx)
                const actor = actorFromToken(lockedRoom.members, token)
                const actorMemberId = actor.memberId

                // Idempotency precedes the debt ceiling: after the first write
                // the debt may be gone, but a lost-response retry is success.
                if (body.clientKey) {
                    const existing = await tx.settlement.findUnique({
                        where: { id: body.clientKey },
                        select: { id: true, roomId: true },
                    })
                    if (existing) {
                        if (existing.roomId !== lockedRoom.id)
                            throw conflict('request key is already in use', 'IDEMPOTENCY_KEY_REUSED')
                        return {
                            created: false,
                            settlementId: existing.id,
                            actorMemberId,
                            fresh: lockedRoom,
                            state: toRoomState(lockedRoom),
                        }
                    }
                }

                const isMember = (id: string) => lockedRoom.members.some((member) => member.id === id)
                if (!isMember(body.fromId))
                    throw badRequest('payer is not a member of this room', 'SETTLEMENT_PAYER_NOT_MEMBER')
                if (!isMember(body.toId))
                    throw badRequest('payee is not a member of this room', 'SETTLEMENT_PAYEE_NOT_MEMBER')
                if (body.fromId === body.toId)
                    throw badRequest('a settlement needs two different people', 'SETTLEMENT_SAME_MEMBER')

                const balances = balancesOf(lockedRoom)
                const payerDebt = -(balances.get(body.fromId) ?? 0n)
                const payeeCredit = balances.get(body.toId) ?? 0n
                const ceiling = payerDebt < payeeCredit ? payerDebt : payeeCredit
                if (ceiling <= 0n || amountMinor > ceiling)
                    throw badRequest('settlement exceeds the current debt', 'SETTLEMENT_EXCEEDS_DEBT')

                const settlement = await tx.settlement.create({
                    data: {
                        ...(body.clientKey ? { id: body.clientKey } : {}),
                        roomId: lockedRoom.id,
                        fromId: body.fromId,
                        toId: body.toId,
                        amountMinor,
                        method: body.method ?? null,
                        note: body.note ?? null,
                        receiptUrl: body.receiptUrl ?? null,
                        createdById: actorMemberId,
                    },
                })
                const event: PushRoomWriteEvent = {
                    kind: 'settlement_recorded',
                    settlementId: settlement.id,
                    subjectType: 'settlement',
                    subjectId: settlement.id,
                    after: settlement,
                }
                await appendRoomAuditEvent({ tx, request, roomId: lockedRoom.id, actor, event })
                const fresh = await loadRoom(slug, tx)
                return {
                    created: true,
                    settlementId: settlement.id,
                    actorMemberId,
                    fresh,
                    state: toRoomState(fresh),
                    event,
                }
            })
        } catch (error) {
            // Different rooms take different advisory locks, so a deliberately
            // reused key can still race at the global primary key. Translate
            // that loser after its transaction rolls back.
            if (body.clientKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                const existing = await prisma.settlement.findUnique({
                    where: { id: body.clientKey },
                    select: { roomId: true },
                })
                if (existing?.roomId === room.id) {
                    const fresh = await loadRoom(slug)
                    result = {
                        created: false,
                        settlementId: body.clientKey,
                        actorMemberId: memberIdForToken(fresh, token),
                        fresh,
                        state: toRoomState(fresh),
                    }
                } else if (existing) {
                    throw conflict('request key is already in use', 'IDEMPOTENCY_KEY_REUSED')
                } else {
                    throw error
                }
            } else {
                throw error
            }
        }

        if (!result.created) return result.state
        publish(room.id)
        // Fire-and-forget, and only once the response value is ready — the
        // settlement is recorded whether or not anybody's phone hears about it.
        notifyRoomWrite({
            room: result.fresh,
            state: result.state,
            actorMemberId: result.actorMemberId,
            event: result.event,
        })
        return result.state
    }, 201)
