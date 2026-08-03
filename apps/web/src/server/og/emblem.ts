import { DOODLE } from '@/components/ui/doodles'

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
 * a device-specific colour glyph. The card builders resolve which drawing a room
 * gets (`roomEmblemDoodle`); this only draws the one they picked.
 *
 * `encodeURIComponent` rather than base64 because satori parses the URI either way and the
 * percent-encoded form stays greppable when a card renders wrong.
 *
 * The defaults are the unfurl's, so every existing call site is unchanged. They are overridable
 * for avatars, which carry reviewed ink plus an optional white under-stroke;
 * drawn in flat black at the heavy unfurl weight all thirty-six come out as the
 * same silhouette — which is exactly what the persona lineup exists to avoid.
 */
export function doodleDataUri(
    name: keyof typeof DOODLE,
    options?: { ink?: string; weight?: number; outline?: { ink: string; weight: number } }
): string {
    const outline = options?.outline
        ? `<path d="${DOODLE[name]}" fill="none" stroke="${options.outline.ink}" ` +
          `stroke-width="${options.outline.weight}" stroke-linecap="round" stroke-linejoin="round"/>`
        : ''
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
        outline +
        `<path d="${DOODLE[name]}" fill="none" stroke="${options?.ink ?? OG_INK}" ` +
        `stroke-width="${options?.weight ?? OG_WEIGHT}" ` +
        `stroke-linecap="round" stroke-linejoin="round"/></svg>`
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
