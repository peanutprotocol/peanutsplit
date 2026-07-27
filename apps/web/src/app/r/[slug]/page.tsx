import type { Metadata } from 'next'
import { RoomScreen } from '@/components/room/RoomScreen'
import { roomMetadata } from '@/server/og/roomMeta'

/** The slug is the credential — a room must never end up in an index. The unfurl
 *  copy still has to be real, though: the invite link IS the product surface. */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
    const { slug } = await params
    return roomMetadata(slug)
}

// The room is live state behind a secret slug; nothing about it is worth
// prerendering, and `useQueryStates` needs the request-time search params.
export const dynamic = 'force-dynamic'

export default async function RoomPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params
    return <RoomScreen slug={slug} />
}
