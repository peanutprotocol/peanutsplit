import { ApiError } from '@/server/http'

/**
 * A scan temporarily holds the encoded image, parsed JSON and provider request
 * body at the same time. Keep that memory bounded independently of IP headers,
 * room links and rate-limit buckets: none of those prevents ten requests from
 * arriving together.
 */
export const MAX_CONCURRENT_RECEIPT_SCANS = 2

let activeScans = 0

/** Acquire before reading the request body; always release in a `finally`. */
export function acquireReceiptScanSlot(): () => void {
    if (activeScans >= MAX_CONCURRENT_RECEIPT_SCANS) {
        throw new ApiError(429, 'RATE_LIMITED', 'receipt scanning is busy — give it a minute and try again')
    }

    activeScans++
    let released = false
    return () => {
        if (released) return
        released = true
        activeScans--
    }
}
