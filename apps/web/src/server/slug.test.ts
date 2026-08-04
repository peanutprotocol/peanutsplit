import { describe, expect, it } from 'vitest'
import { kebab, memberToken, randomTail, roomSlug } from '@/server/slug'
import { slugStem } from '@/lib/slugify'

/** Sixteen random bytes encoded without padding: 128 bits in 22 characters. */
const TAIL = /[A-Za-z0-9_-]{22}/

describe('kebab', () => {
    it('lowercases and dashes', () => {
        expect(kebab('Ski Trip 2026')).toBe('ski-trip-2026')
    })

    it('strips diacritics rather than dropping the word', () => {
        expect(kebab('Año Nuevo en Bariloche')).toBe('ano-nuevo-en-bariloche')
    })

    it('drops emoji and punctuation without leaving stray dashes', () => {
        expect(kebab('  Asado 🥩 & Fernet!  ')).toBe('asado-fernet')
    })

    it('returns empty for a name with nothing latin in it', () => {
        expect(kebab('🎿🎿')).toBe('')
    })
})

describe('roomSlug', () => {
    it('is the readable kebab name plus a 128-bit opaque capability', () => {
        expect(roomSlug('Ski Trip')).toMatch(new RegExp(`^ski-trip-${TAIL.source}$`))
    })

    it('falls back to "room" when the name kebabs to nothing', () => {
        expect(roomSlug('🎿')).toMatch(new RegExp(`^room-${TAIL.source}$`))
    })

    it('does not repeat itself', () => {
        const slugs = new Set(Array.from({ length: 500 }, () => roomSlug('trip')))
        expect(slugs.size).toBe(500)
    })
})

describe('randomTail', () => {
    it('encodes exactly sixteen random bytes without base64 padding', () => {
        const tail = randomTail()
        expect(tail).toMatch(new RegExp(`^${TAIL.source}$`))
        expect(Buffer.from(tail, 'base64url')).toHaveLength(16)
    })
})

describe('memberToken', () => {
    it('is url-safe and long enough to be unguessable', () => {
        const token = memberToken()
        expect(token).toMatch(/^[A-Za-z0-9_-]{32,}$/)
        expect(new Set(Array.from({ length: 200 }, () => memberToken())).size).toBe(200)
    })
})

describe('the hero preview contract', () => {
    it('mints a slug that starts with the stem the landing page previewed', () => {
        // The hero prints `slugStem(name)` and a dotted tail while you type. If these two ever
        // disagree, the page promises a URL the next screen does not deliver.
        for (const name of ['Ski trip 2026', 'Año Nuevo en Bariloche', '  Asado 🥩 & Fernet!  ', '🎿🎿']) {
            expect(roomSlug(name).startsWith(`${slugStem(name)}-`)).toBe(true)
        }
    })
})
