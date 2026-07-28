import type { Metadata } from 'next'
import { Hero } from '@/components/marketing/Hero'
import { HonestyStrip } from '@/components/marketing/HonestyStrip'
import { HowItWorks } from '@/components/marketing/HowItWorks'
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
    alternates: { canonical: '/' },
    openGraph: {
        type: 'website',
        url: '/',
        title: 'Peanut Split — split expenses, no signup',
        description: heroSubtitle,
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Peanut Split — split expenses, no signup',
        description: heroSubtitle,
    },
}

export default function LandingPage() {
    return (
        <main className="flex min-h-dvh flex-col gap-10 bg-background">
            <Hero />
            <YourRooms />
            <HowItWorks />
            <HonestyStrip />
            <SiteFooter />
        </main>
    )
}
