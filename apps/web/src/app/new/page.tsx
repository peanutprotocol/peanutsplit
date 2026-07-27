import type { Metadata } from 'next'
import { CreateRoomForm } from '@/components/room/CreateRoomForm'

export const metadata: Metadata = {
    title: 'New split — Peanut Split',
    description: 'Create a room, share the link, split anything. No signup.',
    alternates: { canonical: '/new' },
}

export default function NewRoomPage() {
    return (
        <main className="mx-auto min-h-dvh w-full max-w-xl bg-background">
            <CreateRoomForm />
        </main>
    )
}
