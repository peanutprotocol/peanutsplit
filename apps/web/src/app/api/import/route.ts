import { badRequest, readJsonCapped, respond } from '@/server/http'
import { MAX_IMPORT_BODY_BYTES, assertImportCardinality, assertImportsEnabled } from '@/server/importRequest'
import { IMPORT_LIMIT, enforceRateLimit } from '@/server/rateLimit'
import { toRoomState } from '@/server/roomState'
import { importRoom } from '@/server/splitwiseImport'
import { importRoomSchema } from '@/server/validation'
import type { RoomStateWithMember } from '@/lib/api-types'

export const dynamic = 'force-dynamic'

// Kept as route exports for the existing boundary tests while both import
// destinations consume the shared implementation above.
export { MAX_IMPORT_SHARE_ROWS, assertImportCardinality } from '@/server/importRequest'

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
 * This route is not globally idempotent: every POST is still a new room with a
 * new link. Its source fingerprint is stored only inside that new room's first
 * ImportBatch, so uploading the same local export through the room-scoped
 * append route later cannot duplicate its ledger.
 */
export const POST = (request: Request) =>
    respond(async (): Promise<RoomStateWithMember> => {
        assertImportsEnabled()
        enforceRateLimit(request, IMPORT_LIMIT, 'import')

        const raw = await readJsonCapped(
            request,
            MAX_IMPORT_BODY_BYTES,
            badRequest('that import is too big', 'IMPORT_TOO_LARGE')
        )
        assertImportCardinality(raw)
        const body = importRoomSchema.parse(raw)
        const { room, memberId, memberToken } = await importRoom(body, request)
        return { ...toRoomState(room), memberId, memberToken }
    }, 201)
