import { publish } from '@/server/events'
import { readJson, respond } from '@/server/http'
import { CREATE_LIMIT, enforceRateLimit } from '@/server/rateLimit'
import { addMember } from '@/server/rooms'
import { loadRoom, toRoomState } from '@/server/roomState'
import { createMemberSchema } from '@/server/validation'
import type { RoomStateWithAddedMember, RoomStateWithMember } from '@/lib/api-types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string }> }

export const POST = (request: Request, ctx: Ctx) =>
    respond(async (): Promise<RoomStateWithAddedMember | RoomStateWithMember> => {
        enforceRateLimit(request, CREATE_LIMIT, 'create')
        const { slug } = await ctx.params
        const body = createMemberSchema.parse(await readJson(request))
        const room = await loadRoom(slug)
        const { memberId, memberToken } = await addMember(room, body.name)
        publish(room.id)
        // Reload: the roster the client renders must already contain the joiner.
        const state = toRoomState(await loadRoom(slug))
        if (body.intent === 'add') return { ...state, memberId }
        return { ...state, memberId, memberToken }
    }, 201)
