import { ApiError, badRequest, readJsonCapped, respond } from '@/server/http'
import { IMPORT_LIMIT, enforceRateLimit } from '@/server/rateLimit'
import { toRoomState } from '@/server/roomState'
import { importRoom } from '@/server/splitwiseImport'
import { importRoomSchema } from '@/server/validation'
import type { RoomStateWithMember } from '@/lib/api-types'
import { MAX_EXPENSES, MAX_MEMBERS } from '@/lib/splitwise-csv'

export const dynamic = 'force-dynamic'

/**
 * Bytes of JSON. Five hundred expenses across twenty members is roughly 400 KB, so a megabyte is
 * generous and still refuses a payload sized to hurt. Counted as the body streams in (see
 * `readJsonCapped`), so a chunked request with no declared length is refused at the same byte a
 * declared one is — the header alone would be a claim, and an absent one reads as zero.
 */
const MAX_BODY_BYTES = 1_000_000
/** Aggregate row-amplification ceiling, equal to the full documented product
 * envelope. It is intentionally explicit even though the two dimension guards
 * imply it today, so a future limit change cannot silently remove the overall
 * hard stop before Zod or a transaction runs. */
export const MAX_IMPORT_SHARE_ROWS = MAX_EXPENSES * MAX_MEMBERS

/** Operational kill switch, deliberately process-local and configuration-only.
 * Missing means enabled so existing deployments retain their behavior. */
const importsEnabled = (): boolean =>
    !['0', 'false', 'off'].includes(process.env.SPLIT_IMPORT_ENABLED?.trim().toLowerCase() ?? '')

/**
 * Bound multiplicative collections before Zod traverses them. The byte cap protects buffering,
 * while these limits prevent a compact array of invalid values from producing an unbounded issue
 * list. Field-level validation remains the schema's job once the collections fit product limits.
 */
export function assertImportCardinality(raw: unknown): void {
    if (typeof raw !== 'object' || raw === null) return

    const record = raw as Record<string, unknown>
    if (Array.isArray(record.members) && record.members.length > MAX_MEMBERS) {
        throw badRequest('that import has too many members', 'IMPORT_TOO_LARGE')
    }

    if (!Array.isArray(record.expenses)) return
    if (record.expenses.length > MAX_EXPENSES) {
        throw badRequest('that import has too many expenses', 'IMPORT_TOO_LARGE')
    }

    let totalShares = 0
    for (const expense of record.expenses) {
        if (typeof expense !== 'object' || expense === null) continue
        const shares = (expense as Record<string, unknown>).shares
        if (Array.isArray(shares) && shares.length > MAX_MEMBERS) {
            throw badRequest('an imported expense has too many shares', 'IMPORT_TOO_LARGE')
        }
        if (Array.isArray(shares)) {
            totalShares += shares.length
            if (totalShares > MAX_IMPORT_SHARE_ROWS) {
                throw badRequest('that import has too many total shares', 'IMPORT_TOO_LARGE')
            }
        }
    }
}

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
        if (!importsEnabled()) {
            throw new ApiError(503, 'IMPORT_UNAVAILABLE', 'imports are temporarily paused — try again later')
        }
        enforceRateLimit(request, IMPORT_LIMIT, 'import')

        const raw = await readJsonCapped(
            request,
            MAX_BODY_BYTES,
            badRequest('that import is too big', 'IMPORT_TOO_LARGE')
        )
        assertImportCardinality(raw)
        const body = importRoomSchema.parse(raw)
        const { room, memberId, memberToken } = await importRoom(body, request)
        return { ...toRoomState(room), memberId, memberToken }
    }, 201)
