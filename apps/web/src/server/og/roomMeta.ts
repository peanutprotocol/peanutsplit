/**
 * `<head>` copy for a room link.
 *
 * The room emblem is deliberately absent from text metadata. Doodles are
 * rendered in the card itself; falling back to a platform emoji in the title
 * would reintroduce a second icon system on tabs and chat previews.
 */
import type { Metadata } from 'next'
import { getTranslator } from '@/i18n/t'
import { prisma } from '@/server/db'

/** Chat previews truncate hard; keep the room name inside the visible run. */
const MAX_TITLE_NAME = 48

/**
 * The English literals, still exported and still the fallback.
 *
 * They are what an unknown slug gets — there is no room, so there is no language
 * to have — and what `getTranslator` resolves to when a catalog is missing a key.
 */
export const ROOM_DESCRIPTION = 'Join the split — see who owes what and add what you paid.'
export const ROOM_FALLBACK_TITLE = 'Split room — Peanut Split'
export const ROOM_FALLBACK_DESCRIPTION = 'Split expenses with one link. No signup, no app, free to use.'

/**
 * The room's description, in the language the room was started in.
 *
 * The TITLE is not translated and does not need to be: it is the room's own name
 * plus the brand, and a group's name for their trip is already in their language.
 * The description is the sentence Split says on their behalf, which is the part
 * that was always English at somebody who does not read it.
 *
 * Unlike the OG image, this is HTML — no glyph budget, no sanitizing. The image
 * has to pick Knerd or the Cyrillic-capable Roboto face explicitly, which is why
 * `roomCard.ts` handles that end.
 */
const roomDescription = async (locale: string | null): Promise<string> =>
    (await getTranslator(locale ?? 'en'))('preview.roomDescription')

export const RECAP_DESCRIPTION = 'What this split added up to — days, expenses, people, and who fronted the most.'
export const RECAP_FALLBACK_TITLE = 'Trip recap — Peanut Split'

/** "Ski trip — Peanut Split". Exported for tests; no I/O. */
export function roomTitle(name: string, _emblem: string | null): string {
    const trimmed = name.replace(/\s+/g, ' ').trim()
    const clipped = trimmed.length > MAX_TITLE_NAME ? `${trimmed.slice(0, MAX_TITLE_NAME).trimEnd()}…` : trimmed
    return clipped ? `${clipped} — Peanut Split` : ROOM_FALLBACK_TITLE
}

/** "Ski trip recap — Peanut Split". Exported for tests; no I/O. */
export function recapTitle(name: string, _emblem: string | null): string {
    const trimmed = name.replace(/\s+/g, ' ').trim()
    const clipped = trimmed.length > MAX_TITLE_NAME ? `${trimmed.slice(0, MAX_TITLE_NAME).trimEnd()}…` : trimmed
    return clipped ? `${clipped} recap — Peanut Split` : RECAP_FALLBACK_TITLE
}

/**
 * The slug is the credential, so `noindex` is non-negotiable — but the social
 * crawlers named in the robots policy still need real title/description to build
 * the unfurl, which is why they are set explicitly rather than left to inherit.
 *
 * `images` is deliberately absent and has to stay absent. The card is the sibling
 * `opengraph-image.tsx`, and Next injects that tag itself under a URL only Next
 * knows: the route group earns the route a build-scoped hash suffix, and the tag
 * can carry a cache-busting query on top. Naming the image here replaced that
 * with `/r/<slug>/opengraph-image`, which is not a route Next serves — every
 * shared room unfurled imageless off a 404 until this was removed. `seo.ts`
 * refuses to name it in structured data for the same reason.
 */
export async function roomMetadata(slug: string): Promise<Metadata> {
    const room = await prisma.room
        .findUnique({ where: { slug }, select: { name: true, emoji: true, locale: true } })
        .catch(() => null)

    const title = room ? roomTitle(room.name, room.emoji) : ROOM_FALLBACK_TITLE
    const description = room ? await roomDescription(room.locale) : ROOM_FALLBACK_DESCRIPTION

    return {
        title,
        description,
        robots: { index: false, follow: false },
        openGraph: { type: 'website', title, description },
        twitter: { card: 'summary_large_image', title, description },
    }
}

/**
 * The recap screen's head.
 *
 * `noindex` for the same reason as the room, only harder: the recap lives at
 * `/r/<slug>/recap`, so its URL *contains the room credential*. It is a members'
 * screen — the thing people actually share is the image the screen hands them,
 * which carries no slug. See the route's own note.
 *
 * DELIBERATELY STILL ENGLISH, unlike the room above, and the reason is who reads
 * it. The room unfurl is a stranger's only look at the product before they decide
 * to tap; the recap is reached from inside a room by somebody already using it,
 * and what actually gets shared out of it is an image file rather than this link.
 * The shared recap image is localized from the room's stored locale. Keeping this
 * private page metadata in English is a scope choice, not a font limitation.
 */
export async function recapMetadata(slug: string): Promise<Metadata> {
    const room = await prisma.room
        .findUnique({ where: { slug }, select: { name: true, emoji: true } })
        .catch(() => null)

    const title = room ? recapTitle(room.name, room.emoji) : RECAP_FALLBACK_TITLE
    const description = room ? RECAP_DESCRIPTION : ROOM_FALLBACK_DESCRIPTION

    return {
        title,
        description,
        robots: { index: false, follow: false },
        openGraph: { type: 'website', title, description },
        twitter: { card: 'summary_large_image', title, description },
    }
}
