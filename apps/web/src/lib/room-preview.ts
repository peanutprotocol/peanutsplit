/**
 * The social image attached by chat apps after they inspect a room URL.
 *
 * On web the URL is deliberately not built here. `opengraph-image.tsx` is a Next
 * file convention, and Next — not this app — decides what to serve it under: the
 * route group in the path earns the route a hash suffix
 * (`/r/<slug>/opengraph-image-<hash>`), and the tag Next writes carries a
 * cache-busting query on top of it. The tag Next already put in the document is
 * the exact URL a crawler will ask for, query included, so web reads that.
 * Hand-building `/r/<slug>/opengraph-image` is what used to 404 in production.
 *
 * The store app has no room `<head>` to ask: its page is a bundled file. There
 * `roomPreviewImagePath` derives the path the way Next derives it (see there), and
 * the warm is an opaque request through `apiUrl`.
 */

import { djb2Hash } from 'next/dist/shared/lib/hash'
import { apiUrl, IS_NATIVE_APP } from './platform'

/**
 * The room route's source segment, as the app directory spells it. Next names the room's
 * `opengraph-image` after a hash of exactly this string because it contains the `(product-shell)`
 * route group. `room-preview.test.ts` checks that the file exists here and that Next's own route
 * builder produces the same URL, so moving the route fails a test instead of warming a 404.
 */
const ROOM_SEGMENT = '/(product-shell)/r/[slug]'

/**
 * `/r/<slug>/opengraph-image-<suffix>`: the path Next serves the room's unfurl image at.
 *
 * The suffix is Next's `getMetadataRouteSuffix`: the first six base-36 digits of `djb2Hash` over
 * the parent segment. It depends on the route's location in the source tree, not on the build.
 * Next adds a `?<contenthash>` of the image file to the `<head>` tag. That part is not derivable
 * here; the route is matched on the path alone, so the request without it renders the same card.
 */
export function roomPreviewImagePath(slug: string): string {
    const suffix = djb2Hash(ROOM_SEGMENT).toString(36).slice(0, 6)
    return `/r/${encodeURIComponent(slug)}/opengraph-image-${suffix}`
}

/** Just enough of `Document` to find the tag and to know where it was served from. */
interface PreviewDocument {
    readonly baseURI: string
    querySelector(selectors: string): { getAttribute(name: string): string | null } | null
}

/**
 * The preview image THIS document advertises — but only when it is this room's.
 *
 * The slug check is not paranoia: rooms are created from `/` and from `/new`,
 * and the marketing landing has an unfurl card of its own, so a document is
 * asked what it advertises rather than assumed to be the room. Warming the
 * landing card because a room was created on top of it would spend a request on
 * an image nobody is about to share.
 */
function advertisedPreviewUrl(slug: string, doc: PreviewDocument): string | null {
    try {
        const content = doc.querySelector('meta[property="og:image"]')?.getAttribute('content')
        if (!content) return null

        const image = new URL(content, doc.baseURI)
        // `metadataBase` pins the tag to the canonical host, so on the alternate
        // domain this image is cross-origin: the fetch would fail CORS — the
        // console noise this prewarm exists to avoid — and hand us nothing
        // readable. The crawler follows the canonical host regardless, and that
        // is the origin whose cache the warming is for, so skip it here.
        if (image.origin !== new URL(doc.baseURI).origin) return null

        const [, prefix, room] = image.pathname.split('/')
        if (prefix !== 'r' || decodeURIComponent(room ?? '') !== slug) return null

        return image.href
    } catch {
        return null
    }
}

/**
 * Start rendering the room preview before somebody reaches for Share.
 *
 * Consuming the response lets the browser HTTP cache, the service worker and
 * any shared HTTP cache in front of the app retain the completed PNG. Failure
 * is intentionally a boolean: preview art is an enhancement to the URL and can
 * never make room creation, room access or sharing fail. A document with
 * nothing to warm — the server, or a page that is not this room — is that same
 * quiet `false`, not an error.
 */
export async function prewarmRoomPreview(
    slug: string,
    fetcher: typeof fetch = globalThis.fetch,
    doc: PreviewDocument | undefined = globalThis.document
): Promise<boolean> {
    if (!slug || typeof fetcher !== 'function') return false

    if (IS_NATIVE_APP) {
        // `no-cors`: the image route sends no CORS header and the app does not need to read the
        // bytes. The server renders the card either way, which is the warming. `no-store` keeps
        // the WebView from answering the request out of its own cache instead of asking.
        try {
            await fetcher(apiUrl(roomPreviewImagePath(slug)), { mode: 'no-cors', cache: 'no-store' })
            return true
        } catch {
            return false
        }
    }

    if (!doc) return false

    const image = advertisedPreviewUrl(slug, doc)
    if (!image) return false

    try {
        // Header-free on purpose. A crawler asks for this image anonymously, and
        // the warmed cache entry is only useful if it answers that same request
        // — so no member token goes anywhere near it.
        const response = await fetcher(image, {
            cache: 'force-cache',
            credentials: 'same-origin',
        })
        if (!response.ok) return false
        await response.arrayBuffer()
        return response.headers.get('content-type')?.startsWith('image/') ?? true
    } catch {
        return false
    }
}
