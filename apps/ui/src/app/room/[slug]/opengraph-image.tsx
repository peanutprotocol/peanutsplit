/**
 * The link preview for a room.
 *
 * This is the single most important image in the product: to use Split at all
 * you have to paste the room link into a group chat, so this is what 3-8 people
 * who have never heard of Peanut actually see. It renders server-side per room
 * via next/og — no image service, no stored asset, no external request.
 *
 * The room title is public-by-link, same as the room itself. Nothing else about
 * the room is exposed here: no member names, no amounts, no balances. A link
 * preview gets rendered by chat apps, crawlers and anyone the link is forwarded
 * to, so it must not reveal more than the person sharing it intends.
 */

import { ImageResponse } from 'next/og'
import { roomArt } from '@/utils/room-art'
import { SPLIT_API_URL } from '@/constants/split.consts'

export const alt = 'A Peanut Split room'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params

	// Best-effort: a preview must render even when the API is down or the room
	// is gone, so a failure here falls back to the generic art rather than
	// breaking the unfurl.
	let title: string | null = null
	let memberCount = 0
	try {
		const res = await fetch(`${SPLIT_API_URL}/split/rooms/${slug}`, { cache: 'no-store' })
		if (res.ok) {
			const room = await res.json()
			title = room.title
			memberCount = room.members?.length ?? 0
		}
	} catch {
		// fall through to the generic art
	}

	const art = roomArt(title)
	const heading = title || 'A shared tab'

	return new ImageResponse(
		<div
			style={{
				width: '100%',
				height: '100%',
				display: 'flex',
				flexDirection: 'column',
				justifyContent: 'space-between',
				padding: 72,
				background: `linear-gradient(135deg, ${art.palette.from} 0%, ${art.palette.to} 100%)`,
				fontFamily: 'sans-serif',
				position: 'relative',
			}}
		>
			{/* Motif repeated faintly across the canvas, positioned from the
				    room-name hash so two rooms never look identical. */}
			{art.scatter.map((s, i) => (
				<div
					key={i}
					style={{
						position: 'absolute',
						left: `${8 + s * 84}%`,
						top: `${6 + ((i * 37 + s * 100) % 80)}%`,
						fontSize: 90 + (i % 3) * 40,
						opacity: 0.12,
						display: 'flex',
					}}
				>
					{art.motif}
				</div>
			))}

			<div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
				<div style={{ fontSize: 40, display: 'flex' }}>🥜</div>
				<div
					style={{
						fontSize: 30,
						fontWeight: 800,
						letterSpacing: 2,
						textTransform: 'uppercase',
						color: art.palette.ink,
						opacity: 0.75,
						display: 'flex',
					}}
				>
					Peanut Split
				</div>
			</div>

			<div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
				<div style={{ fontSize: 110, display: 'flex' }}>{art.motif}</div>
				<div
					style={{
						fontSize: heading.length > 28 ? 68 : 92,
						fontWeight: 900,
						color: art.palette.ink,
						lineHeight: 1.05,
						display: 'flex',
					}}
				>
					{heading}
				</div>
			</div>

			<div
				style={{
					fontSize: 34,
					fontWeight: 700,
					color: art.palette.ink,
					opacity: 0.8,
					display: 'flex',
				}}
			>
				{memberCount > 0
					? `${memberCount} ${memberCount === 1 ? 'person' : 'people'} splitting · tap to join`
					: 'Split the bill · no sign-up'}
			</div>
		</div>,
		size
	)
}
