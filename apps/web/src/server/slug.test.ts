import { describe, expect, it } from 'vitest'
import { kebab, memberToken, randomTail, roomSlug } from '@/server/slug'

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
    it('is the kebab name plus a six-character tail', () => {
        expect(roomSlug('Ski Trip')).toMatch(/^ski-trip-[0-9a-hjkmnp-tv-z]{6}$/)
    })

    it('falls back to "room" when the name kebabs to nothing', () => {
        expect(roomSlug('🎿')).toMatch(/^room-[0-9a-hjkmnp-tv-z]{6}$/)
    })

    it('does not repeat itself', () => {
        const slugs = new Set(Array.from({ length: 500 }, () => roomSlug('trip')))
        expect(slugs.size).toBe(500)
    })
})

describe('randomTail', () => {
    it('excludes the ambiguous letters i, l, o and u', () => {
        const sample = Array.from({ length: 200 }, () => randomTail()).join('')
        expect(sample).not.toMatch(/[ilou]/)
    })
})

describe('memberToken', () => {
    it('is url-safe and long enough to be unguessable', () => {
        const token = memberToken()
        expect(token).toMatch(/^[A-Za-z0-9_-]{32,}$/)
        expect(new Set(Array.from({ length: 200 }, () => memberToken())).size).toBe(200)
    })
})
