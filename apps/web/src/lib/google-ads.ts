/**
 * Google Ads conversion tracking, wrapped the way `analytics.ts` wraps PostHog: this module
 * owns `gtag`, and nothing else in the app touches it.
 *
 * Three things here are deliberate.
 *
 * It runs on the live product host and nowhere else. The ad account is Peanut's, so a fork or
 * a dev box firing conversions into it would both dirty the campaign and hand Google traffic
 * from people who never chose it — the same reason a missing PostHog key buys silence rather
 * than console noise.
 *
 * It is mounted only on pages that can carry an ad click or complete a conversion: the
 * marketing surface and `/new`. A room page is never one of them. `/r/<slug>` is a credential
 * in a URL and gtag reports `page_location` on every hit it sends.
 *
 * And the URL it reports is rebuilt rather than passed through. `/new` can arrive carrying the
 * room name a template link chose (`?name=Ski%20trip`); a room name in a third party's logs is
 * the same leak this app's analytics boundary exists to prevent.
 */

import { isProductHost } from './domains'
import { redactRoomSlugs } from './redact'
import { UTM_KEYS } from './utm'

/** The Peanut Split conversion account. Public by nature — it ships in the page either way. */
export const GOOGLE_ADS_ID = 'AW-17182428820'

/** The "room created" conversion action, as the Ads account names it. */
export const ROOM_CREATED_LABEL = 'XKXPCO6ImeccEJSdnIFA'

export const GTAG_SRC = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`

const SCRIPT_ID = 'google-ads-gtag'

/**
 * The query parameters gtag is allowed to see.
 *
 * Google's click ids have to survive — they are the entire link between a conversion and the
 * click that paid for it — and a campaign label is already a public fact about the link that
 * was posted. Everything else is dropped, including the room prefill.
 */
const REPORTABLE_QUERY = new Set<string>([
    'gclid',
    'gbraid',
    'wbraid',
    'gclsrc',
    'gad_source',
    'gad_campaignid',
    ...UTM_KEYS,
])

declare global {
    interface Window {
        dataLayer?: unknown[]
        gtag?: (...args: unknown[]) => void
    }
}

/** Only the deployment that serves peanutsplit.com reports to peanutsplit.com's ad account. */
export const googleAdsEnabled = (hostname: string): boolean => isProductHost(hostname)

/** A URL with everything gtag does not need removed: no fragment, no unlisted query, no slug. */
export function reportableUrl(raw: string): string | null {
    let url: URL
    try {
        url = new URL(raw)
    } catch {
        return null
    }
    const query = new URLSearchParams()
    for (const [key, value] of url.searchParams) if (REPORTABLE_QUERY.has(key)) query.append(key, value)
    url.search = query.toString()
    url.hash = ''
    url.pathname = redactRoomSlugs(url.pathname)
    return url.toString()
}

/**
 * The referrer, kept only when it is somebody else's page.
 *
 * An external referrer is where the click came from, which is the only referrer worth
 * reporting. Our own URLs are the ones that can name a room, and an in-app hop tells Google
 * nothing it is not already being told by the page it is on.
 */
export function reportableReferrer(referrer: string, origin: string): string {
    if (!referrer) return ''
    try {
        if (new URL(referrer).origin === origin) return ''
    } catch {
        return ''
    }
    return reportableUrl(referrer) ?? ''
}

/**
 * Load gtag.js and configure the account. Idempotent, and a no-op off the product host.
 *
 * `send_page_view: false` because an Ads tag has exactly one job here — the room-created
 * conversion below. The config call still runs: it is what reads a `gclid` out of the landing
 * URL and stores it in the first-party cookie the later conversion is matched against.
 */
export function initGoogleAds(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    if (!googleAdsEnabled(window.location.hostname)) return
    if (document.getElementById(SCRIPT_ID)) return

    window.dataLayer = window.dataLayer ?? []
    window.gtag =
        window.gtag ??
        function gtag() {
            // gtag.js reads the raw `arguments` object back off the queue; an array is not the
            // same shape and its calls are silently discarded.
            window.dataLayer!.push(arguments)
        }

    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.async = true
    script.src = GTAG_SRC
    document.head.appendChild(script)

    window.gtag('js', new Date())
    window.gtag('config', GOOGLE_ADS_ID, {
        send_page_view: false,
        page_location: reportableUrl(window.location.href) ?? undefined,
        page_referrer: reportableReferrer(document.referrer, window.location.origin),
    })
}

/**
 * A room came into being — the conversion the campaign is bidding for.
 *
 * Deliberately without a value: a Split room is worth whatever it is worth, and inventing a
 * number here would only teach the bidder a fiction. Nothing about the room is attached, for
 * the reason the whole analytics boundary exists.
 *
 * Silent when the tag was never mounted — a room created somewhere the tag does not load is a
 * conversion that cannot be attributed anyway, and a queued hit would only fire on whichever
 * page happened to load gtag next.
 */
export function trackRoomCreatedConversion(): void {
    if (typeof window === 'undefined' || !window.gtag) return
    if (!googleAdsEnabled(window.location.hostname)) return
    try {
        window.gtag('event', 'conversion', { send_to: `${GOOGLE_ADS_ID}/${ROOM_CREATED_LABEL}` })
    } catch {
        // Measurement must never break the flow that was being measured.
    }
}
