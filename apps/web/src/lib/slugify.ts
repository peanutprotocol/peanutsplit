/**
 * The readable half of a room slug, shared by the server that mints it and the landing hero
 * that previews it as you type.
 *
 * It lives here rather than in `server/slug.ts` because that module imports `node:crypto` for
 * the random tail, and the hero is a client component. There must be exactly one
 * implementation: the preview promises a URL, and the next screen has to deliver that URL.
 */

const MAX_NAME_CHARS = 40

/** Diacritic-stripped, lowercase, dash-separated. Empty-safe. */
export function kebab(name: string): string {
    const ascii = name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    return ascii.slice(0, MAX_NAME_CHARS).replace(/-+$/g, '')
}

/** What the server will use as the stem. Names that kebab to nothing — emoji only, or a
 *  script with no latin transliteration — fall back to "room", so the slug still reads as a
 *  link rather than as a bare tail. */
export const slugStem = (name: string): string => kebab(name) || 'room'

/**
 * The shape the tail will take, for previews that must show one before it exists.
 *
 * Three dash-separated runs because the tail is three words now, not six base32
 * characters — a preview that shows one run teaches the wrong shape, and the
 * whole point of the word tail is that it is legible before you can read it.
 *
 * THREE dots per run, not the average word length. The hero line is a shrinking
 * flex item with an ellipsis, and it does not wrap: measured against a
 * production build at 375px, four-and-five-dot runs overflow and the ellipsis
 * eats the third run — which loses the one thing the hint exists to show. Three
 * is also the shortest real word in `slugWords.ts`, so it understates the tail
 * rather than inventing one. Do not grow it without re-measuring.
 *
 * One constant with three consumers: the hero, the pass-the-link stage, and the
 * proof rail all promise the same URL and must not drift apart.
 */
export const SLUG_TAIL_HINT = '-•••-•••-•••'
