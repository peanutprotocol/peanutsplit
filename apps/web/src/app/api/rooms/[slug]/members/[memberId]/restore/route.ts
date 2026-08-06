/** Reactivate a Former identity without assigning it to the restoring device. */
import { prisma } from '@/server/db'
import { publish } from '@/server/events'
import { conflict, memberTokenOf, notFound, respond } from '@/server/http'
import { actorFromToken, appendRoomAuditEvent, lockRoomWrite } from '@/server/history'
import { WRITE_LIMIT, enforceRateLimit } from '@/server/rateLimit'
import { loadRoom, toRoomState } from '@/server/roomState'
import { memberToken } from '@/server/slug'
import { isActiveMember } from '@/lib/members'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string; memberId: string }> }

export const POST = (request: Request, ctx: Ctx) =>
    respond(async () => {
        enforceRateLimit(request, WRITE_LIMIT, 'write')
        const { slug, memberId } = await ctx.params
        const initial = await loadRoom(slug)

        const result = await prisma.$transaction(async (tx) => {
            await lockRoomWrite(tx, initial.id)
            const room = await loadRoom(slug, tx)
            const member = room.members.find((candidate) => candidate.id === memberId)
            if (!member) throw notFound('member not found')
            if (isActiveMember(member)) return { changed: false, state: toRoomState(room) }
            const nameCollision = await tx.member.findFirst({
                where: {
                    roomId: room.id,
                    id: { not: member.id },
                    removedAt: null,
                    name: { equals: member.name, mode: 'insensitive' },
                },
                select: { id: true },
            })
            if (nameCollision) {
                throw conflict('another active member already uses this name', 'MEMBER_NAME_CONFLICT')
            }

            // Deliberate settings restore rotates the old proof. It deliberately
            // returns only RoomState, so the restorer does not become this person.
            await tx.member.update({
                where: { id: member.id },
                data: { removedAt: null, token: memberToken() },
            })
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
                    detail: { reusedMemberId: true, tokenRotated: true },
                },
            })
            return { changed: true, state: toRoomState(await loadRoom(slug, tx)) }
        })
        if (result.changed) publish(initial.id)
        return result.state
    })
