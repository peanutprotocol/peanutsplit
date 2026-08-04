import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ACHIEVEMENTS_KEY, claimSessionMoment, markSeen, readSeen, resetSessionMoments } from './achievement-storage'

/** vitest runs in the node environment here — give the module the one browser global it touches,
 *  and nothing else. Mirrors `identity.test.ts`. */
class MemoryStorage {
    map = new Map<string, string>()
    getItem(key: string) {
        return this.map.get(key) ?? null
    }
    setItem(key: string, value: string) {
        this.map.set(key, value)
    }
    removeItem(key: string) {
        this.map.delete(key)
    }
}

declare const globalThis: Record<string, unknown> & typeof global

const installBrowser = (storage: unknown = new MemoryStorage()) => {
    globalThis.window = { localStorage: storage } as unknown as Window & typeof globalThis
}

beforeEach(() => {
    installBrowser()
    resetSessionMoments()
})

afterEach(() => {
    delete (globalThis as Record<string, unknown>).window
})

describe('the seen set', () => {
    it('round-trips, and keeps what was already there', () => {
        markSeen('ski-trip-x7k2m9', ['crew-3', 'crew-5'])
        expect(readSeen('ski-trip-x7k2m9')).toEqual(new Set(['crew-3', 'crew-5']))

        markSeen('ski-trip-x7k2m9', ['passport-2'])
        expect(readSeen('ski-trip-x7k2m9')).toEqual(new Set(['crew-3', 'crew-5', 'passport-2']))
    })

    it('is per room', () => {
        markSeen('ski-trip-x7k2m9', ['crew-3'])
        expect(readSeen('beach-house-q4v8')).toEqual(new Set())
    })

    it('has no history for a device that has never celebrated', () => {
        expect(readSeen('ski-trip-x7k2m9')).toEqual(new Set())
    })

    it('treats a corrupt record as no history rather than a crash', () => {
        const store = new MemoryStorage()
        installBrowser(store)
        store.setItem(ACHIEVEMENTS_KEY('ski-trip-x7k2m9'), '{not json')
        expect(readSeen('ski-trip-x7k2m9')).toEqual(new Set())

        // The shape can be wrong without being unparseable.
        store.setItem(ACHIEVEMENTS_KEY('ski-trip-x7k2m9'), '{"crew-3":true}')
        expect(readSeen('ski-trip-x7k2m9')).toEqual(new Set())

        store.setItem(ACHIEVEMENTS_KEY('ski-trip-x7k2m9'), '["crew-3",7,null]')
        expect(readSeen('ski-trip-x7k2m9')).toEqual(new Set(['crew-3']))
    })

    it('never propagates a throwing storage into a render', () => {
        installBrowser({
            getItem: () => {
                throw new Error('private mode')
            },
            setItem: () => {
                throw new Error('quota exceeded')
            },
        })
        expect(readSeen('ski-trip-x7k2m9')).toEqual(new Set())
        expect(() => markSeen('ski-trip-x7k2m9', ['crew-3'])).not.toThrow()
    })

    it('survives storage being unavailable altogether', () => {
        delete (globalThis as Record<string, unknown>).window
        expect(readSeen('ski-trip-x7k2m9')).toEqual(new Set())
        expect(() => markSeen('ski-trip-x7k2m9', ['crew-3'])).not.toThrow()
    })
})

describe('claimSessionMoment', () => {
    it('claims once, then declines', () => {
        expect(claimSessionMoment('ski-trip-x7k2m9')).toBe(true)
        expect(claimSessionMoment('ski-trip-x7k2m9')).toBe(false)
    })

    it('does not mute the second room of a session', () => {
        // `RoomSwitcher` moves between rooms without a reload, so a global flag would silently
        // swallow every later room's moment until the tab was closed.
        expect(claimSessionMoment('ski-trip-x7k2m9')).toBe(true)
        expect(claimSessionMoment('beach-house-q4v8')).toBe(true)
        expect(claimSessionMoment('beach-house-q4v8')).toBe(false)
    })
})
