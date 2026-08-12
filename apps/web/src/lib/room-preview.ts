/**
 * The social image attached by chat apps after they inspect a room URL.
 *
 * The URL is deliberately not built here, and must not be. `opengraph-image.tsx`
 * is a Next file convention, and Next — not this app — decides what to serve it
 * under: the route group in the path earns the route a build-scoped hash suffix
 * (`/r/<slug>/opengraph-image-<hash>`), and the tag Next writes can carry a
 * cache-busting query on top of it. Neither part is derivable from the slug, so
 * the only honest source for the URL is the tag Next already put in the document.
 * Hand-building `/r/<slug>/opengraph-image` is what used to 404 in production.
 */

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
    if (!slug || typeof fetcher !== 'function' || !doc) return false

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
