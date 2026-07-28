/**
 * The SSE route handler against the real database. Next route handlers are plain
 * functions, so the stream can be read directly off the Response — no server, no
 * EventSource, no timers to wait on beyond the poke itself.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma, truncateAll } from '@/server/test/db'
import { MAX_SUBSCRIBERS_PER_ROOM, publish, resetEvents, subscribe, subscriberCount } from '@/server/events'
import { GET as events } from '@/app/api/rooms/[slug]/events/route'

const BASE = 'http://localhost'

const openStream = (slug: string, signal?: AbortSignal) =>
    events(new Request(`${BASE}/api/rooms/${slug}/events`, { signal }), { params: Promise.resolve({ slug }) })

/** One chunk, decoded. The handler writes `: open` before anything else, so a
 *  read never blocks on an empty room. */
const readChunk = async (reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> => {
    const { value, done } = await reader.read()
    if (done || !value) return ''
    return new TextDecoder().decode(value)
}

const seedRoom = async (slug: string) =>
    prisma.room.create({
        data: {
            slug,
            name: 'Ski trip',
            currency: 'EUR',
            members: { create: { name: 'Ana', token: `token-${slug}` } },
        },
        select: { id: true },
    })

beforeEach(async () => {
    resetEvents()
    await truncateAll()
})

afterEach(() => resetEvents())

describe('GET /api/rooms/[slug]/events', () => {
    it('answers as a live event stream that proxies must not buffer', async () => {
        await seedRoom('ski-trip-aaa')
        const controller = new AbortController()
        const response = await openStream('ski-trip-aaa', controller.signal)

        expect(response.status).toBe(200)
        expect(response.headers.get('Content-Type')).toContain('text/event-stream')
        expect(response.headers.get('Cache-Control')).toContain('no-cache')
        expect(response.headers.get('X-Accel-Buffering')).toBe('no')

        const reader = response.body!.getReader()
        // The immediate flush: without it a buffering proxy leaves the browser in
        // CONNECTING and the client never leaves the 8s poll.
        expect(await readChunk(reader)).toBe(': open\n\n')

        await reader.cancel()
        controller.abort()
    })

    it('delivers a payload-free poke when the room is published to', async () => {
        const room = await seedRoom('ski-trip-bbb')
        const controller = new AbortController()
        const response = await openStream('ski-trip-bbb', controller.signal)
        const reader = response.body!.getReader()
        await readChunk(reader)

        publish(room.id)

        // `bump` and nothing else — the client refetches the authoritative GET.
        expect(await readChunk(reader)).toBe('data: bump\n\n')

        await reader.cancel()
        controller.abort()
    })

    it('registers exactly one subscriber and releases it when the client aborts', async () => {
        const room = await seedRoom('ski-trip-ccc')
        const controller = new AbortController()
        const response = await openStream('ski-trip-ccc', controller.signal)
        const reader = response.body!.getReader()
        await readChunk(reader)

        expect(subscriberCount(room.id)).toBe(1)

        controller.abort()
        expect(subscriberCount(room.id)).toBe(0)
        expect(subscriberCount()).toBe(0)
        await reader.cancel().catch(() => {})
    })

    it('keeps the stream alive with a comment frame rather than letting it idle out', async () => {
        vi.useFakeTimers()
        try {
            await seedRoom('ski-trip-ddd')
            const controller = new AbortController()
            const response = await openStream('ski-trip-ddd', controller.signal)
            const reader = response.body!.getReader()
            await readChunk(reader)

            await vi.advanceTimersByTimeAsync(25_000)

            expect(await readChunk(reader)).toBe(': keepalive\n\n')
            await reader.cancel()
            controller.abort()
        } finally {
            vi.useRealTimers()
        }
    })

    it('404s a slug that does not exist instead of opening a stream for nothing', async () => {
        const response = await openStream('no-such-room')
        expect(response.status).toBe(404)
        expect(subscriberCount()).toBe(0)
    })

    it('answers 204 at capacity, which is the browser-level "do not reconnect"', async () => {
        const room = await seedRoom('ski-trip-eee')
        for (let i = 0; i < MAX_SUBSCRIBERS_PER_ROOM; i++) subscribe(room.id, () => {})

        const response = await openStream('ski-trip-eee')

        expect(response.status).toBe(204)
        expect(response.body).toBeNull()
        expect(subscriberCount(room.id)).toBe(MAX_SUBSCRIBERS_PER_ROOM)
    })
})
