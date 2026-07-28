/**
 * Member avatars against the real handler and the real database.
 *
 * One rule carries the feature and it is pinned three ways: the write needs a
 * token-PROVEN member (a room's ledger deliberately does not), the member is
 * named in the PATH so there is no request shape that reaches somebody else's
 * row, and the value is checked against the catalog rather than stored as text.
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
    ana: { id: string; token: string }
    bruno: { id: string; token: string }
}

async function makeRoom(): Promise<Fixture> {
    const { body: created } = await call<RoomStateWithMember>(postRoom as Handler, {
        path: '/api/rooms',
        method: 'POST',
        body: { name: 'Ski Trip', emoji: 'ski', currency: 'EUR', creatorName: 'Ana' },
    })
    const slug = created.room.slug
    const { body: joined } = await call<RoomStateWithMember>(postMember as Handler, {
        path: `/api/rooms/${slug}/members`,
        method: 'POST',
        params: { slug },
        body: { name: 'Bruno' },
    })
    return {
        slug,
        roomId: created.room.id,
        ana: { id: created.memberId, token: created.memberToken },
        bruno: { id: joined.memberId, token: joined.memberToken },
    }
}

const setAvatar = (fixture: Fixture, memberId: string, body: { avatar: string | null; memberToken: string }) =>
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
    it('sets your own avatar and hands back the whole room', async () => {
        const fixture = await makeRoom()
        const { status, body } = await setAvatar(fixture, fixture.ana.id, {
            avatar: 'face-bun',
            memberToken: fixture.ana.token,
        })

        expect(status).toBe(200)
        expect(avatarOf(body, fixture.ana.id)).toBe('face-bun')
        // Nobody else moved.
        expect(avatarOf(body, fixture.bruno.id)).toBeNull()
    })

    /** Null is the name-derived portrait, and it is a real value to send — the
     *  first tile in the picker stores it. */
    it('clears back to the name-derived portrait', async () => {
        const fixture = await makeRoom()
        await setAvatar(fixture, fixture.ana.id, { avatar: 'doodle-dog', memberToken: fixture.ana.token })
        const { status, body } = await setAvatar(fixture, fixture.ana.id, {
            avatar: null,
            memberToken: fixture.ana.token,
        })

        expect(status).toBe(200)
        expect(avatarOf(body, fixture.ana.id)).toBeNull()
        expect((await prisma.member.findUnique({ where: { id: fixture.ana.id } }))?.avatar).toBeNull()
    })

    /**
     * THE identity decision. Anyone holding the room link can write an expense in
     * Ana's name, because inside a room that is visible and fixable. Nobody can
     * change what Ana looks like to her friends.
     */
    it('refuses a member the caller cannot prove they are', async () => {
        const fixture = await makeRoom()
        const { status, body } = await setAvatar(fixture, fixture.ana.id, {
            avatar: 'face-cap',
            memberToken: fixture.bruno.token,
        })

        expect(status).toBe(403)
        expect(body.error.code).toBe('MEMBER_TOKEN_INVALID')
        expect((await prisma.member.findUnique({ where: { id: fixture.ana.id } }))?.avatar).toBeNull()
    })

    it('refuses a made-up token and a made-up member alike', async () => {
        const fixture = await makeRoom()
        for (const attempt of [
            { memberId: fixture.ana.id, memberToken: 'not-a-token' },
            { memberId: 'ghost', memberToken: fixture.ana.token },
        ]) {
            const { status } = await setAvatar(fixture, attempt.memberId, {
                avatar: 'face-cap',
                memberToken: attempt.memberToken,
            })
            expect(status).toBe(403)
        }
        expect((await prisma.member.findUnique({ where: { id: fixture.ana.id } }))?.avatar).toBeNull()
    })

    /** A key, never text. The column renders next to a person's name on everyone
     *  else's phone, so anything outside the catalog is a 400 and not a row. */
    it('rejects anything that is not in the catalog', async () => {
        const fixture = await makeRoom()
        for (const avatar of [
            'face-nope',
            'mountain', // a real doodle, but not an offered avatar
            '<script>alert(1)</script>',
            'https://example.com/me.png',
            '',
            'FACE-BUN',
        ]) {
            const { status, body } = await setAvatar(fixture, fixture.ana.id, {
                avatar,
                memberToken: fixture.ana.token,
            })
            expect(status, avatar).toBe(400)
            expect(body.error.code).toBe('VALIDATION_ERROR')
        }
        expect((await prisma.member.findUnique({ where: { id: fixture.ana.id } }))?.avatar).toBeNull()
    })

    /** Prototype keys are not catalog keys — `'constructor' in AVATARS` is true
     *  for every object, which is why the guard uses `hasOwnProperty`. */
    it('rejects inherited object keys', async () => {
        const fixture = await makeRoom()
        for (const avatar of ['constructor', 'toString', '__proto__']) {
            const { status } = await setAvatar(fixture, fixture.ana.id, {
                avatar,
                memberToken: fixture.ana.token,
            })
            expect(status, avatar).toBe(400)
        }
    })

    it('accepts every key the picker can produce', async () => {
        const fixture = await makeRoom()
        for (const avatar of AVATAR_KEYS) {
            const { status } = await setAvatar(fixture, fixture.ana.id, {
                avatar,
                memberToken: fixture.ana.token,
            })
            expect(status, avatar).toBe(200)
        }
        expect((await prisma.member.findUnique({ where: { id: fixture.ana.id } }))?.avatar).toBe(
            AVATAR_KEYS[AVATAR_KEYS.length - 1]
        )
    })

    /** A missing field must not silently reset a face — the same rule the theme
     *  PATCH follows, for the same reason. */
    it('refuses a body with no avatar field at all', async () => {
        const fixture = await makeRoom()
        const { status } = await setAvatar(fixture, fixture.ana.id, { memberToken: fixture.ana.token } as {
            avatar: string | null
            memberToken: string
        })
        expect(status).toBe(400)
    })
})

/**
 * A face that only travels on the poll lands up to 45s late on a phone holding
 * an open stream — slower than the 8s it managed before the stream existed,
 * which is the shape of the regression this pins.
 */
describe('an avatar reaches the other phones', () => {
    it('pokes the room after the write, and not for a write it refused', async () => {
        const fixture = await makeRoom()
        let pokes = 0
        subscribe(fixture.roomId, () => {
            pokes += 1
        })

        await setAvatar(fixture, fixture.ana.id, { avatar: 'doodle-sun', memberToken: fixture.ana.token })
        expect(pokes).toBe(1)

        await setAvatar(fixture, fixture.ana.id, { avatar: 'doodle-sun', memberToken: fixture.bruno.token })
        expect(pokes).toBe(1)
    })
})
