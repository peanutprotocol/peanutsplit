import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    clearRoomUpdates,
    clearRoomUpdatesRequest,
    completeRoomUpdates,
    muteRoomUpdates,
    readRoomUpdates,
    requestRoomUpdates,
    ROOM_UPDATES_CHANGE_EVENT,
    ROOM_UPDATES_REQUEST_TTL_MS,
    roomUpdatesStorageKey,
} from './room-updates'

const SLUG = 'trip-R7LxQ3TBJV_uQ2PMhzc8rw'
const OTHER_SLUG = 'another-R7LxQ3TBJV_uQ2PMhzc8rw'
const NOW = 1_800_000_000_000

describe('room update setup progress', () => {
    let values: Map<string, string>
    let dispatchEvent: ReturnType<typeof vi.fn>

    beforeEach(() => {
        values = new Map()
        dispatchEvent = vi.fn()
        vi.spyOn(Date, 'now').mockReturnValue(NOW)
        vi.stubGlobal('window', {
            localStorage: {
                getItem: (key: string) => values.get(key) ?? null,
                setItem: (key: string, value: string) => values.set(key, value),
                removeItem: (key: string) => values.delete(key),
            },
            dispatchEvent,
        })
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('keeps an explicit request scoped to its room and separate from completion', () => {
        requestRoomUpdates(SLUG)

        expect(readRoomUpdates(SLUG)).toEqual({ requestedAt: NOW })
        expect(readRoomUpdates(OTHER_SLUG)).toEqual({})
        expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: ROOM_UPDATES_CHANGE_EVENT }))
    })

    it('expires abandoned requests after 24 hours without erasing other progress', () => {
        values.set(roomUpdatesStorageKey(SLUG), JSON.stringify({ requestedAt: NOW, subscribedAt: NOW - 10 }))
        vi.spyOn(Date, 'now').mockReturnValue(NOW + ROOM_UPDATES_REQUEST_TTL_MS - 1)
        expect(readRoomUpdates(SLUG)).toEqual({ requestedAt: NOW, subscribedAt: NOW - 10 })

        vi.spyOn(Date, 'now').mockReturnValue(NOW + ROOM_UPDATES_REQUEST_TTL_MS)
        expect(readRoomUpdates(SLUG)).toEqual({ subscribedAt: NOW - 10 })
    })

    it('clears a pending request and mute preference only on successful completion', () => {
        muteRoomUpdates(SLUG)
        requestRoomUpdates(SLUG)
        expect(readRoomUpdates(SLUG)).toEqual({ requestedAt: NOW })

        completeRoomUpdates(SLUG)
        expect(readRoomUpdates(SLUG)).toEqual({ subscribedAt: NOW })
    })

    it('preserves an explicit opt-out while clearing pending setup', () => {
        completeRoomUpdates(SLUG)
        requestRoomUpdates(SLUG)
        muteRoomUpdates(SLUG)

        expect(readRoomUpdates(SLUG)).toEqual({ subscribedAt: NOW, muted: true })
        clearRoomUpdatesRequest(SLUG)
        expect(readRoomUpdates(SLUG)).toEqual({ subscribedAt: NOW, muted: true })
    })

    it('clears only the requested room and leaves existing subscription progress intact', () => {
        requestRoomUpdates(SLUG)
        completeRoomUpdates(OTHER_SLUG)
        clearRoomUpdatesRequest(SLUG)
        expect(readRoomUpdates(SLUG)).toEqual({})
        expect(values.has(roomUpdatesStorageKey(SLUG))).toBe(false)
        expect(readRoomUpdates(OTHER_SLUG)).toEqual({ subscribedAt: NOW })

        clearRoomUpdates(OTHER_SLUG)
        expect(values.has(roomUpdatesStorageKey(OTHER_SLUG))).toBe(false)
    })

    it.each(['no json', 'null', '[]', 'true', '{"requestedAt":"now","subscribedAt":-1,"muted":"yes"}'])(
        'ignores malformed state: %s',
        (raw) => {
            values.set(roomUpdatesStorageKey(SLUG), raw)
            expect(readRoomUpdates(SLUG)).toEqual({})
        }
    )

    it('does not resume a request with a future timestamp', () => {
        values.set(roomUpdatesStorageKey(SLUG), JSON.stringify({ requestedAt: NOW + 1 }))
        expect(readRoomUpdates(SLUG)).toEqual({})
    })

    it('tolerates blocked storage and emits no successful update event', () => {
        vi.stubGlobal('window', {
            get localStorage() {
                throw new DOMException('blocked', 'SecurityError')
            },
            dispatchEvent,
        })

        expect(readRoomUpdates(SLUG)).toEqual({})
        expect(() => requestRoomUpdates(SLUG)).not.toThrow()
        expect(() => completeRoomUpdates(SLUG)).not.toThrow()
        expect(() => muteRoomUpdates(SLUG)).not.toThrow()
        expect(() => clearRoomUpdatesRequest(SLUG)).not.toThrow()
        expect(() => clearRoomUpdates(SLUG)).not.toThrow()
        expect(dispatchEvent).not.toHaveBeenCalled()
    })
})
