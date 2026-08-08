/**
 * The room pseudonym, and the guard that keeps a slug out of a property bag.
 *
 * A room slug IS the room's access control: anyone who reads one can open the
 * room and see every expense, amount and member name. On 2026-07-28 automatic
 * PostHog page properties carried slugs for a single day, and nine rooms sat
 * readable by everyone with access to the analytics project until it was found.
 * These tests exist so that cannot happen quietly a second time.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const posthog = vi.hoisted(() => ({ capture: vi.fn(), init: vi.fn() }))
vi.mock('posthog-js', () => ({ default: posthog }))

const priorKey = process.env.NEXT_PUBLIC_POSTHOG_KEY

const SLUG = 'ski-trip-nL5tI-kDc2lvZUI7OzRYAw'
const KEY = 'a3f9c2d1e4b5a6978081726354afbecd'

beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubGlobal('window', {})
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_room_key_test'
})

afterAll(() => {
    vi.unstubAllGlobals()
    if (priorKey === undefined) delete process.env.NEXT_PUBLIC_POSTHOG_KEY
    else process.env.NEXT_PUBLIC_POSTHOG_KEY = priorKey
})

describe('room pseudonym', () => {
    it('attaches the server pseudonym and never the slug', async () => {
        const { rememberRoomKey, roomProps } = await import('@/lib/analytics')
        rememberRoomKey(SLUG, KEY)

        const props = roomProps(SLUG, { splitMode: 'EQUAL' })

        expect(props).toEqual({ room: KEY, splitMode: 'EQUAL' })
        expect(JSON.stringify(props)).not.toContain(SLUG)
    })

    it('omits the property for an unknown room rather than falling back to the slug', async () => {
        const { roomProps } = await import('@/lib/analytics')

        // Fewer analytics beats a leak: an unregistered room is simply unkeyed.
        expect(roomProps(SLUG, { splitMode: 'EQUAL' })).toEqual({ splitMode: 'EQUAL' })
    })

    it('ignores an absent key, so an older cached RoomState cannot register one', async () => {
        const { rememberRoomKey, roomProps } = await import('@/lib/analytics')
        rememberRoomKey(SLUG, undefined)

        expect(roomProps(SLUG)).toEqual({})
    })

    it('keys rooms independently', async () => {
        const { rememberRoomKey, roomProps } = await import('@/lib/analytics')
        rememberRoomKey(SLUG, KEY)
        rememberRoomKey('food-c176h1', 'ffffffffffffffffffffffffffffffff')

        expect(roomProps(SLUG).room).toBe(KEY)
        expect(roomProps('food-c176h1').room).toBe('ffffffffffffffffffffffffffffffff')
    })
})

describe('no outgoing property may carry a room credential', () => {
    it('sends the pseudonym to PostHog and nothing that looks like a slug or room URL', async () => {
        const { initAnalytics, rememberRoomKey, roomProps, track } = await import('@/lib/analytics')
        initAnalytics()
        rememberRoomKey(SLUG, KEY)

        track('expense_added', roomProps(SLUG, { splitMode: 'EQUAL', foreign: false }))

        expect(posthog.capture).toHaveBeenCalledTimes(1)
        const [event, properties] = posthog.capture.mock.calls[0] as [string, Record<string, unknown>]
        expect(event).toBe('expense_added')

        // The assertion that matters: nothing in the bag can open a room.
        const serialized = JSON.stringify(properties)
        expect(serialized).not.toContain(SLUG)
        expect(serialized).not.toMatch(/\/r\//)
        expect(serialized).not.toMatch(/peanutsplit\.com/)
        expect(properties.room).toBe(KEY)
    })
})
