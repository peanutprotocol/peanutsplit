import { badRequest, readJsonCapped, respond } from '@/server/http'
import { CREATE_LIMIT, enforceRateLimit } from '@/server/rateLimit'
import { toRoomState } from '@/server/roomState'
import { importRoom } from '@/server/splitwiseImport'
import { importRoomSchema } from '@/server/validation'
import type { RoomStateWithMember } from '@/lib/api-types'

export const dynamic = 'force-dynamic'

/**
 * Bytes of JSON. Five hundred expenses across twenty members is roughly 400 KB, so a megabyte is
 * generous and still refuses a payload sized to hurt. Counted as the body streams in (see
 * `readJsonCapped`), so a chunked request with no declared length is refused at the same byte a
 * declared one is — the header alone would be a claim, and an absent one reads as zero.
 */
const MAX_BODY_BYTES = 1_000_000

/**
 * Create a whole room from a parsed Splitwise export.
 *
 * The CSV itself never arrives here. The browser parses it and posts the structured result, so the
 * file — descriptions, amounts, who owes whom, a group's entire financial history — stays on the
 * device that opened it. What the server receives is the same information it would have got if
 * somebody had typed the room in by hand, which is exactly what it re-validates it as.
 *
 * Rate-limited as a creation, because that is what it is: one call makes a room, a roster and up
 * to five hundred rows that nobody can delete.
 *
 * NO IDEMPOTENCY KEY, deliberately. Every POST is a new room with a new link — a retried import
 * cannot corrupt anything, it can only leave an unshared room nobody opens. The alternative is a
 * key the client has to invent and the server has to store, to defend against a duplicate that
 * costs a row.
 */
export const POST = (request: Request) =>
    respond(async (): Promise<RoomStateWithMember> => {
        enforceRateLimit(request, CREATE_LIMIT, 'create')

        const raw = await readJsonCapped(
            request,
            MAX_BODY_BYTES,
            badRequest('that import is too big', 'IMPORT_TOO_LARGE')
        )
        const body = importRoomSchema.parse(raw)
        const { room, memberId, memberToken } = await importRoom(body)
        return { ...toRoomState(room), memberId, memberToken }
    }, 201)
