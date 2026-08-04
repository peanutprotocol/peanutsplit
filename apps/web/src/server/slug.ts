/**
 * Room slugs. The slug IS the credential, so its tail must carry enough
 * cryptographic entropy to protect the first room, not merely be inconvenient
 * to guess. The name-derived stem stays readable; the opaque tail is copied as
 * part of the link rather than dictated character by character.
 */
import { randomBytes } from 'node:crypto'
import { kebab, slugStem } from '@/lib/slugify'

/** Sixteen random bytes are 128 bits. Base64url keeps those bytes compact (22
 * characters, no padding) and safe in a path segment. Existing word-tail and
 * six-character rooms remain valid because lookups never interpret tail shape. */
const ROOM_CAPABILITY_BYTES = 16
/** Re-exported so `@/server/slug` stays the one import path for slug parts. The
 *  implementation lives in `@/lib/slugify` because the landing hero previews the stem as you
 *  type and a client component cannot import `node:crypto`. */
export { kebab }

export const randomTail = (): string => randomBytes(ROOM_CAPABILITY_BYTES).toString('base64url')

/** e.g. "Ski trip 🎿" → "ski-trip-R7LxQ3TBJV_uQ2PMhzc8rw". Names that kebab to nothing (emoji-only,
 *  non-latin scripts) fall back to "room" so the slug always reads as a link. */
export function roomSlug(name: string): string {
    const stem = slugStem(name)
    return `${stem}-${randomTail()}`
}

/** Token handed to a member once and stored client-side; attribution only. */
export const memberToken = (): string => randomBytes(24).toString('base64url')
