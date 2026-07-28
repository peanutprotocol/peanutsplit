import { DOODLE } from '@/components/ui/doodles'
import { emblemDoodle } from '@/lib/room-emblem'
import { emojiDataUri } from './emoji'

/** Ink for the unfurl. The card's own art sits on a coloured field, and the drawing has to read
 *  on all of them, so it is always black rather than the theme's accent. */
const OG_INK = '#000000'
/** Heavier than the app's default: the card is downscaled hard by every chat client that
 *  previews it, and a 2-unit line disappears in a WhatsApp thumbnail. */
const OG_WEIGHT = 2.6

/**
 * A doodle as a standalone SVG data URI, built here rather than fetched.
 *
 * This is why drawn emblems are strictly better than emoji ones on this surface. The emoji path
 * (`emoji.ts`) has to reach cdnjs for a Twemoji glyph, and THE PRODUCTION CONTAINERS HAVE NO
 * EGRESS — that fetch cannot succeed in prod, so every emoji room already unfurls with the
 * designed fallback disc rather than its emoji. A doodle needs no network at all: the path data
 * is in the bundle, and this assembles it into ~700 bytes of SVG.
 *
 * `encodeURIComponent` rather than base64 because satori parses the URI either way and the
 * percent-encoded form stays greppable when a card renders wrong.
 */
export function doodleDataUri(name: keyof typeof DOODLE): string {
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
        `<path d="${DOODLE[name]}" fill="none" stroke="${OG_INK}" stroke-width="${OG_WEIGHT}" ` +
        `stroke-linecap="round" stroke-linejoin="round"/></svg>`
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

/**
 * The room's emblem as something satori can draw, whichever kind it is.
 *
 * Async only because the emoji branch is. A doodle resolves synchronously and can never fail,
 * which is the point: the common case for every room made from now on costs no network, no
 * timeout, and no fallback.
 */
export async function emblemDataUri(value: string | null | undefined): Promise<string | null> {
    const doodle = emblemDoodle(value)
    if (doodle) return doodleDataUri(doodle)
    return emojiDataUri(value)
}
