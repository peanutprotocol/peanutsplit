/**
 * `<head>` copy for a room link.
 *
 * Unlike the OG image this is HTML, so nothing needs font sanitizing — a Cyrillic
 * or emoji room name renders fine in a tab title and in every chat preview.
 * The image is where the glyph budget bites; see `roomCard.ts`.
 */
import type { Metadata } from 'next'
import { prisma } from '@/server/db'
import { isEmoji } from '@/server/og/emoji'

/** Chat previews truncate hard; keep the room name inside the visible run. */
const MAX_TITLE_NAME = 48

export const ROOM_DESCRIPTION = 'Join the split — see who owes what and add what you paid.'
export const ROOM_FALLBACK_TITLE = 'Split room — Peanut Split'
export const ROOM_FALLBACK_DESCRIPTION = 'Split expenses with one link. No signup, no app, free forever.'

/** "🎿 Ski trip — Peanut Split". Exported for tests; no I/O. */
export function roomTitle(name: string, emoji: string | null): string {
    const trimmed = name.replace(/\s+/g, ' ').trim()
    const clipped = trimmed.length > MAX_TITLE_NAME ? `${trimmed.slice(0, MAX_TITLE_NAME).trimEnd()}…` : trimmed
    const prefix = isEmoji(emoji) ? `${emoji} ` : ''
    return clipped ? `${prefix}${clipped} — Peanut Split` : ROOM_FALLBACK_TITLE
}

/**
 * The slug is the credential, so `noindex` is non-negotiable — but the social
 * crawlers named in the robots policy still need real title/description to build
 * the unfurl, which is why they are set explicitly rather than left to inherit.
 */
export async function roomMetadata(slug: string): Promise<Metadata> {
    const room = await prisma.room
        .findUnique({ where: { slug }, select: { name: true, emoji: true } })
        .catch(() => null)

    const title = room ? roomTitle(room.name, room.emoji) : ROOM_FALLBACK_TITLE
    const description = room ? ROOM_DESCRIPTION : ROOM_FALLBACK_DESCRIPTION

    return {
        title,
        description,
        robots: { index: false, follow: false },
        openGraph: { type: 'website', title, description },
        twitter: { card: 'summary_large_image', title, description },
    }
}
