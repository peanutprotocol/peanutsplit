/**
 * Room slugs. The slug IS the credential, so the random tail must be
 * crypto-random and unambiguous when read aloud or typed from a screenshot.
 */
import { randomBytes } from 'node:crypto'
import { kebab, slugStem } from '@/lib/slugify'

/** Crockford base32, lowercase — no i, l, o, u. 32 symbols, so a byte maps
 *  uniformly with a mask (no modulo bias). */
const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'
const TAIL_LENGTH = 6
/** Re-exported so `@/server/slug` stays the one import path for slug parts. The
 *  implementation lives in `@/lib/slugify` because the landing hero previews the stem as you
 *  type and a client component cannot import `node:crypto`. */
export { kebab }

export function randomTail(length = TAIL_LENGTH): string {
    const bytes = randomBytes(length)
    let out = ''
    for (const byte of bytes) out += ALPHABET[byte & 31]
    return out
}

/** e.g. "Ski trip 🎿" → "ski-trip-x7k2m9". Names that kebab to nothing (emoji-only,
 *  non-latin scripts) fall back to "room" so the slug always reads as a link. */
export function roomSlug(name: string): string {
    const stem = slugStem(name)
    return `${stem}-${randomTail()}`
}

/** Token handed to a member once and stored client-side; attribution only. */
export const memberToken = (): string => randomBytes(24).toString('base64url')
