/**
 * Landing unfurl. No per-request data, so Next bakes this at build time and the
 * runtime cost is zero — keep it that way (nothing dynamic, no database).
 */
import { ImageResponse } from 'next/og'
import { BrandCard, OG_CONTENT_TYPE, OG_SIZE } from '@/server/og/card'
import { ogFonts } from '@/server/og/fonts'

export const runtime = 'nodejs'

export const alt = 'Peanut Split — split expenses, no signup'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

// Deliberately not `marketingCopy.hero.subtitle`: that line is written for a
// screen with room to breathe, and reads as a wall at unfurl scale.
const TAGLINE = 'Share one link. Everyone adds what they paid.'

export default async function LandingOgImage() {
    return new ImageResponse(<BrandCard lines={['SPLIT', 'ANYTHING']} tagline={TAGLINE} />, {
        ...OG_SIZE,
        fonts: await ogFonts(),
    })
}
