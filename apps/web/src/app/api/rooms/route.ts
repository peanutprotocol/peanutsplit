import { readJson, respond } from '@/server/http'
import { CREATE_LIMIT, enforceRateLimit } from '@/server/rateLimit'
import { createRoom } from '@/server/rooms'
import { toRoomState } from '@/server/roomState'
import { createRoomSchema } from '@/server/validation'
import type { RoomStateWithMember } from '@/lib/api-types'

export const dynamic = 'force-dynamic'

export const POST = (request: Request) =>
    respond(async (): Promise<RoomStateWithMember> => {
        enforceRateLimit(request, CREATE_LIMIT, 'create')
        const body = createRoomSchema.parse(await readJson(request))
        const { room, memberId, memberToken } = await createRoom(body)
        return { ...toRoomState(room), memberId, memberToken }
    }, 201)
