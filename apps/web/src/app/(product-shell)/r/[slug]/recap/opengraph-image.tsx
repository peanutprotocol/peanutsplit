/**
 * The recap artwork, as a route.
 *
 * Two consumers, and the second is the important one:
 *  1. a chat client unfurling `/r/<slug>/recap`, if a member pastes it;
 *  2. the "Share the story" button, which FETCHES this PNG and hands the bytes
 *     to `navigator.share({ files })` — so the artefact that leaves the group is
 *     an image, not a URL carrying the room's credential.
 *
 * That second use is why this route exists at a predictable path and why the
 * image is self-contained: it prints the domain, never the slug.
 */
import { ImageResponse } from 'next/og'
import { BrandCard, OG_CACHE_CONTROL, OG_CONTENT_TYPE, OG_SIZE } from '@/server/og/card'
import { emblemDataUri } from '@/server/og/emblem'
import { ogFonts } from '@/server/og/fonts'
import { loadRecap, toRecapCard } from '@/server/og/recapCard'
import { RecapCard } from '@/server/og/recapCardArt'

// Prisma + `fs` for the fonts: this cannot run on the edge.
export const runtime = 'nodejs'
// Live room state, and the build has no database — never prerender this.
export const dynamic = 'force-dynamic'

export const alt = 'A Peanut Split trip recap'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function RecapOgImage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params
    // An unknown or deleted room renders the brand card, never a 500 — the share
    // button is fetching these bytes, and a failed fetch is a dead button.
    const [fonts, recap] = await Promise.all([ogFonts(), loadRecap(slug).catch(() => null)])
    const card = recap ? toRecapCard(recap) : null
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
