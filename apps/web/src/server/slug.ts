/**
 * Room slugs. The slug IS the credential, so the random tail must be
 * crypto-random and unambiguous when read aloud or typed from a screenshot.
 */
import { randomBytes } from 'node:crypto'

/** Crockford base32, lowercase — no i, l, o, u. 32 symbols, so a byte maps
 *  uniformly with a mask (no modulo bias). */
const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'
const TAIL_LENGTH = 6
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

export function randomTail(length = TAIL_LENGTH): string {
    const bytes = randomBytes(length)
    let out = ''
    for (const byte of bytes) out += ALPHABET[byte & 31]
    return out
}

/** e.g. "Ski trip 🎿" → "ski-trip-x7k2m9". Names that kebab to nothing (emoji-only,
 *  non-latin scripts) fall back to "room" so the slug always reads as a link. */
export function roomSlug(name: string): string {
    const stem = kebab(name) || 'room'
    return `${stem}-${randomTail()}`
}

/** Token handed to a member once and stored client-side; attribution only. */
export const memberToken = (): string => randomBytes(24).toString('base64url')
