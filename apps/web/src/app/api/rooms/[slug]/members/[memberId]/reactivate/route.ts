/** Confirmed same-name rejoin: reactivate the tombstone and claim that identity. */
import { prisma } from '@/server/db'
import { publish } from '@/server/events'
import { conflict, memberTokenOf, notFound, respond } from '@/server/http'
import { actorFromToken, appendRoomAuditEvent, lockRoomWrite } from '@/server/history'
import { WRITE_LIMIT, enforceRateLimit } from '@/server/rateLimit'
import { loadRoom, toRoomState } from '@/server/roomState'
import { memberToken } from '@/server/slug'
import { isActiveMember } from '@/lib/members'
import type { RoomStateWithMember } from '@/lib/api-types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string; memberId: string }> }

export const POST = (request: Request, ctx: Ctx) =>
    respond(async (): Promise<RoomStateWithMember> => {
        enforceRateLimit(request, WRITE_LIMIT, 'member-claim')
        const { slug, memberId } = await ctx.params
        const initial = await loadRoom(slug)

        const result = await prisma.$transaction(async (tx) => {
            await lockRoomWrite(tx, initial.id)
            const room = await loadRoom(slug, tx)
            const member = room.members.find((candidate) => candidate.id === memberId)
            if (!member) throw notFound('member not found')
            if (isActiveMember(member)) {
                return {
                    changed: false,
                    response: { ...toRoomState(room), memberId: member.id, memberToken: member.token },
                }
            }
            const collision = await tx.member.findFirst({
                where: {
                    roomId: room.id,
                    id: { not: member.id },
                    removedAt: null,
                    name: { equals: member.name, mode: 'insensitive' },
                },
                select: { id: true },
            })
            if (collision) throw conflict('another active member already uses this name', 'MEMBER_NAME_CONFLICT')

            const token = memberToken()
            await tx.member.update({ where: { id: member.id }, data: { removedAt: null, token } })
            await appendRoomAuditEvent({
                tx,
                request,
                roomId: room.id,
                actor: actorFromToken(room.members, memberTokenOf(request)),
                event: {
                    kind: 'member_restored',
                    subjectType: 'member',
                    subjectId: member.id,
                    before: { id: member.id, name: member.name, removedAt: member.removedAt },
                    after: { id: member.id, name: member.name, removedAt: null },
                    detail: { reusedMemberId: true, tokenRotated: true, claimedByCaller: true },
                },
            })
            const fresh = await loadRoom(slug, tx)
            return {
                changed: true,
                response: { ...toRoomState(fresh), memberId: member.id, memberToken: token },
            }
        })
        if (result.changed) publish(initial.id)
        return result.response
    })
