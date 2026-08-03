import { prisma } from '@/server/db'
import { publish } from '@/server/events'
import { notFound, respond } from '@/server/http'
import { WRITE_LIMIT, enforceRateLimit } from '@/server/rateLimit'
import { loadRoom, toRoomState } from '@/server/roomState'
import type { RoomStateWithMember } from '@/lib/api-types'
import { actorForMember, appendRoomAuditEvent, lockRoomWrite } from '@/server/history'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string; memberId: string }> }

/**
 * Claim a public roster entry on this device.
 *
 * The room link remains the credential: member ids are already present in the
 * room state, and choosing one is the same trusted-circle act the old local-only
 * JoinGate performed. Return the member's existing token rather than rotating
 * it, so another device already using that identity keeps reactions and push.
 */
export const POST = (request: Request, ctx: Ctx) =>
    respond(async (): Promise<RoomStateWithMember> => {
        enforceRateLimit(request, WRITE_LIMIT, 'member-claim')
        const { slug, memberId } = await ctx.params
        const result = await prisma.$transaction(async (tx) => {
            const room = await loadRoom(slug, tx)
            await lockRoomWrite(tx, room.id)
            const lockedRoom = await loadRoom(slug, tx)
            const member = lockedRoom.members.find((candidate) => candidate.id === memberId)
            if (!member) throw notFound('member not found')

            if (member.provisional) {
                await tx.member.update({ where: { id: member.id }, data: { provisional: false } })
                await appendRoomAuditEvent({
                    tx,
                    request,
                    roomId: room.id,
                    actor: actorForMember(member),
                    event: {
                        kind: 'member_claimed',
                        subjectType: 'member',
                        subjectId: member.id,
                        before: { provisional: true },
                        after: { provisional: false },
                        detail: { name: member.name },
                    },
                })
            }
            const fresh = member.provisional ? await loadRoom(slug, tx) : lockedRoom
            return {
                response: { ...toRoomState(fresh), memberId: member.id, memberToken: member.token },
                changed: member.provisional,
                roomId: room.id,
            }
        })
        if (result.changed) publish(result.roomId)
        return result.response
    })
