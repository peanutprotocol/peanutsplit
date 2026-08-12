/**
 * The recap card, at the one URL the app itself can spell.
 *
 * A plain Route Handler rather than Next's metadata-image convention, for the
 * same reason `card/[kind]/route.ts` is one: the consumer that matters FETCHES
 * these bytes. `RecapShareButton` hands them to `navigator.share({ files })` so
 * that what leaves the group is an image and not a URL carrying the room's
 * credential, and the WRAPPED deck draws the same bytes into its leading tile.
 * Both start from a slug and nothing else.
 *
 * The metadata convention cannot serve that caller, and the production incident
 * this route closes is the proof. Next appends a build-scoped hash to a generated
 * metadata-image SEGMENT whenever any parent segment is a route group or a
 * parallel route — every page here lives under `(product-shell)` — and then adds
 * a `?<id>` cache-buster it only ever writes inside the `<meta>` tag. The served
 * URL is shaped like `…/recap/opengraph-image-1fizlm?9a3e77b0…` — both halves
 * move with the build — while the hashless `…/recap/opengraph-image` answers 404,
 * so NOTHING about it is derivable from a slug. From `005a942`, the commit that
 * moved these routes under the group, "Share the story" caught the throw and
 * apologised while the deck's recap tile rendered broken. The unit suite never
 * noticed — it calls the route's export directly, and no hash can reach an export
 * — and the one spec that did assert the URL is an e2e, which is not in the
 * pre-push gate. A Route Handler is served at the path it is written at, which is
 * the whole property these callers need.
 *
 * The unfurl is NOT moved here: `recap/opengraph-image.tsx` stays exactly where
 * it is, because a crawler is handed its URL out of the `<head>` and the hash is
 * a cache key doing its job. Both routes render through `og/recapImage.tsx`, so
 * the two URLs are two doors onto one picture.
 *
 * The service worker caches this URL, slug included, in Cache Storage for 24h:
 * `sw.ts`'s `NetworkOnly` rule covers `/api/` only, so a card path falls through
 * to `defaultCache`'s "others" `NetworkFirst` bucket. Same as the room page and
 * the achievement cards, so it is no new class of exposure. The share path
 * fetches with `cache: 'no-store'` and never sends a stale card; the deck's
 * `<img>` keeps the cache, which is right — a deck is a snapshot.
 */
import { recapImageResponse } from '@/server/og/recapImage'
import { enforceRateLimit, LOOKUP_MISS_LIMIT, LOOKUP_MISS_SCOPE } from '@/server/rateLimit'

// Prisma + `fs` for the fonts: this cannot run on the edge.
export const runtime = 'nodejs'
// Live room state, and the build has no database — never prerender this.
export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params

    // Every slug answers 200, so the status code is not the oracle — but the
    // brand card versus a real recap still is, and guessing slugs against it has
    // to cost something. Only a miss spends, and a drained budget must not turn
    // into a 429: that would be the dead button again, for the wrong people.
    return recapImageResponse(slug, () => {
        try {
            enforceRateLimit(request, LOOKUP_MISS_LIMIT, LOOKUP_MISS_SCOPE)
        } catch {
            /* budget only */
        }
    })
}
