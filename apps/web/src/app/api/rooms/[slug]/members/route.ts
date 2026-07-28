import { readJson, respond } from '@/server/http'
import { CREATE_LIMIT, enforceRateLimit } from '@/server/rateLimit'
import { addMember } from '@/server/rooms'
import { loadRoom, toRoomState } from '@/server/roomState'
import { createMemberSchema } from '@/server/validation'
import type { RoomStateWithMember } from '@/lib/api-types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string }> }

export const POST = (request: Request, ctx: Ctx) =>
    respond(async (): Promise<RoomStateWithMember> => {
        enforceRateLimit(request, CREATE_LIMIT, 'create')
        const { slug } = await ctx.params
        const body = createMemberSchema.parse(await readJson(request))
        const { memberId, memberToken } = await addMember(await loadRoom(slug), body.name)
        // Reload: the roster the client renders must already contain the joiner.
        return { ...toRoomState(await loadRoom(slug)), memberId, memberToken }
    }, 201)
