import { ImageResponse } from 'next/og'
import { BrandCard, OG_CONTENT_TYPE, OG_SIZE } from '@/server/og/card'
import { ogFonts } from '@/server/og/fonts'

/**
 * Unfurl for the guides hub. The per-article card in `[slug]/` overrides this for the articles
 * themselves — this one only ever renders for /blog.
 */
export const runtime = 'nodejs'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE
export const alt = 'Peanut Split guides'

export default async function BlogHubOgImage() {
    return new ImageResponse(
        <BrandCard lines={['SPLIT', 'GUIDES']} tagline="Splitting expenses without an account or an app." />,
        { ...OG_SIZE, fonts: await ogFonts() }
    )
}
