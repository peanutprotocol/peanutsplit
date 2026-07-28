/**
 * The invite unfurl. This image is the product's storefront — for most people it
 * is the first and only thing they see before deciding to tap a link a friend
 * dropped in a group chat.
 */
import { ImageResponse } from 'next/og'
import { BrandCard, OG_CACHE_CONTROL, OG_CONTENT_TYPE, OG_SIZE, RoomCard } from '@/server/og/card'
import { emblemDataUri } from '@/server/og/emblem'
import { ogFonts } from '@/server/og/fonts'
import { loadRoomCard } from '@/server/og/roomCard'

// Prisma + `fs` for the fonts: this cannot run on the edge.
export const runtime = 'nodejs'
// Live room state, and the build has no database — never prerender this.
export const dynamic = 'force-dynamic'

export const alt = 'A Peanut Split room'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function RoomOgImage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params
    // A dead link still gets pasted into a chat: an unknown slug renders the
    // brand card, never a 500 that every crawler in the group would cache.
    const [fonts, card] = await Promise.all([ogFonts(), loadRoomCard(slug).catch(() => null)])
    const emojiSrc = card ? await emblemDataUri(card.emoji) : null

    return new ImageResponse(
        card ? (
            <RoomCard card={card} emojiSrc={emojiSrc} />
        ) : (
            <BrandCard lines={['SPLIT', 'ANYTHING']} tagline="Share one link, settle up after." />
        ),
        { ...OG_SIZE, fonts, headers: { 'Cache-Control': OG_CACHE_CONTROL } }
    )
}
