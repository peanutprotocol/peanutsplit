import { afterEach, describe, expect, it, vi } from 'vitest'
import { forgetRoom, readRecentRooms, RECENT_ROOMS_KEY, rememberRoom, roomSlugFromLink } from './recent-rooms'

const ORIGIN = 'http://localhost:3000'
const SLUG = 'lisbon-weekend-brave-otter-lamp'
/** Rooms minted before the word list. They keep their slugs, so paste still has to take them. */
const LEGACY_SLUG = 'lisbon-weekend-x7k2m9'

describe('roomSlugFromLink', () => {
    it('takes both tail shapes, because a room keeps the slug it was issued', () => {
        expect(roomSlugFromLink(`/r/${SLUG}`, ORIGIN)).toBe(SLUG)
        expect(roomSlugFromLink(`/r/${LEGACY_SLUG}`, ORIGIN)).toBe(LEGACY_SLUG)
    })

    it.each([
        [`https://peanutsplit.com/r/${SLUG}`, SLUG],
        [`https://www.peanutsplit.com/r/${SLUG}/`, SLUG],
        [`peanutsplit.com/r/${SLUG}?utm_source=chat#room`, SLUG],
        [`/r/${SLUG}`, SLUG],
        [`${ORIGIN}/r/${SLUG}`, SLUG],
    ])('normalizes a valid room link without retaining URL decoration', (value, expected) => {
        expect(roomSlugFromLink(value, ORIGIN)).toBe(expected)
    })

    it.each([
        '',
        'not a URL',
        `https://example.com/r/${SLUG}`,
        `javascript://peanutsplit.com/r/${SLUG}`,
        `https://user:password@peanutsplit.com/r/${SLUG}`,
        'https://peanutsplit.com/',
        'https://peanutsplit.com/r/not-a-room',
        `https://peanutsplit.com/r/${SLUG}/extra`,
    ])('rejects invalid or non-Peanut credentials: %s', (value) => {
        expect(roomSlugFromLink(value, ORIGIN)).toBeNull()
    })
})

describe('recent-room persistence results', () => {
    afterEach(() => vi.unstubAllGlobals())

    it('reports successful writes and removals', () => {
        const values = new Map<string, string>()
        vi.stubGlobal('window', {
            localStorage: {
                getItem: (key: string) => values.get(key) ?? null,
                setItem: (key: string, value: string) => values.set(key, value),
            },
        })

        expect(rememberRoom({ slug: SLUG, name: 'Lisbon weekend', lastSeenAt: 1 })).toBe(true)
        expect(readRecentRooms()).toEqual([
            { slug: SLUG, name: 'Lisbon weekend', emoji: undefined, theme: undefined, lastSeenAt: 1 },
        ])
        expect(forgetRoom(SLUG)).toBe(true)
        expect(JSON.parse(values.get(RECENT_ROOMS_KEY) ?? '[]')).toEqual([])
    })

    it('reports storage failures instead of claiming a credential was saved or removed', () => {
        vi.stubGlobal('window', {
            localStorage: {
                getItem: () => null,
                setItem: () => {
                    throw new DOMException('blocked', 'SecurityError')
                },
            },
        })

        expect(rememberRoom({ slug: SLUG, name: 'Lisbon weekend' })).toBe(false)
        expect(forgetRoom(SLUG)).toBe(false)
    })
})
