import { ImageResponse } from 'next/og'
import { BrandCard, OG_CONTENT_TYPE, OG_SIZE } from '@/server/og/card'
import { ogFonts } from '@/server/og/fonts'

/**
 * Unfurl for the tools hub. It was sharing as a blank card — `pageMetadata()` declares
 * `summary_large_image` for every page, and this was the one page type shipping no image behind
 * that promise. The tagline restates the page's meta title; `page.tsx` keeps its copy local, so
 * the string is repeated here rather than imported.
 */
export const runtime = 'nodejs'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE
export const alt = 'Calculators for splitting a cost fairly'

export default async function ToolsHubOgImage() {
    return new ImageResponse(<BrandCard lines={['SPLIT', 'IT']} tagline="Calculators for splitting a cost fairly" />, {
        ...OG_SIZE,
        fonts: await ogFonts(),
    })
}
