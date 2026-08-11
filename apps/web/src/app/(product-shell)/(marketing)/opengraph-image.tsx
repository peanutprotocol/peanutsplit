/**
 * Landing unfurl. No per-request data, so Next bakes this at build time and the
 * runtime cost is zero — keep it that way (nothing dynamic, no database).
 */
import { ImageResponse } from 'next/og'
import { BrandCard, OG_CONTENT_TYPE, OG_SIZE } from '@/server/og/card'
import { ogFonts } from '@/server/og/fonts'

export const runtime = 'nodejs'

export const alt = 'Peanut Split — pass the link, not the spreadsheet'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

// Deliberately not the catalog's `marketing.hero.subtitle`: that line is written
// for a screen with room to breathe, and reads as a wall at unfurl scale. English
// in every locale, like the rest of the OG surface — these fonts are subset and
// have no accented glyphs to render a translation with.
const TAGLINE = 'Not the spreadsheet. Everyone adds.'

export default async function LandingOgImage() {
    return new ImageResponse(<BrandCard lines={['PASS THE', 'LINK']} tagline={TAGLINE} />, {
        ...OG_SIZE,
        fonts: await ogFonts(),
    })
}
