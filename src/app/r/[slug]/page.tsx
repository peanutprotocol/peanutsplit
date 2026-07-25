import type { Metadata } from 'next'
import { RoomScreen } from '@/components/room/RoomScreen'

/** The slug is the credential — a room must never end up in an index. */
export const metadata: Metadata = {
    title: 'Split room — Peanut Split',
    robots: { index: false, follow: false },
}

// The room is live state behind a secret slug; nothing about it is worth
// prerendering, and `useQueryStates` needs the request-time search params.
export const dynamic = 'force-dynamic'

export default async function RoomPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params
    return <RoomScreen slug={slug} />
}
