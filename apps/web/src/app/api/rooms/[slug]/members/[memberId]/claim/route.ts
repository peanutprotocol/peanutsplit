import { notFound, respond } from '@/server/http'
import { WRITE_LIMIT, enforceRateLimit } from '@/server/rateLimit'
import { loadRoom, toRoomState } from '@/server/roomState'
import type { RoomStateWithMember } from '@/lib/api-types'

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
        const room = await loadRoom(slug)
        const member = room.members.find((candidate) => candidate.id === memberId)
        if (!member) throw notFound('member not found')

        return { ...toRoomState(room), memberId: member.id, memberToken: member.token }
    })
