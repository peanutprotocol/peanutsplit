import { readJson, respond } from '@/server/http'
import { creationLocale } from '@/server/locale'
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
        // The room remembers the language it was started in, so its link preview
        // can speak it to somebody who has not tapped yet — see `server/locale.ts`.
        const { room, memberId, memberToken } = await createRoom(body, await creationLocale())
        return { ...toRoomState(room), memberId, memberToken }
    }, 201)
