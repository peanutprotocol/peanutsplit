import { listRoomsForUser, type AccountRoom } from '@/server/accounts'
import { respondAuthed } from '@/server/session'

export const dynamic = 'force-dynamic'

/** The device-recovery endpoint: the rooms this account has proved it belongs
 *  to, each with the member token that reopens it. */
export const GET = (request: Request) =>
    respondAuthed(request, async (userId): Promise<{ rooms: AccountRoom[] }> => ({
        rooms: await listRoomsForUser(userId),
    }))
