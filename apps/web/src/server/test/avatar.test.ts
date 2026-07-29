/**
 * Member alter egos against the real handler and database.
 *
 * The room link deliberately permits group casting, but the freedom is bounded
 * twice: the target must belong to the room in the URL and the avatar must be a
 * key from the curated catalog. There is no free text or cross-room repaint.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma, truncateAll } from '@/server/test/db'
import { resetEvents, subscribe } from '@/server/events'
import { resetRateLimits } from '@/server/rateLimit'
import { AVATAR_KEYS } from '@/lib/avatars'
import { POST as postRoom } from '@/app/api/rooms/route'
import { POST as postMember } from '@/app/api/rooms/[slug]/members/route'
import { PATCH as patchMember } from '@/app/api/rooms/[slug]/members/[memberId]/route'
import type { ApiError, RoomState, RoomStateWithMember } from '@/lib/api-types'

const BASE = 'http://localhost'

type Params = Record<string, string>
type Handler = (request: Request, ctx: { params: Promise<Params> }) => Promise<Response>

const call = async <T>(
    handler: Handler,
    opts: { path: string; method?: string; body?: unknown; params?: Params }
): Promise<{ status: number; body: T }> => {
    const request = new Request(`${BASE}${opts.path}`, {
        method: opts.method ?? 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    })
    const res = await handler(request, { params: Promise.resolve(opts.params ?? {}) })
    return { status: res.status, body: (await res.json()) as T }
}

interface Fixture {
    slug: string
    roomId: string
    anaId: string
    brunoId: string
}

async function makeRoom(name = 'Ski Trip'): Promise<Fixture> {
    const { body: created } = await call<RoomStateWithMember>(postRoom as Handler, {
        path: '/api/rooms',
        method: 'POST',
        body: { name, emoji: 'ski', currency: 'EUR', creatorName: 'Ana' },
    })
    const slug = created.room.slug
    const { body: joined } = await call<RoomStateWithMember>(postMember as Handler, {
        path: `/api/rooms/${slug}/members`,
        method: 'POST',
        params: { slug },
        body: { name: 'Bruno' },
    })
    return { slug, roomId: created.room.id, anaId: created.memberId, brunoId: joined.memberId }
}

const setAvatar = (fixture: Fixture, memberId: string, body: { avatar: string | null } | Record<string, never>) =>
    call<RoomState & ApiError>(patchMember as Handler, {
        path: `/api/rooms/${fixture.slug}/members/${memberId}`,
        method: 'PATCH',
        params: { slug: fixture.slug, memberId },
        body,
    })

const avatarOf = (state: RoomState, memberId: string) =>
    state.members.find((member) => member.id === memberId)?.avatar ?? null

beforeEach(async () => {
    await truncateAll()
    resetRateLimits()
    resetEvents()
})

afterEach(() => resetEvents())

describe('PATCH /api/rooms/:slug/members/:memberId', () => {
    it('lets the table cast any member and returns the whole room', async () => {
        const fixture = await makeRoom()
        const { status, body } = await setAvatar(fixture, fixture.brunoId, { avatar: 'vampire-penguin' })

        expect(status).toBe(200)
        expect(avatarOf(body, fixture.brunoId)).toBe('vampire-penguin')
        expect(avatarOf(body, fixture.anaId)).toBeNull()
    })

    it('clears a pick back to the stable name-derived surprise', async () => {
        const fixture = await makeRoom()
        await setAvatar(fixture, fixture.anaId, { avatar: 'astronaut-avocado' })
        const { status, body } = await setAvatar(fixture, fixture.anaId, { avatar: null })

        expect(status).toBe(200)
        expect(avatarOf(body, fixture.anaId)).toBeNull()
        expect((await prisma.member.findUnique({ where: { id: fixture.anaId } }))?.avatar).toBeNull()
    })

    it('will not repaint a made-up member or a member from another room', async () => {
        const fixture = await makeRoom()
        const other = await makeRoom('Beach Trip')

        for (const memberId of ['ghost', other.anaId]) {
            const { status, body } = await setAvatar(fixture, memberId, { avatar: 'pirate-parrot' })
            expect(status).toBe(404)
            expect(body.error.code).toBe('NOT_FOUND')
        }
        expect((await prisma.member.findUnique({ where: { id: other.anaId } }))?.avatar).toBeNull()
    })

    it('rejects anything outside the curated catalog', async () => {
        const fixture = await makeRoom()
        for (const avatar of [
            'face-nope',
            'mountain',
            '<script>alert(1)</script>',
            'https://example.com/me.png',
            '',
            'VAMPIRE-PENGUIN',
        ]) {
            const { status, body } = await setAvatar(fixture, fixture.anaId, { avatar })
            expect(status, avatar).toBe(400)
            expect(body.error.code).toBe('VALIDATION_ERROR')
        }
        expect((await prisma.member.findUnique({ where: { id: fixture.anaId } }))?.avatar).toBeNull()
    })

    it('rejects inherited object keys', async () => {
        const fixture = await makeRoom()
        for (const avatar of ['constructor', 'toString', '__proto__']) {
            const { status } = await setAvatar(fixture, fixture.anaId, { avatar })
            expect(status, avatar).toBe(400)
        }
    })

    it('accepts every key the picker can produce', async () => {
        const fixture = await makeRoom()
        for (const avatar of AVATAR_KEYS) {
            const { status } = await setAvatar(fixture, fixture.anaId, { avatar })
            expect(status, avatar).toBe(200)
        }
        expect((await prisma.member.findUnique({ where: { id: fixture.anaId } }))?.avatar).toBe(
            AVATAR_KEYS[AVATAR_KEYS.length - 1]
        )
    })

    it('does not let a missing avatar field silently reset the row', async () => {
        const fixture = await makeRoom()
        const { status } = await setAvatar(fixture, fixture.anaId, {})
        expect(status).toBe(400)
    })
})

describe('an alter ego reaches the other phones', () => {
    it('pokes the room after a valid write and not after a rejected one', async () => {
        const fixture = await makeRoom()
        let pokes = 0
        subscribe(fixture.roomId, () => {
            pokes += 1
        })

        await setAvatar(fixture, fixture.anaId, { avatar: 'cosmic-llama' })
        expect(pokes).toBe(1)

        await setAvatar(fixture, fixture.anaId, { avatar: 'not-in-the-cast' })
        expect(pokes).toBe(1)
    })
})
