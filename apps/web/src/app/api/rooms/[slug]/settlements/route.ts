import { prisma } from '@/server/db'
import { badRequest, memberTokenOf, readJson, respond } from '@/server/http'
import { parseMinor } from '@/server/money'
import { loadRoom, memberIdForToken, toRoomState } from '@/server/roomState'
import { assertWritable } from '@/server/rooms'
import { settlementSchema } from '@/server/validation'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string }> }

export const POST = (request: Request, ctx: Ctx) =>
    respond(async () => {
        const { slug } = await ctx.params
        const body = settlementSchema.parse(await readJson(request))
        const room = await loadRoom(slug)
        assertWritable(room)

        const isMember = (id: string) => room.members.some((m) => m.id === id)
        if (!isMember(body.fromId))
            throw badRequest('payer is not a member of this room', 'SETTLEMENT_PAYER_NOT_MEMBER')
        if (!isMember(body.toId)) throw badRequest('payee is not a member of this room', 'SETTLEMENT_PAYEE_NOT_MEMBER')
        if (body.fromId === body.toId)
            throw badRequest('a settlement needs two different people', 'SETTLEMENT_SAME_MEMBER')
        const amountMinor = parseMinor(body.amountMinor)
        if (amountMinor <= 0n) throw badRequest('settlement amount must be greater than zero', 'AMOUNT_NOT_POSITIVE')

        await prisma.settlement.create({
            data: {
                roomId: room.id,
                fromId: body.fromId,
                toId: body.toId,
                amountMinor,
                method: body.method ?? null,
                note: body.note ?? null,
                createdById: memberIdForToken(room, memberTokenOf(request)),
            },
        })
        return toRoomState(await loadRoom(slug))
    }, 201)
