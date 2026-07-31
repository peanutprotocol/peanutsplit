/**
 * The achievement artwork, as one route.
 *
 * A plain Route Handler rather than Next's metadata-image convention, because
 * the convention is one image per segment and six kinds sit behind one path.
 * Every element this file rasterizes comes out of `achievementCardArt.tsx`, so
 * this stays a `.ts` file with no JSX in it.
 *
 * Its important consumer is the share button, which FETCHES these bytes and
 * hands them to `navigator.share({ files })` — the artefact that leaves the
 * group is an image, not a URL carrying the room's credential. That is also why
 * an unknown slug answers 200 with the brand card rather than a 404 or a 500: a
 * failed fetch is a dead button for a member who did nothing wrong.
 *
 * The service worker caches these URLs. `sw.ts`'s `NetworkOnly` rule covers
 * `/api/` only, so a card path falls through to `defaultCache`'s "others"
 * `NetworkFirst` bucket, and its full URL — slug included — is persisted in
 * Cache Storage for 24h. That already happens to `/r/<slug>/recap/opengraph-image`
 * and to the room page itself, so it is no new class; it is written down because
 * "the slug only ever lives in a path" is the sentence the rest of this wave
 * leans on. The share path fetches with `cache: 'no-store'`, so what gets shared
 * is never a stale card; the `<img>` shelf tiles keep the cache, which is right —
 * a shelf is a snapshot.
 */
import { ImageResponse } from 'next/og'
import { CARD_KINDS, type AlterEgoCardParams, type CardKind } from '@/lib/achievements-contract'
import { isAvatarKey } from '@/lib/avatars'
import { isAwardId, loadAchievementCard } from '@/server/og/achievementCard'
import { renderAchievementCard } from '@/server/og/achievementCardArt'
import { ogFonts } from '@/server/og/fonts'
import { OG_CACHE_CONTROL, OG_SIZE } from '@/server/og/frame'
import { enforceRateLimit, LOOKUP_MISS_LIMIT, LOOKUP_MISS_SCOPE } from '@/server/rateLimit'

// Prisma + `fs` for the fonts: this cannot run on the edge.
export const runtime = 'nodejs'
// Live room state, and the build has no database — never prerender this.
export const dynamic = 'force-dynamic'

const isCardKind = (value: string): value is CardKind => (CARD_KINDS as readonly string[]).includes(value)

export async function GET(request: Request, { params }: { params: Promise<{ slug: string; kind: string }> }) {
    const { slug, kind } = await params
    if (!isCardKind(kind)) return new Response(null, { status: 404 })

    // The alter-ego card's whole input, and deliberately not a member id: two
    // closed sets, so the query string carries no identifier. Anything outside
    // them is a 404 rather than a fallback — a card drawn for an award nobody
    // holds would be a false claim about a person.
    let alterEgo: AlterEgoCardParams | undefined
    if (kind === 'alterego') {
        const query = new URL(request.url).searchParams
        const award = query.get('a')
        const persona = query.get('p')
        if (!isAwardId(award) || !isAvatarKey(persona)) return new Response(null, { status: 404 })
        alterEgo = { award, persona }
    }

    // A miss and a failed lookup are not the same fact. Only a miss is evidence
    // about whether the room exists, so only a miss may spend from the budget:
    // the same budget is preflight-ENFORCED on `/api/rooms/[slug]`, so billing a
    // database blip to it would 429 a real member on their own room for the rest
    // of the hour. Both still draw the brand card — the button must not die.
    const [fonts, lookup] = await Promise.all([
        ogFonts(),
        loadAchievementCard(slug, kind, alterEgo).then(
            (card) => ({ card, missed: card === null }),
            () => ({ card: null, missed: false })
        ),
    ])

    if (lookup.missed) {
        // Spend from the SAME miss budget every other room lookup spends from.
        // `rateLimit.ts` already decided the rule: any route that loads a room by
        // slug is a room-existence oracle unless the misses are budgeted, and one
        // route with six kinds multiplies that surface by six.
        //
        // The budget is spent, never enforced. A 429 here would be a dead share
        // button, and the oracle closes because a miss COSTS something, not
        // because the answer changes — every miss answers 200 with the brand
        // card whether the budget is full or empty, which is the point.
        try {
            enforceRateLimit(request, LOOKUP_MISS_LIMIT, LOOKUP_MISS_SCOPE)
        } catch {
            /* budget only */
        }
    }

    return new ImageResponse(renderAchievementCard(lookup.card), {
        ...OG_SIZE,
        fonts,
        headers: { 'Cache-Control': OG_CACHE_CONTROL },
    })
}
