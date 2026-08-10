import { afterEach, describe, expect, it, vi } from 'vitest'
import { encodeRoomDrawing } from './room-drawing'
import { memberStorageKey } from './identity'
import { roomInstallStorageKey } from './install-funnel'
import {
    forgetRoom,
    mostRecentRoomPath,
    readRecentRooms,
    RECENT_ROOMS_KEY,
    RECENT_ROOMS_LIMIT,
    rememberRoom,
    roomSlugFromLink,
} from './recent-rooms'

const ORIGIN = 'http://localhost:3000'
const SLUG = 'lisbon-weekend-R7LxQ3TBJV_uQ2PMhzc8rw'
/** Rooms minted with the former word list keep working too. */
const WORD_SLUG = 'lisbon-weekend-brave-otter-lamp'
/** Rooms minted before the word list. They keep their slugs, so paste still has to take them. */
const LEGACY_SLUG = 'lisbon-weekend-x7k2m9'

describe('roomSlugFromLink', () => {
    it('takes current and both legacy tail shapes, because a room keeps the slug it was issued', () => {
        expect(roomSlugFromLink(`/r/${SLUG}`, ORIGIN)).toBe(SLUG)
        expect(roomSlugFromLink(`/r/${WORD_SLUG}`, ORIGIN)).toBe(WORD_SLUG)
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
                removeItem: (key: string) => values.delete(key),
            },
        })

        expect(rememberRoom({ slug: SLUG, name: 'Lisbon weekend', lastSeenAt: 1 })).toBe(true)
        values.set(memberStorageKey(SLUG), JSON.stringify({ memberId: 'member-1', name: 'Ana', token: 'proof' }))
        values.set(roomInstallStorageKey(SLUG), JSON.stringify({ version: 1, origin: 'created_here' }))
        expect(readRecentRooms()).toEqual([
            { slug: SLUG, name: 'Lisbon weekend', emoji: undefined, theme: undefined, lastSeenAt: 1 },
        ])
        expect(forgetRoom(SLUG)).toBe(true)
        expect(JSON.parse(values.get(RECENT_ROOMS_KEY) ?? '[]')).toEqual([])
        expect(values.has(memberStorageKey(SLUG))).toBe(false)
        expect(values.has(roomInstallStorageKey(SLUG))).toBe(false)
    })

    it('bounds prompt journey records without silently forgetting an evicted room identity', () => {
        const values = new Map<string, string>()
        vi.stubGlobal('window', {
            localStorage: {
                getItem: (key: string) => values.get(key) ?? null,
                setItem: (key: string, value: string) => values.set(key, value),
                removeItem: (key: string) => values.delete(key),
            },
        })

        const slugs = Array.from(
            { length: RECENT_ROOMS_LIMIT + 1 },
            (_, index) => `room-${index}-R7LxQ3TBJV_uQ2PMhzc8rw`
        )
        for (let index = 0; index < RECENT_ROOMS_LIMIT; index += 1) {
            expect(rememberRoom({ slug: slugs[index], name: `Room ${index}`, lastSeenAt: index + 1 })).toBe(true)
        }
        const evicted = slugs[0]
        values.set(memberStorageKey(evicted), JSON.stringify({ memberId: 'member-1', name: 'Ana', token: 'proof' }))
        values.set(roomInstallStorageKey(evicted), JSON.stringify({ version: 1, origin: 'opened_here' }))

        expect(
            rememberRoom({
                slug: slugs[RECENT_ROOMS_LIMIT],
                name: 'Newest room',
                lastSeenAt: RECENT_ROOMS_LIMIT + 1,
            })
        ).toBe(true)
        expect(readRecentRooms()).toHaveLength(RECENT_ROOMS_LIMIT)
        expect(values.has(roomInstallStorageKey(evicted))).toBe(false)
        expect(values.has(memberStorageKey(evicted))).toBe(true)
    })

    it('round-trips a custom room drawing without changing its geometry', () => {
        const values = new Map<string, string>()
        const drawing = encodeRoomDrawing([
            [
                { x: 0.1, y: 0.2 },
                { x: 0.9, y: 0.8 },
            ],
        ])
        vi.stubGlobal('window', {
            localStorage: {
                getItem: (key: string) => values.get(key) ?? null,
                setItem: (key: string, value: string) => values.set(key, value),
            },
        })

        expect(rememberRoom({ slug: SLUG, name: 'Lisbon weekend', emoji: drawing, lastSeenAt: 1 })).toBe(true)
        expect(readRecentRooms()[0]?.emoji).toBe(drawing)
    })

    it('routes to the newest valid room, regardless of storage order, and skips tampered slugs', () => {
        const values = new Map<string, string>([
            [
                RECENT_ROOMS_KEY,
                JSON.stringify([
                    { slug: LEGACY_SLUG, name: 'Old room', lastSeenAt: 10 },
                    { slug: '../../new', name: 'Tampered room', lastSeenAt: 30 },
                    { slug: SLUG, name: 'Newest valid room', lastSeenAt: 20 },
                ]),
            ],
        ])
        vi.stubGlobal('window', {
            localStorage: {
                getItem: (key: string) => values.get(key) ?? null,
                setItem: (key: string, value: string) => values.set(key, value),
            },
        })

        expect(readRecentRooms().map((room) => room.slug)).toEqual([SLUG, LEGACY_SLUG])
        expect(mostRecentRoomPath()).toBe(`/r/${SLUG}`)
    })

    it('returns no room route for missing or malformed storage', () => {
        vi.stubGlobal('window', {
            localStorage: {
                getItem: () => '{not json',
                setItem: () => undefined,
            },
        })

        expect(mostRecentRoomPath()).toBeNull()
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

    it('returns false when an allowed localStorage object rejects reads', () => {
        vi.stubGlobal('window', {
            localStorage: {
                getItem: () => {
                    throw new DOMException('blocked', 'SecurityError')
                },
                setItem: () => undefined,
                removeItem: () => undefined,
            },
        })

        expect(rememberRoom({ slug: SLUG, name: 'Lisbon weekend' })).toBe(false)
        expect(forgetRoom(SLUG)).toBe(false)
    })

    it('rolls explicit Forget back when one room-scoped removal fails', () => {
        const recent = JSON.stringify([{ slug: SLUG, name: 'Lisbon', lastSeenAt: 1 }])
        const identity = JSON.stringify({ memberId: 'member-1', name: 'Ana', token: 'proof' })
        const funnel = JSON.stringify({ version: 1, origin: 'created_here' })
        const values = new Map<string, string>([
            [RECENT_ROOMS_KEY, recent],
            [memberStorageKey(SLUG), identity],
            [roomInstallStorageKey(SLUG), funnel],
        ])
        let failFunnelRemoval = true
        vi.stubGlobal('window', {
            localStorage: {
                getItem: (key: string) => values.get(key) ?? null,
                setItem: (key: string, value: string) => values.set(key, value),
                removeItem: (key: string) => {
                    if (key === roomInstallStorageKey(SLUG) && failFunnelRemoval) {
                        failFunnelRemoval = false
                        throw new DOMException('blocked', 'SecurityError')
                    }
                    values.delete(key)
                },
            },
        })

        expect(forgetRoom(SLUG)).toBe(false)
        expect(values.get(RECENT_ROOMS_KEY)).toBe(recent)
        expect(values.get(memberStorageKey(SLUG))).toBe(identity)
        expect(values.get(roomInstallStorageKey(SLUG))).toBe(funnel)
    })

    it('treats a blocked localStorage getter as an empty, unwritable device', () => {
        vi.stubGlobal('window', {
            get localStorage() {
                throw new DOMException('blocked', 'SecurityError')
            },
        })

        expect(readRecentRooms()).toEqual([])
        expect(mostRecentRoomPath()).toBeNull()
        expect(rememberRoom({ slug: SLUG, name: 'Lisbon weekend' })).toBe(false)
        expect(forgetRoom(SLUG)).toBe(false)
    })
})
