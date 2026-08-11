import type { Metadata } from 'next'
import { ExistingRoomImportScreen } from '@/components/import/ExistingRoomImportScreen'

/** Room slugs are credentials. This nested utility is useful only to someone who already has one. */
export const metadata: Metadata = {
    title: 'Import into a room — Peanut Split',
    robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function ExistingRoomImportPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params
    return <ExistingRoomImportScreen slug={slug} />
}
