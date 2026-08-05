import type { ImportIntoRoomResult } from '@/lib/api-types'
import { publish } from '@/server/events'
import { badRequest, memberTokenOf, readJsonCapped, respond } from '@/server/http'
import { MAX_IMPORT_BODY_BYTES, assertImportCardinality, assertImportsEnabled } from '@/server/importRequest'
import { IMPORT_LIMIT, enforceRateLimit } from '@/server/rateLimit'
import { loadRoom, toRoomState } from '@/server/roomState'
import { importIntoRoom } from '@/server/splitwiseImport'
import { importIntoRoomSchema } from '@/server/validation'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string }> }

/**
 * Append one parsed source export to an existing room.
 *
 * The browser still parses locally; this endpoint receives only the validated
 * ledger projection, immutable-source fingerprint and explicit source-person
 * mappings. A repeated local export choice is returned as an idempotent
 * success and deliberately does not poke realtime subscribers a second time.
 */
export const POST = (request: Request, ctx: Ctx) =>
    respond(async (): Promise<ImportIntoRoomResult> => {
        assertImportsEnabled()
        enforceRateLimit(request, IMPORT_LIMIT, 'import')
        const { slug } = await ctx.params
        const raw = await readJsonCapped(
            request,
            MAX_IMPORT_BODY_BYTES,
            badRequest('that import is too big', 'IMPORT_TOO_LARGE')
        )
        assertImportCardinality(raw)
        const body = importIntoRoomSchema.parse(raw)
        const room = await loadRoom(slug)
        const result = await importIntoRoom(room, body, request, memberTokenOf(request))

        if (!result.alreadyImported) publish(room.id)
        return {
            ...toRoomState(result.room),
            batchId: result.batchId,
            importedAt: result.importedAt.toISOString(),
            addedExpenses: result.addedExpenses,
            addedMembers: result.addedMembers,
            alreadyImported: result.alreadyImported,
        }
    })
