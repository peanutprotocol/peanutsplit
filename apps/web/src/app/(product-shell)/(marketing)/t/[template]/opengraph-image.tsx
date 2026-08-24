/**
 * The unfurl for a template link: the room it opens, drawn the way the room itself unfurls.
 *
 * `RoomCard` with an empty roster and no expenses is not a placeholder — it is exactly what the
 * room looks like the second after somebody taps, which is the promise the page is making.
 */
import { ImageResponse } from 'next/og'
import { notFound } from 'next/navigation'
import { OG_CACHE_CONTROL, OG_CONTENT_TYPE, OG_SIZE, RoomCard } from '@/server/og/card'
import { emblemDataUri } from '@/server/og/emblem'
import { ogFonts } from '@/server/og/fonts'
import { toRoomCard } from '@/server/og/roomCard'
import { templateStaticParams } from '@/lib/template-routes'
import { getTemplate } from '@/templates/registry'

// `fs` for the fonts: this cannot run on the edge.
export const runtime = 'nodejs'

export const alt = 'The room this link opens'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export const generateStaticParams = templateStaticParams

export default async function TemplateOgImage({ params }: { params: Promise<{ template: string }> }) {
    const template = getTemplate((await params).template)
    if (!template) notFound()

    const card = toRoomCard({
        name: template.room.name,
        emoji: template.room.emblem,
        // No expenses, so the stat line never reaches a currency. The room's own is still passed
        // rather than a literal, so this stays right if the card ever prints one.
        currency: template.room.currency ?? 'EUR',
        theme: null,
        members: [],
        expenses: [],
    })

    return new ImageResponse(<RoomCard card={card} emojiSrc={emblemDataUri(card.emblem)} />, {
        ...OG_SIZE,
        fonts: await ogFonts(),
        headers: { 'Cache-Control': OG_CACHE_CONTROL },
    })
}
