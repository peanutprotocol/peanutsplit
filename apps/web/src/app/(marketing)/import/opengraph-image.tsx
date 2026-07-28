import { ImageResponse } from 'next/og'
import { notFound } from 'next/navigation'
import { BrandCard, OG_CONTENT_TYPE, OG_SIZE } from '@/server/og/card'
import { ogFonts } from '@/server/og/fonts'
import { marketingCopy } from '@/components/marketing/copy'
import { splitV2Enabled } from '@/lib/flags'

/**
 * Unfurl for the importer. It was sharing as a blank card: the `(marketing)` group's landing
 * image is NOT inherited by a nested segment, so a page without its own file simply has no
 * `og:image` — which is what `/import` shipped with despite being a sitemap-priority-0.8 page
 * and the one someone pastes into a group chat to say "we're moving off Splitwise".
 *
 * Uses the page's own hero title so the card and the page cannot drift apart, exactly like
 * `/splitwise-alternative`.
 */
export const runtime = 'nodejs'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE
export const alt = marketingCopy.importPage.meta.title

export default async function ImportOgImage() {
    if (!splitV2Enabled()) notFound()
    return new ImageResponse(<BrandCard lines={['SPLIT', 'IT']} tagline={marketingCopy.importPage.hero.title} />, {
        ...OG_SIZE,
        fonts: await ogFonts(),
    })
}
