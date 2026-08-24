import type { Metadata } from 'next'
import { GoogleAdsTag } from '@/components/analytics/GoogleAdsTag'
import { CreateRoomForm } from '@/components/room/CreateRoomForm'
import { readPrefill } from '@/lib/room-prefill'
import type { Query } from '@/lib/utm'

export const metadata: Metadata = {
    title: 'New split — Peanut Split',
    description: 'Create a room, add who’s in, and share when you are ready. No signup.',
    alternates: { canonical: '/new' },
    // A bare form with nothing to rank for, and it was indexable while sitemap.ts deliberately
    // left it out — the page's own directive should match that intent rather than contradict it.
    robots: { index: false, follow: true },
}

/**
 * The query string is where a template link puts what it has already decided — see
 * `room-prefill.ts`. Read on the server so the form's first paint already carries it: seeding
 * from a client hook would render the empty composer and then rewrite it, and the field that
 * matters is autofocused.
 */
export default async function NewRoomPage({ searchParams }: { searchParams: Promise<Query> }) {
    return (
        <>
            <main className="mx-auto min-h-dvh w-full max-w-xl bg-background">
                <CreateRoomForm prefill={readPrefill(await searchParams)} />
            </main>
            {/* The other page a room is created from. It is noindex and no ad points at it, but
                the conversion fires here, and gtag has to be loaded to receive it. */}
            <GoogleAdsTag />
        </>
    )
}
