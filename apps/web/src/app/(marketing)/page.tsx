import type { Metadata } from 'next'
import { Hero } from '@/components/marketing/Hero'
import { HonestyStrip } from '@/components/marketing/HonestyStrip'
import { HowItWorks } from '@/components/marketing/HowItWorks'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { YourRooms } from '@/components/marketing/YourRooms'
import { marketingCopy } from '@/components/marketing/copy'

export const metadata: Metadata = {
    alternates: { canonical: '/' },
    openGraph: {
        type: 'website',
        url: '/',
        title: 'Peanut Split — split expenses, no signup',
        description: marketingCopy.hero.subtitle,
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Peanut Split — split expenses, no signup',
        description: marketingCopy.hero.subtitle,
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
