/**
 * Room emoji → an inline image, because satori cannot draw one.
 *
 * The shipped fonts are Latin display faces with no emoji coverage, and adding a
 * colour-emoji font would be megabytes for one glyph. Twemoji's per-codepoint
 * SVGs are ~2KB and inline as a data URI, so the emoji is resolved BEFORE the
 * ImageResponse is constructed: a failure here becomes a designed fallback disc
 * instead of a mid-stream 500 that the unfurl cache would then remember.
 */
const TWEMOJI_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg'
const FETCH_TIMEOUT_MS = 2500
/** A twemoji glyph is ~2KB; anything near this is not one. */
const MAX_BYTES = 96 * 1024

const PICTOGRAPHIC = /\p{Extended_Pictographic}/u

/** True when the stored `emoji` really is one — the column accepts any string. */
export const isEmoji = (value: string | null | undefined): boolean => !!value && PICTOGRAPHIC.test(value)

/**
 * Twemoji filenames are the codepoints in lowercase hex joined by `-`, with the
 * VS16 presentation selector dropped (so `U+2708 U+FE0F` is `2708.svg`). ZWJ
 * sequences keep their `200d` joiners.
 */
export function twemojiSlug(emoji: string | null | undefined): string | null {
    if (!emoji || !PICTOGRAPHIC.test(emoji)) return null
    const points = [...emoji].map((ch) => ch.codePointAt(0) ?? 0).filter((cp) => cp !== 0xfe0f && cp !== 0xfe0e)
    if (points.length === 0) return null
    return points.map((cp) => cp.toString(16)).join('-')
}

/** Never throws, never blocks longer than the timeout, never caches. */
export async function emojiDataUri(emoji: string | null | undefined): Promise<string | null> {
    const slug = twemojiSlug(emoji)
    if (!slug) return null
    try {
        const res = await fetch(`${TWEMOJI_BASE}/${slug}.svg`, {
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            cache: 'no-store',
        })
        if (!res.ok) return null
        const bytes = new Uint8Array(await res.arrayBuffer())
        if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return null
        return `data:image/svg+xml;base64,${Buffer.from(bytes).toString('base64')}`
    } catch {
        return null
    }
}
