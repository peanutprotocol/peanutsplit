import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { kebab, memberToken, randomTail, roomSlug } from '@/server/slug'
import { SLUG_WORDS } from '@/server/slugWords'
import { slugStem } from '@/lib/slugify'

/** Three words drawn from the list, e.g. "brave-otter-lamp". */
const TAIL = /[a-z]{3,7}-[a-z]{3,7}-[a-z]{3,7}/

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
    it('is the kebab name plus a three-word tail', () => {
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
    it('draws every word from the list', () => {
        const drawn = new Set(Array.from({ length: 500 }, () => randomTail()).flatMap((tail) => tail.split('-')))
        for (const word of drawn) expect(SLUG_WORDS).toContain(word)
    })

    it('reaches the whole list, so no word is unreachable', () => {
        // A masked draw that lost a bit would silently halve the entropy while every
        // other test still passed. 20,000 draws leave a p ~ 1e-8 chance of a false alarm.
        const drawn = new Set(Array.from({ length: 20_000 }, () => randomTail()).flatMap((tail) => tail.split('-')))
        expect(drawn.size).toBe(SLUG_WORDS.length)
    })
})

describe('the word list', () => {
    // The tail used to be six Crockford base32 characters and 32^6 === 1024^3, so a
    // 1,024-word list is an exact swap and any other length is a silent change to the
    // room credential's strength. The hash makes an edited word visible in review.
    it('is exactly 1024 words, deduplicated and sorted', () => {
        expect(SLUG_WORDS).toHaveLength(1024)
        expect(new Set(SLUG_WORDS).size).toBe(1024)
        expect([...SLUG_WORDS]).toEqual([...SLUG_WORDS].sort())
        expect(32 ** 6).toBe(SLUG_WORDS.length ** 3)
    })

    it('is short, lowercase and hyphen-free, so the tail stays splittable', () => {
        for (const word of SLUG_WORDS) expect(word).toMatch(/^[a-z]{3,7}$/)
    })

    it('has not been edited', () => {
        expect(createHash('sha256').update(SLUG_WORDS.join(' ')).digest('hex')).toBe(
            '85f1d479695365860b2ae75419cd1ed69c0cb2f63ef2beb1213b820aa14101c9'
        )
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
