import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    MAX_SUBSCRIBERS_PER_ROOM,
    MAX_SUBSCRIBERS_TOTAL,
    publish,
    resetEvents,
    subscribe,
    subscriberCount,
} from './events'

afterEach(() => resetEvents())

describe('room event pub/sub', () => {
    it('pokes every subscriber on the room and nobody else', () => {
        const a = vi.fn()
        const b = vi.fn()
        const other = vi.fn()
        subscribe('room-1', a)
        subscribe('room-1', b)
        subscribe('room-2', other)

        publish('room-1')

        expect(a).toHaveBeenCalledTimes(1)
        expect(b).toHaveBeenCalledTimes(1)
        expect(other).not.toHaveBeenCalled()
    })

    it('publishing a room nobody is watching is a no-op, not a throw', () => {
        expect(() => publish('nobody-here')).not.toThrow()
    })

    it('stops poking after unsubscribe and frees the slot', () => {
        const poke = vi.fn()
        const unsubscribe = subscribe('room-1', poke)
        expect(subscriberCount('room-1')).toBe(1)

        unsubscribe?.()
        publish('room-1')

        expect(poke).not.toHaveBeenCalled()
        expect(subscriberCount('room-1')).toBe(0)
        expect(subscriberCount()).toBe(0)
    })

    it('unsubscribing twice does not hand out a free slot', () => {
        const unsubscribe = subscribe('room-1', vi.fn())
        unsubscribe?.()
        unsubscribe?.()
        expect(subscriberCount()).toBe(0)
    })

    it('one dead subscriber does not stop the fan-out', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const dead = vi.fn(() => {
            throw new Error('socket is gone')
        })
        const alive = vi.fn()
        subscribe('room-1', dead)
        subscribe('room-1', alive)

        publish('room-1')

        expect(alive).toHaveBeenCalledTimes(1)
        warn.mockRestore()
    })

    it('a subscriber that unsubscribes while being poked does not break the loop', () => {
        // The route does exactly this: a failed enqueue closes the stream, which
        // unsubscribes, mid-iteration over the set.
        const alive = vi.fn()
        let unsubscribe: (() => void) | null = null
        unsubscribe = subscribe('room-1', () => unsubscribe?.())
        subscribe('room-1', alive)

        expect(() => publish('room-1')).not.toThrow()
        expect(alive).toHaveBeenCalledTimes(1)
        expect(subscriberCount('room-1')).toBe(1)
    })

    it('refuses past the per-room cap and keeps serving other rooms', () => {
        for (let i = 0; i < MAX_SUBSCRIBERS_PER_ROOM; i++) expect(subscribe('room-1', vi.fn())).not.toBeNull()

        expect(subscribe('room-1', vi.fn())).toBeNull()
        expect(subscriberCount('room-1')).toBe(MAX_SUBSCRIBERS_PER_ROOM)
        expect(subscribe('room-2', vi.fn())).not.toBeNull()
    })

    it('a slot freed under the cap is handed to the next arrival', () => {
        const unsubscribes: (() => void)[] = []
        for (let i = 0; i < MAX_SUBSCRIBERS_PER_ROOM; i++) {
            const off = subscribe('room-1', vi.fn())
            if (off) unsubscribes.push(off)
        }
        expect(subscribe('room-1', vi.fn())).toBeNull()

        unsubscribes[0]()
        expect(subscribe('room-1', vi.fn())).not.toBeNull()
    })

    it('refuses past the process-wide cap however the rooms are spread', () => {
        const perRoom = MAX_SUBSCRIBERS_PER_ROOM
        const roomsNeeded = MAX_SUBSCRIBERS_TOTAL / perRoom
        for (let room = 0; room < roomsNeeded; room++) {
            for (let i = 0; i < perRoom; i++) subscribe(`room-${room}`, vi.fn())
        }
        expect(subscriberCount()).toBe(MAX_SUBSCRIBERS_TOTAL)
        expect(subscribe('one-more-room', vi.fn())).toBeNull()
    })
})
