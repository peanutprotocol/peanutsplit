/**
 * The recap artwork, rasterized in one place for the two routes that serve it.
 *
 * There are two routes because there are two kinds of caller, and they need
 * opposite things from a URL:
 *
 *  1. `recap/opengraph-image.tsx` — Next's metadata-image convention. Next spells
 *     that URL itself and writes it into the `<head>` of `/r/<slug>/recap`, hash,
 *     cache-buster and all. A crawler never has to guess it, so the hash is free
 *     to change every build.
 *  2. `recap/card/route.ts` — a plain Route Handler at a path derivable from the
 *     slug. That is what "Share the story" fetches and what the WRAPPED deck
 *     draws, because imperative client code holds a slug and nothing else.
 *
 * Both are the same picture, so the query, the fallback, the fonts and the
 * caching headers live here. Two copies of this would drift on the first edit to
 * either end, and the drift would be invisible until somebody compared a shared
 * PNG with the one in a group chat.
 */
import { ImageResponse } from 'next/og'
import { BrandCard, OG_CACHE_CONTROL, OG_SIZE } from '@/server/og/card'
import { emblemDataUri } from '@/server/og/emblem'
import { ogFonts } from '@/server/og/fonts'
import { loadRecap, toRecapCard } from '@/server/og/recapCard'
import { RecapCard } from '@/server/og/recapCardArt'

/**
 * The recap PNG for a slug, always 200.
 *
 * An unknown or deleted room renders the brand card rather than a 404 or a 500:
 * the share button is fetching these bytes, and a failed fetch is a dead button
 * for a member who did nothing wrong. A dead link also still gets pasted into a
 * group chat, where a 500 is what every crawler there would cache.
 *
 * `onLookupMiss` is how the Route Handler bills the room-existence oracle without
 * this module having to know about rate limits or hold a `Request`. Only a MISS
 * fires it: a miss is evidence about whether a room exists, while a lookup that
 * threw is evidence about the database and must not spend anybody's budget. The
 * metadata route passes nothing, because a caller who cannot spell its hashed URL
 * cannot aim it at slugs either.
 */
export async function recapImageResponse(slug: string, onLookupMiss?: () => void): Promise<ImageResponse> {
    const [fonts, lookup] = await Promise.all([
        ogFonts(),
        loadRecap(slug).then(
            (recap) => ({ recap, missed: recap === null }),
            () => ({ recap: null, missed: false })
        ),
    ])

    if (lookup.missed) onLookupMiss?.()

    const card = lookup.recap ? toRecapCard(lookup.recap) : null
    const emojiSrc = card ? emblemDataUri(card.emblem) : null

    return new ImageResponse(
        card ? (
            <RecapCard card={card} emojiSrc={emojiSrc} />
        ) : (
            <BrandCard lines={['ALL', 'SETTLED']} tagline="Split anything, settle up after." />
        ),
        { ...OG_SIZE, fonts, headers: { 'Cache-Control': OG_CACHE_CONTROL } }
    )
}
