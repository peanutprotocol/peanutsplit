import { prisma } from '@/server/db'
import { notFound, respond } from '@/server/http'
import { WRITE_LIMIT, enforceRateLimit } from '@/server/rateLimit'
import { loadRoom, toRoomState } from '@/server/roomState'
import type { RoomStateWithMember } from '@/lib/api-types'
import { lockRoomWrite } from '@/server/history'
import { activeMember } from '@/lib/members'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string; memberId: string }> }

/**
 * Select a public roster entry on this device.
 *
 * The room link remains the credential: member ids are already present in the
 * room state, and choosing one is the same trusted-circle act the old local-only
 * JoinGate performed. Return the member's existing token rather than rotating
 * it, so another device already using that viewpoint keeps reactions and push.
 * Selection is not a roster mutation or a claimed/unclaimed lifecycle.
 */
export const POST = (request: Request, ctx: Ctx) =>
    respond(async (): Promise<RoomStateWithMember> => {
        enforceRateLimit(request, WRITE_LIMIT, 'member-claim')
        const { slug, memberId } = await ctx.params
        return prisma.$transaction(async (tx) => {
            const room = await loadRoom(slug, tx)
            await lockRoomWrite(tx, room.id)
            const lockedRoom = await loadRoom(slug, tx)
            const member = activeMember(lockedRoom.members, memberId)
            if (!member) throw notFound('member not found')

            return { ...toRoomState(lockedRoom), memberId: member.id, memberToken: member.token }
        })
    })
