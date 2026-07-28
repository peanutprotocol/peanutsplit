import { ImageResponse } from 'next/og'
import { BrandCard, OG_CONTENT_TYPE, OG_SIZE } from '@/server/og/card'
import { ogFonts } from '@/server/og/fonts'
import { marketingCopy } from '@/components/marketing/copy'

/**
 * Unfurl for the highest-intent page on the site, which was sharing as a blank card. Uses the
 * page's own hero title so the card and the page cannot drift apart.
 */
export const runtime = 'nodejs'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE
export const alt = marketingCopy.compare.meta.title

export default async function CompareOgImage() {
    return new ImageResponse(<BrandCard lines={['SPLIT', 'IT']} tagline={marketingCopy.compare.hero.title} />, {
        ...OG_SIZE,
        fonts: await ogFonts(),
    })
}
