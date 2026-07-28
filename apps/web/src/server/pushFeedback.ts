/**
 * The receiving half of push: what the service worker beacons back when a
 * notification is tapped or swiped away.
 *
 * These calls are unauthenticated by necessity — a service worker handling a
 * notification may have no page, no member token and no chance to retry — so
 * the contract is: always 204, never throw, never let a forged or stale body
 * mean anything more than a discarded request. Analytics proper is client-side
 * (`track()` needs a browser), so the only thing recorded here is a counter on
 * the ledger row that produced the notification.
 */
import { prisma } from '@/server/db'
import { readJson } from '@/server/http'
import { enforceRateLimit, type Limit } from '@/server/rateLimit'
import { pushFeedbackSchema } from '@/server/validation'

/** 60/min/IP: plenty for a human clearing a notification shade, cheap enough to
 *  keep a script off the database. */
const BEACON_LIMIT: Limit = { capacity: 60, windowMs: 60_000 }

export type FeedbackAction = 'opened' | 'dismissed'

/** Builds the route handler for one beacon path. Both paths are the same
 *  handler with a different column, and a second copy of "swallow everything"
 *  is a second place to get it wrong. */
export function pushFeedbackHandler(action: FeedbackAction) {
    return async (request: Request): Promise<Response> => {
        try {
            // The limiter throws; here that only means "skip the write", because
            // the beacon still gets its 204 either way. Rate limiting a beacon is
            // about protecting the database, not about answering the caller.
            enforceRateLimit(request, BEACON_LIMIT, `push-${action}`)
            const parsed = pushFeedbackSchema.safeParse(await readJson(request))
            if (parsed.success) await bumpCounter(parsed.data.sendId, action)
        } catch {
            // Rate limited, unparseable body, dropped connection, a ledger row
            // that has since been pruned — none of it is worth surfacing.
        }
        return new Response(null, { status: 204 })
    }
}

async function bumpCounter(sendId: string, action: FeedbackAction): Promise<void> {
    await prisma.notificationSend.update({
        where: { id: sendId },
        data: action === 'opened' ? { openedCount: { increment: 1 } } : { dismissedCount: { increment: 1 } },
    })
}
