/**
 * Room slugs. The slug IS the credential, so the random tail must be
 * crypto-random and unambiguous when read aloud or typed from a screenshot.
 */
import { randomBytes } from 'node:crypto'
import { kebab, slugStem } from '@/lib/slugify'
import { SLUG_WORDS } from '@/server/slugWords'

/** Three words from the frozen 1,024-word list. Words dodge the read-aloud
 *  problem rather than routing around it: base32 had to drop i, l, o and u
 *  because those letters are ambiguous spoken, and a screened word is not.
 *  1,024 is 2^10, so two bytes masked to their low ten bits draw uniformly with
 *  no modulo bias — the same trick `byte & 31` used for 32 symbols.
 *  `slugWords.ts` carries the identity that makes three words free. */
const TAIL_WORDS = 3
const WORD_MASK = SLUG_WORDS.length - 1
/** Re-exported so `@/server/slug` stays the one import path for slug parts. The
 *  implementation lives in `@/lib/slugify` because the landing hero previews the stem as you
 *  type and a client component cannot import `node:crypto`. */
export { kebab }

export function randomTail(count = TAIL_WORDS): string {
    const bytes = randomBytes(count * 2)
    const words: string[] = []
    for (let i = 0; i < bytes.length; i += 2) words.push(SLUG_WORDS[((bytes[i] << 8) | bytes[i + 1]) & WORD_MASK])
    return words.join('-')
}

/** e.g. "Ski trip 🎿" → "ski-trip-brave-otter-lamp". Names that kebab to nothing (emoji-only,
 *  non-latin scripts) fall back to "room" so the slug always reads as a link. */
export function roomSlug(name: string): string {
    const stem = slugStem(name)
    return `${stem}-${randomTail()}`
}

/** Token handed to a member once and stored client-side; attribution only. */
export const memberToken = (): string => randomBytes(24).toString('base64url')
