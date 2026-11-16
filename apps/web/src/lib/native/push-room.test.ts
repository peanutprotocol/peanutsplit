// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { hasPushRoom, PUSH_ROOM_PREFIX, readPushRoom, removePushRoom, writePushRoom } from './push-room'

const SLUG = 'ski-trip-kunc-syrup-drum'
const OTHER = 'flat-share-kunc-syrup-otter'

beforeEach(() => window.localStorage.clear())

describe('push-room map', () => {
    it('maps a notification key back to the room it opens', () => {
        expect(writePushRoom('key-1', SLUG)).toBe(true)
        expect(window.localStorage.getItem(`${PUSH_ROOM_PREFIX}key-1`)).toBe(SLUG)
        expect(readPushRoom('key-1')).toBe(SLUG)
        expect(hasPushRoom(SLUG)).toBe(true)
    })

    it('answers null for an unknown key and for a stored value that is not a room slug', () => {
        expect(readPushRoom('nope')).toBeNull()
        expect(readPushRoom('')).toBeNull()
        window.localStorage.setItem(`${PUSH_ROOM_PREFIX}key-2`, 'javascript:alert(1)')
        expect(readPushRoom('key-2')).toBeNull()
    })

    it('removes every entry of one room and keeps the other rooms', () => {
        writePushRoom('key-1', SLUG)
        writePushRoom('key-old', SLUG)
        writePushRoom('key-2', OTHER)
        removePushRoom(SLUG)
        expect(readPushRoom('key-1')).toBeNull()
        expect(readPushRoom('key-old')).toBeNull()
        expect(hasPushRoom(SLUG)).toBe(false)
        expect(readPushRoom('key-2')).toBe(OTHER)
    })
})
