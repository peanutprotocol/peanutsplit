import { ImageResponse } from 'next/og'
import { BrandCard, OG_CONTENT_TYPE, OG_SIZE } from '@/server/og/card'
import { ogFonts } from '@/server/og/fonts'
import { getDoc, listSlugs } from '@/lib/content'

/** Unfurl for a comparison page. Same reasoning as the guide card — see blog/[slug]. */
export const runtime = 'nodejs'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE
export const alt = 'Peanut Split'

export function generateStaticParams() {
    return listSlugs('alternatives').map((slug) => ({ alternative: slug }))
}

export default async function AlternativeOgImage({ params }: { params: Promise<{ alternative: string }> }) {
    const { alternative } = await params
    const doc = getDoc('alternatives', alternative)

    return new ImageResponse(<BrandCard lines={['SPLIT', 'IT']} tagline={doc?.frontmatter.title ?? 'Peanut Split'} />, {
        ...OG_SIZE,
        fonts: await ogFonts(),
    })
}
