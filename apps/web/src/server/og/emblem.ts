import { DOODLE } from '@/components/ui/doodles'
import { emblemDoodle } from '@/lib/room-emblem'
import { FALLBACK_DOODLE } from '@/lib/room-doodle'

/** Ink for the unfurl. The card's own art sits on a coloured field, and the drawing has to read
 *  on all of them, so it always uses warm dark ink rather than the theme's accent. */
const OG_INK = '#211C17'
/** Heavier than the app's default: the card is downscaled hard by every chat client that
 *  previews it, and a 2-unit line disappears in a WhatsApp thumbnail. */
const OG_WEIGHT = 2.6

/**
 * A doodle as a standalone SVG data URI, built here rather than fetched.
 *
 * This keeps every unfurl in the same drawn system without a network lookup or
 * a device-specific colour glyph. Known legacy emoji keep their original
 * meaning; unknown legacy values use the peanut drawing.
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
 * Kept async to preserve the route call sites. Resolution is local and cannot
 * fail: no Twemoji CDN, no timeout, no non-doodle fallback.
 */
export async function emblemDataUri(value: string | null | undefined): Promise<string> {
    return doodleDataUri(emblemDoodle(value) ?? FALLBACK_DOODLE)
}
