import type { Metadata } from 'next'
import { FinalCta } from '@/components/marketing/FinalCta'
import { Hero } from '@/components/marketing/Hero'
import { LandingProof } from '@/components/marketing/LandingProof'
import { ReadMore } from '@/components/marketing/ReadMore'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { YourRooms } from '@/components/marketing/YourRooms'
import enMessages from '@/i18n/messages/en.json'

/**
 * Head copy stays English in every locale, on purpose. The title and description are what is
 * indexed and what the OG image (also English — its fonts have no accented glyphs) already
 * says; serving a translated `og:description` beside an English card is worse than serving one
 * language consistently. Read from the English catalog rather than re-typed, so the page and
 * its own unfurl cannot drift apart.
 */
const heroSubtitle = enMessages.marketing.hero.subtitle

export const metadata: Metadata = {
    title: 'Peanut Split — pass the link, not the spreadsheet',
    description: heroSubtitle,
    alternates: { canonical: '/' },
    openGraph: {
        type: 'website',
        url: '/',
        title: 'Peanut Split — pass the link, not the spreadsheet',
        description: heroSubtitle,
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Peanut Split — pass the link, not the spreadsheet',
        description: heroSubtitle,
    },
}

export default function LandingPage() {
    return (
        <main className="flex min-h-dvh flex-col bg-background">
            <Hero />
            <YourRooms />
            <LandingProof />
            <ReadMore />
            <FinalCta />
            <SiteFooter />
        </main>
    )
}
