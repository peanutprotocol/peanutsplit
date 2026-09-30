/**
 * X (Twitter) Ads conversion tracking, wrapped the way `google-ads.ts` wraps gtag: this module
 * owns `twttr`, and nothing else in the app touches it. It runs on the product host only and is
 * mounted where the Google tag is, for the same reasons.
 *
 * The tag is X's single-event website tag (`oct.js`, pixel `rg4xs`, "Split room created"). Unlike
 * gtag it takes no URL from us: every hit reads `location.href` and `document.referrer` itself,
 * and it sends the hit a tick later, by which time `/new` may already have navigated to the new
 * room's `/r/<slug>`. So each hit sets `hide_page_location`, which X documents for exactly this
 * case — a URL that carries sensitive data — and which `oct.js` blanks both fields on. Without
 * it the tag would report a room prefill (`/new?name=Ski%20trip`) or the room link itself.
 *
 * Attribution: X appends `twclid` to an ad's landing URL, and "the X Pixel already automatically
 * passes twclid from URL or first-party cookie". `oct.js` only looks at the URL it is on when a
 * conversion fires, and writes its `_twclid` cookie at that moment, not on landing. A visitor who
 * lands on `/` and follows a link to `/new` would reach the conversion with the click id gone, so
 * this module keeps the landing `twclid` for the tab and passes it as the documented `twclid`
 * event parameter, which "can be optionally used to force attribution to a certain ad click".
 *
 * Sources: `twclid` in the event parameters table at
 * https://business.x.com/en/help/campaign-measurement-and-analytics/conversion-tracking-for-websites
 * and `hide_page_location` under "Sensitive Data" at
 * https://business.x.com/en/help/campaign-measurement-and-analytics/conversion-tracking-for-websites/about-conversion-tracking
 * X documents both for `twq`; that `trackPid` honours them is read from oct.js 2.4.11 itself.
 */

import { isProductHost } from './domains'

/** The "Split room created" single-event tag. Public by nature — it ships in the page either way. */
export const X_ROOM_CREATED_PIXEL = 'rg4xs'

export const OCT_SRC = 'https://platform.twitter.com/oct.js'

const SCRIPT_ID = 'x-ads-oct'

/** Session storage, so the click id lasts as long as the tab and never outlives it. */
export const CLICK_ID_KEY = 'ps-x-click-id'

/** An ad click id is an opaque token; anything else under the same name is not one. */
const CLICK_ID = /^[\w.-]{1,256}$/

type XConversion = { trackPid: (pixel: string, params?: Record<string, unknown>) => void }

declare global {
    interface Window {
        twttr?: { conversion?: XConversion }
    }
}

/** Only the deployment that serves peanutsplit.com reports to peanutsplit.com's ad account. */
export const xAdsEnabled = (hostname: string): boolean => isProductHost(hostname)

/** The `twclid` an X ad put on this URL, or null. */
export function readClickId(search: string): string | null {
    const value = new URLSearchParams(search).get('twclid')
    return value && CLICK_ID.test(value) ? value : null
}

function rememberClickId(): void {
    const clickId = readClickId(window.location.search)
    if (!clickId) return
    try {
        window.sessionStorage.setItem(CLICK_ID_KEY, clickId)
    } catch {
        // Storage can be blocked; the conversion then falls back to what oct.js finds itself.
    }
}

function rememberedClickId(): string | null {
    try {
        const value = window.sessionStorage.getItem(CLICK_ID_KEY)
        return value && CLICK_ID.test(value) ? value : null
    } catch {
        return null
    }
}

/** Load oct.js and keep the landing click id. Idempotent, and a no-op off the product host. */
export function initXAds(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    if (!xAdsEnabled(window.location.hostname)) return
    rememberClickId()
    if (document.getElementById(SCRIPT_ID)) return

    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.async = true
    script.src = OCT_SRC
    document.head.appendChild(script)
}

/**
 * A room came into being. No value and nothing about the room, as with the Google conversion;
 * the zero amounts are the ones X's own embed code sends.
 *
 * Silent until oct.js has loaded — it has no queue, and a room created elsewhere is a conversion
 * that cannot be attributed anyway.
 */
export function trackXRoomCreatedConversion(): void {
    if (typeof window === 'undefined') return
    if (!xAdsEnabled(window.location.hostname)) return
    const conversion = window.twttr?.conversion
    if (typeof conversion?.trackPid !== 'function') return
    const clickId = rememberedClickId()
    try {
        conversion.trackPid(X_ROOM_CREATED_PIXEL, {
            tw_sale_amount: 0,
            tw_order_quantity: 0,
            hide_page_location: true,
            ...(clickId ? { twclid: clickId } : {}),
        })
    } catch {
        // Measurement must never break the flow that was being measured.
    }
}
