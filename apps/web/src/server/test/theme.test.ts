/**
 * The room palette, end to end through the real handlers and the real database.
 *
 * The identity decision is the thing under test as much as the colours are: a
 * theme is a LINK-HOLDER write, like every other room write, and the test that
 * pins it is the one that sends no member token at all.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma, truncateAll } from '@/server/test/db'
import { resetEvents, subscribe } from '@/server/events'
import { resetRateLimits } from '@/server/rateLimit'
import { DEFAULT_THEME, themeFor } from '@/lib/themes'
import { loadRoomCard } from '@/server/og/roomCard'
import { POST as postRoom } from '@/app/api/rooms/route'
import { GET as getRoom, PATCH as patchRoom } from '@/app/api/rooms/[slug]/route'
import type { ApiError, RoomState, RoomStateWithMember } from '@/lib/api-types'

const BASE = 'http://localhost'

type Params = Record<string, string>
type Handler = (request: Request, ctx: { params: Promise<Params> }) => Promise<Response>

const call = async <T>(
    handler: Handler,
    opts: { path: string; method?: string; body?: unknown; params?: Params; token?: string }
): Promise<{ status: number; body: T }> => {
    const request = new Request(`${BASE}${opts.path}`, {
        method: opts.method ?? 'GET',
        headers: {
            'Content-Type': 'application/json',
            ...(opts.token ? { 'X-Member-Token': opts.token } : {}),
        },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    })
    const res = await handler(request, { params: Promise.resolve(opts.params ?? {}) })
    return { status: res.status, body: (await res.json()) as T }
}

const newRoom = () =>
    call<RoomStateWithMember>(postRoom as Handler, {
        path: '/api/rooms',
        method: 'POST',
        body: { name: 'Ski Trip', emoji: '🎿', currency: 'EUR', creatorName: 'Ana' },
    })

const setTheme = (slug: string, theme: unknown, token?: string) =>
    call<RoomState & ApiError>(patchRoom as Handler, {
        path: `/api/rooms/${slug}`,
        method: 'PATCH',
        params: { slug },
        body: { theme },
        token,
    })

const renameRoom = (slug: string, name: unknown) =>
    call<RoomState & ApiError>(patchRoom as Handler, {
        path: `/api/rooms/${slug}`,
        method: 'PATCH',
        params: { slug },
        body: { name },
    })

beforeEach(async () => {
    await truncateAll()
    resetRateLimits()
    resetEvents()
})

afterEach(() => resetEvents())

describe('PATCH /api/rooms/:slug', () => {
    it('starts unthemed and says so on the wire', async () => {
        const { body } = await newRoom()
        expect(body.room.theme).toBeNull()
    })

    it('round-trips a theme through the room state', async () => {
        const { body: created } = await newRoom()
        const slug = created.room.slug

        const { status, body: patched } = await setTheme(slug, 'lavender')
        expect(status).toBe(200)
        expect(patched.room.theme).toBe('lavender')

        const { body: fetched } = await call<RoomState>(getRoom as Handler, {
            path: `/api/rooms/${slug}`,
            params: { slug },
        })
        expect(fetched.room.theme).toBe('lavender')
    })

    /**
     * The whole identity decision in one assertion. A theme is the least
     * consequential write in the product; gating it on a token would make it the
     * only room write a link-holder cannot make.
     */
    it('accepts the write from a bare link-holder, with no member token', async () => {
        const { body: created } = await newRoom()
        const { status, body } = await setTheme(created.room.slug, 'coral')
        expect(status).toBe(200)
        expect(body.room.theme).toBe('coral')
    })

    it('clears back to the default palette as null, not as the string', async () => {
        const { body: created } = await newRoom()
        const slug = created.room.slug
        await setTheme(slug, 'sky')

        const { body: cleared } = await setTheme(slug, null)
        expect(cleared.room.theme).toBeNull()
        // A room reset to default and a room never themed are the same row.
        const row = await prisma.room.findUnique({ where: { slug }, select: { theme: true } })
        expect(row?.theme).toBeNull()
    })

    it('refuses an empty settings body rather than resetting the room', async () => {
        const { body: created } = await newRoom()
        const slug = created.room.slug
        await setTheme(slug, 'mint')

        const { status, body } = await call<ApiError>(patchRoom as Handler, {
            path: `/api/rooms/${slug}`,
            method: 'PATCH',
            params: { slug },
            body: {},
        })
        expect(status).toBe(400)
        expect(body.error.code).toBe('VALIDATION_ERROR')
        const row = await prisma.room.findUnique({ where: { slug }, select: { theme: true } })
        expect(row?.theme).toBe('mint')
    })

    it('renames the display label without changing the permanent slug or palette', async () => {
        const { body: created } = await newRoom()
        const slug = created.room.slug
        await setTheme(slug, 'mint')

        const { status, body: renamed } = await renameRoom(slug, '  Summer escape  ')
        expect(status).toBe(200)
        expect(renamed.room.name).toBe('Summer escape')
        expect(renamed.room.slug).toBe(slug)
        expect(renamed.room.theme).toBe('mint')

        const row = await prisma.room.findUnique({
            where: { id: created.room.id },
            select: { name: true, slug: true, theme: true },
        })
        expect(row).toEqual({ name: 'Summer escape', slug, theme: 'mint' })

        const { body: fetched } = await call<RoomState>(getRoom as Handler, {
            path: `/api/rooms/${slug}`,
            params: { slug },
        })
        expect(fetched.room.name).toBe('Summer escape')
        expect(fetched.room.slug).toBe(slug)
    })

    it('rejects blank or oversized display names and leaves the room alone', async () => {
        const { body: created } = await newRoom()
        const slug = created.room.slug

        for (const invalidName of ['', '   ', 'x'.repeat(81)]) {
            const { status, body } = await renameRoom(slug, invalidName)
            expect(status).toBe(400)
            expect(body.error.code).toBe('VALIDATION_ERROR')
        }

        const row = await prisma.room.findUnique({ where: { slug }, select: { name: true } })
        expect(row?.name).toBe('Ski Trip')
    })

    it('rejects unknown settings instead of accepting a hidden slug rename', async () => {
        const { body: created } = await newRoom()
        const slug = created.room.slug

        const { status, body } = await call<ApiError>(patchRoom as Handler, {
            path: `/api/rooms/${slug}`,
            method: 'PATCH',
            params: { slug },
            body: { slug: 'different-room' },
        })
        expect(status).toBe(400)
        expect(body.error.code).toBe('VALIDATION_ERROR')

        const row = await prisma.room.findUnique({ where: { id: created.room.id }, select: { slug: true } })
        expect(row?.slug).toBe(slug)
    })

    it('rejects anything outside the catalog and leaves the room alone', async () => {
        const { body: created } = await newRoom()
        const slug = created.room.slug
        await setTheme(slug, 'mint')

        for (const junk of ['neon', '#FF0000', 'CLASSIC', '<script>', 'x'.repeat(80)]) {
            const { status, body } = await setTheme(slug, junk)
            expect(status, String(junk)).toBe(400)
            expect(body.error.code).toBe('VALIDATION_ERROR')
        }

        const { body: unchanged } = await call<RoomState>(getRoom as Handler, {
            path: `/api/rooms/${slug}`,
            params: { slug },
        })
        expect(unchanged.room.theme).toBe('mint')
    })

    /**
     * A repaint has to reach the other phones the same way an expense does.
     * Without the poke it is the slowest write in the product: a peer holding an
     * open stream polls at 45s, which is worse than the 8s it polled at before
     * the stream existed.
     */
    it('pokes the room so an open stream repaints instead of waiting for the poll', async () => {
        const { body: created } = await newRoom()
        let pokes = 0
        subscribe(created.room.id, () => {
            pokes += 1
        })

        await setTheme(created.room.slug, 'lavender')
        expect(pokes).toBe(1)
    })

    it('refuses to repaint an archived room', async () => {
        const { body: created } = await newRoom()
        await prisma.room.update({ where: { id: created.room.id }, data: { archivedAt: new Date() } })

        const { status, body } = await setTheme(created.room.slug, 'sand')
        expect(status).toBe(409)
        expect(body.error.code).toBe('ROOM_ARCHIVED')
    })
})

describe('the unfurl follows the room', () => {
    it('draws the themed colours, not the default ones', async () => {
        const { body: created } = await newRoom()
        const slug = created.room.slug

        const before = await loadRoomCard(slug)
        expect(before?.theme).toBe(DEFAULT_THEME)

        await setTheme(slug, 'graphite')
        const after = await loadRoomCard(slug)
        expect(after?.theme).toBe(themeFor('graphite'))
        expect(after?.theme.field).toBe('#E7E8E9')
    })
})
