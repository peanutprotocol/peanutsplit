import { ImageResponse } from 'next/og'
import { comparisonCopy } from '@/components/marketing/compare-copy'
import { BrandCard, OG_CONTENT_TYPE, OG_SIZE } from '@/server/og/card'
import { ogFonts } from '@/server/og/fonts'

const copy = comparisonCopy['es-419']!

export const runtime = 'nodejs'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE
export const alt = copy.meta.title

export default async function CompareOgImage() {
    return new ImageResponse(<BrandCard lines={['SPLIT', 'IT']} tagline={copy.hero.title} />, {
        ...OG_SIZE,
        fonts: await ogFonts(),
    })
}
