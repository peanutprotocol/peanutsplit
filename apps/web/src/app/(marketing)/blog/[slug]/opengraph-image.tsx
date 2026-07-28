import { ImageResponse } from 'next/og'
import { BrandCard, OG_CONTENT_TYPE, OG_SIZE } from '@/server/og/card'
import { ogFonts } from '@/server/og/fonts'
import { getDoc, listSlugs } from '@/lib/content'

/**
 * Unfurl for a guide. Without this the card falls back to nothing — an article shared into a
 * group chat is the whole distribution mechanism, and a linkless grey box is a share that does
 * not get clicked.
 *
 * The title goes in the tagline slot rather than the display lines: BrandCard's two lines are
 * Knerd at 108px, sized for "SPLIT ANYTHING", and an article title would overflow them.
 */
export const runtime = 'nodejs'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE
export const alt = 'Peanut Split guide'

export function generateStaticParams() {
    return listSlugs('blog').map((slug) => ({ slug }))
}

export default async function BlogOgImage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params
    const doc = getDoc('blog', slug)

    return new ImageResponse(
        <BrandCard lines={['SPLIT', 'GUIDES']} tagline={doc?.frontmatter.title ?? 'Peanut Split'} />,
        { ...OG_SIZE, fonts: await ogFonts() }
    )
}
