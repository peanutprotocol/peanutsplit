import { describe, expect, it } from 'vitest'
import { ROOM_NAME_FALLBACKS } from './room-names'

describe('room name catalog', () => {
    it('contains fifty distinct names that fit the room title limit', () => {
        expect(ROOM_NAME_FALLBACKS).toHaveLength(50)
        expect(new Set(ROOM_NAME_FALLBACKS.map((name) => name.toLowerCase())).size).toBe(50)
        for (const name of ROOM_NAME_FALLBACKS) {
            expect(name).toBe(name.trim())
            expect(name.length).toBeGreaterThan(0)
            expect(name.length).toBeLessThanOrEqual(24)
        }
    })
})
