import { MAX_EXPENSES, MAX_MEMBERS } from '@/lib/splitwise-csv'
import { ApiError, badRequest } from '@/server/http'

/** Five hundred expenses across twenty members is roughly 400 KB. */
export const MAX_IMPORT_BODY_BYTES = 1_000_000

/** Aggregate row-amplification ceiling, equal to the full documented product
 * envelope. It remains explicit so a future dimension-limit change cannot
 * silently remove the overall hard stop before Zod or a transaction runs. */
export const MAX_IMPORT_SHARE_ROWS = MAX_EXPENSES * MAX_MEMBERS

/** Missing means enabled so existing deployments retain their behavior. */
const importsEnabled = (): boolean =>
    !['0', 'false', 'off'].includes(process.env.SPLIT_IMPORT_ENABLED?.trim().toLowerCase() ?? '')

/** One operational kill switch guards every bulk-import destination before it
 * spends rate-limit capacity or reads a potentially large request body. */
export function assertImportsEnabled(): void {
    if (!importsEnabled()) {
        throw new ApiError(503, 'IMPORT_UNAVAILABLE', 'imports are temporarily paused — try again later')
    }
}

/**
 * Bound multiplicative collections before Zod traverses them. The byte cap
 * protects buffering, while these limits prevent a compact array of invalid
 * values from producing an unbounded issue list.
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
