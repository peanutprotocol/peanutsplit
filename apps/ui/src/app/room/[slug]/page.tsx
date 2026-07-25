import type { Metadata } from 'next'
import { RoomView } from '@/components/Split/RoomView'
import { SPLIT_API_URL } from '@/constants/split.consts'

/**
 * The room title becomes the link's title in the group chat it gets pasted
 * into. Nothing beyond the title is put here — amounts, member names and
 * balances stay behind the link, because a preview is rendered by chat apps and
 * anyone the link is forwarded to.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
	const { slug } = await params
	let title: string | null = null
	try {
		const res = await fetch(`${SPLIT_API_URL}/split/rooms/${slug}`, { cache: 'no-store' })
		if (res.ok) title = (await res.json()).title
	} catch {
		// A dead API shouldn't break the unfurl — fall back to the generic title.
	}
	return {
		title: title ? `${title} · Peanut Split` : 'Split room · Peanut Split',
		description: 'Add what you paid, see who owes who, settle up. No sign-up.',
		openGraph: {
			title: title ?? 'Someone shared a tab with you',
			description: 'Add what you paid, see who owes who, settle up. No sign-up.',
		},
	}
}

export default async function RoomPage({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params
	return <RoomView slug={slug} />
}
