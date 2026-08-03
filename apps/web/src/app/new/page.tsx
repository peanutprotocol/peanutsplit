import type { Metadata } from 'next'
import { CreateRoomForm } from '@/components/room/CreateRoomForm'

export const metadata: Metadata = {
    title: 'New split — Peanut Split',
    description: 'Create a room, add who’s in, and share when you are ready. No signup.',
    alternates: { canonical: '/new' },
    // A bare form with nothing to rank for, and it was indexable while sitemap.ts deliberately
    // left it out — the page's own directive should match that intent rather than contradict it.
    robots: { index: false, follow: true },
}

export default function NewRoomPage() {
    return (
        <main className="mx-auto min-h-dvh w-full max-w-xl bg-background">
            <CreateRoomForm />
        </main>
    )
}
