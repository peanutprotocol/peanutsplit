import { NextResponse, type NextRequest } from 'next/server'
import { SHARE_TARGET_LANDING } from '@/lib/shared-receipt'

/**
 * The share target's landing pad when the service worker is not there to take it.
 *
 * Normally the worker intercepts this POST before it leaves the device, parks the photo in Cache
 * Storage and answers the same 303 — the photo never reaches a server. This handler runs only when
 * the worker was unregistered, is mid-update, or was evicted. The body is deliberately never read:
 * there is nothing on this server that should ever hold a receipt photo, and the page we redirect
 * to already knows how to say "that photo didn't make it".
 *
 * A route rather than the page itself because Next forbids a page.tsx and a route.ts in one
 * segment, and pointing the manifest at the page would answer a bare 405 in exactly this case.
 *
 * 303 so the browser follows it as a GET. No rate limit and no flag gate: it does no work and
 * touches no database.
 */
export async function POST(request: NextRequest) {
    // The body is never consumed, so cancel it rather than leaving a full-size photo to be read
    // into memory by a handler that has no use for it.
    await request.body?.cancel().catch(() => {})
    return NextResponse.redirect(new URL(SHARE_TARGET_LANDING, request.url), 303)
}
