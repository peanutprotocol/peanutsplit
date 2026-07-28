/**
 * The accounts routes against the real database, same as `api.test.ts`: route
 * handlers are plain functions, so there is no server to stand up.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma, truncateAll } from '@/server/test/db'
import { resetRateLimits } from '@/server/rateLimit'
import { POST as postRoom } from '@/app/api/rooms/route'
import { POST as postMember } from '@/app/api/rooms/[slug]/members/route'
import { POST as requestLink } from '@/app/api/auth/request-link/route'
import { GET as verifyPage, POST as verify } from '@/app/api/auth/verify/route'
import { GET as me } from '@/app/api/auth/me/route'
import { POST as logout } from '@/app/api/auth/logout/route'
import { POST as attach } from '@/app/api/auth/attach/route'
import { GET as rooms } from '@/app/api/auth/rooms/route'
import type { AccountRoom, AttachResult } from '@/server/accounts'
import type { ApiError, RoomStateWithMember } from '@/lib/api-types'

const BASE = 'http://localhost'

type Params = Record<string, string>
type Handler = (request: Request, ctx: { params: Promise<Params> }) => Promise<Response>

const request = (opts: { path: string; method?: string; body?: unknown; cookie?: string }): Request =>
    new Request(`${BASE}${opts.path}`, {
        method: opts.method ?? 'GET',
        headers: {
            'Content-Type': 'application/json',
            ...(opts.cookie ? { Cookie: opts.cookie } : {}),
        },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    })

const call = async <T>(
    handler: Handler,
    opts: { path: string; method?: string; body?: unknown; params?: Params; cookie?: string }
): Promise<{ status: number; body: T; response: Response }> => {
    const response = await handler(request(opts), { params: Promise.resolve(opts.params ?? {}) })
    return { status: response.status, body: (await response.clone().json()) as T, response }
}

/** `ps-session=…`, ready to hand back as a Cookie header. */
const sessionCookieOf = (response: Response): string => {
    const header = response.headers.getSetCookie().find((value) => value.startsWith('ps-session='))
    if (!header) throw new Error('no session cookie was set')
    return header.split(';')[0]
}

/**
 * Walks the real request-link flow and lifts the token out of the line the
 * unconfigured email adapter prints — the same path a developer uses locally.
 */
const requestLinkFor = async (email: string): Promise<string> => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { status, body } = await call<{ ok: boolean }>(requestLink as Handler, {
        path: '/api/auth/request-link',
        method: 'POST',
        body: { email },
    })
    expect(status).toBe(200)
    expect(body).toEqual({ ok: true })

    const printed = log.mock.calls.map((args) => String(args[0])).find((line) => line.includes('/api/auth/verify'))
    log.mockRestore()
    if (!printed) throw new Error('no magic link was printed')
    return new URL(printed.slice(printed.indexOf('http'))).searchParams.get('token') ?? ''
}

/** Signs in for real and returns the cookie the browser would keep. */
const signIn = async (email: string): Promise<string> => {
    const token = await requestLinkFor(email)
    const response = await verify(
        request({ path: `/api/auth/verify?token=${encodeURIComponent(token)}`, method: 'POST' })
    )
    expect(response.status).toBe(303)
    return sessionCookieOf(response)
}

/** A room plus the creator's one-time token — the localStorage identity an
 *  account is trying to rescue. */
const newRoom = async (name: string, creatorName: string) => {
    const { body } = await call<RoomStateWithMember>(postRoom as Handler, {
        path: '/api/rooms',
        method: 'POST',
        body: { name, emoji: '🎿', currency: 'EUR', creatorName },
    })
    return { slug: body.room.slug, memberId: body.memberId, memberToken: body.memberToken }
}

beforeEach(async () => {
    await truncateAll()
    resetRateLimits()
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('requesting a magic link', () => {
    it('creates an account for an address it has never seen', async () => {
        await requestLinkFor('ana@example.com')
        const user = await prisma.user.findUnique({ where: { email: 'ana@example.com' } })
        expect(user?.emailVerifiedAt).toBeNull()
        expect(user?.tokenEpoch).toBe(0)
    })

    it('reuses the account on the second ask, and normalises the address', async () => {
        await requestLinkFor('ana@example.com')
        await requestLinkFor('  ANA@Example.com ')
        expect(await prisma.user.count()).toBe(1)
    })

    it('answers the same either way — an unknown address is not distinguishable', async () => {
        vi.spyOn(console, 'log').mockImplementation(() => {})
        const unknown = await call<{ ok: boolean }>(requestLink as Handler, {
            path: '/api/auth/request-link',
            method: 'POST',
            body: { email: 'nobody@example.com' },
        })
        const known = await call<{ ok: boolean }>(requestLink as Handler, {
            path: '/api/auth/request-link',
            method: 'POST',
            body: { email: 'nobody@example.com' },
        })
        expect(unknown.body).toEqual(known.body)
        expect(unknown.status).toBe(known.status)
    })

    it('rejects something that is not an address', async () => {
        const { status, body } = await call<ApiError>(requestLink as Handler, {
            path: '/api/auth/request-link',
            method: 'POST',
            body: { email: 'ana' },
        })
        expect(status).toBe(400)
        expect(body.error.code).toBe('VALIDATION_ERROR')
        expect(await prisma.user.count()).toBe(0)
    })

    it('stops after three in an hour', async () => {
        vi.spyOn(console, 'log').mockImplementation(() => {})
        for (let i = 0; i < 3; i++) {
            const { status } = await call(requestLink as Handler, {
                path: '/api/auth/request-link',
                method: 'POST',
                body: { email: `ana${i}@example.com` },
            })
            expect(status).toBe(200)
        }
        const { status, body } = await call<ApiError>(requestLink as Handler, {
            path: '/api/auth/request-link',
            method: 'POST',
            body: { email: 'ana4@example.com' },
        })
        expect(status).toBe(429)
        expect(body.error.code).toBe('RATE_LIMITED')
    })
})

describe('spending a magic link', () => {
    it('GET renders a form and changes nothing — mail scanners get here first', async () => {
        const token = await requestLinkFor('ana@example.com')
        const before = await prisma.user.findUniqueOrThrow({ where: { email: 'ana@example.com' } })

        const response = verifyPage(request({ path: `/api/auth/verify?token=${encodeURIComponent(token)}` }))
        const html = await response.text()

        expect(response.status).toBe(200)
        expect(response.headers.get('Content-Type')).toContain('text/html')
        expect(html).toContain('name="robots" content="noindex, nofollow"')
        expect(html).toContain('method="POST"')
        expect(response.headers.getSetCookie()).toHaveLength(0)

        const after = await prisma.user.findUniqueOrThrow({ where: { email: 'ana@example.com' } })
        expect(after.tokenEpoch).toBe(before.tokenEpoch)
        expect(after.emailVerifiedAt).toBeNull()
    })

    it('GET escapes the token instead of pasting it into the markup', () => {
        const html = verifyPage(request({ path: '/api/auth/verify?token=%22%3E%3Cscript%3E' }))
        return expect(html.text()).resolves.not.toContain('<script>')
    })

    it('POST signs you in, marks the address verified and redirects', async () => {
        const token = await requestLinkFor('ana@example.com')
        const response = await verify(
            request({ path: `/api/auth/verify?token=${encodeURIComponent(token)}`, method: 'POST' })
        )

        expect(response.status).toBe(303)
        expect(response.headers.get('Location')).toBe('/?login=1')
        expect(sessionCookieOf(response)).toMatch(/^ps-session=.+/)
        expect(response.headers.getSetCookie()[0]).toContain('HttpOnly')
        expect(response.headers.getSetCookie()[0]).toContain('SameSite=Lax')
        // Ten years, explicitly — an omitted Max-Age is a session cookie, and iOS
        // drops those whenever it evicts the PWA.
        expect(response.headers.getSetCookie()[0]).toContain('Max-Age=315360000')

        const user = await prisma.user.findUniqueOrThrow({ where: { email: 'ana@example.com' } })
        expect(user.emailVerifiedAt).not.toBeNull()
        expect(user.tokenEpoch).toBe(1)
    })

    it('is dead the second time — the epoch has moved on', async () => {
        const token = await requestLinkFor('ana@example.com')
        const path = `/api/auth/verify?token=${encodeURIComponent(token)}`

        expect((await verify(request({ path, method: 'POST' }))).status).toBe(303)

        const replay = await verify(request({ path, method: 'POST' }))
        expect(replay.status).toBe(400)
        expect(((await replay.json()) as ApiError).error.code).toBe('INVALID_LOGIN_TOKEN')
    })

    it('refuses a token that was never signed here', async () => {
        const response = await verify(request({ path: '/api/auth/verify?token=made-up', method: 'POST' }))
        expect(response.status).toBe(400)
    })
})

describe('session', () => {
    it('reports nobody when there is no cookie', async () => {
        const { status, body } = await call<null>(me as Handler, { path: '/api/auth/me' })
        expect(status).toBe(200)
        expect(body).toBeNull()
    })

    it('reports the account behind the cookie', async () => {
        const cookie = await signIn('ana@example.com')
        const { body } = await call<{ userId: string; email: string }>(me as Handler, {
            path: '/api/auth/me',
            cookie,
        })
        expect(body.email).toBe('ana@example.com')
        expect(body.userId).toBeTruthy()
    })

    it('logout unsets the cookie', async () => {
        const response = await logout()
        expect(response.headers.getSetCookie()[0]).toContain('Max-Age=0')
    })

    it('a cookie whose account is gone is a 401 that also clears it', async () => {
        const cookie = await signIn('ana@example.com')
        await prisma.user.deleteMany({})

        const { status, body, response } = await call<ApiError>(rooms as Handler, { path: '/api/auth/rooms', cookie })
        expect(status).toBe(401)
        expect(body.error.code).toBe('SESSION_EXPIRED')
        expect(response.headers.getSetCookie()[0]).toContain('Max-Age=0')
    })
})

describe('attaching this device to the account', () => {
    it('needs a session', async () => {
        const { status, body } = await call<ApiError>(attach as Handler, {
            path: '/api/auth/attach',
            method: 'POST',
            body: { memberships: [{ slug: 'x', memberId: 'y', token: 'z' }] },
        })
        expect(status).toBe(401)
        expect(body.error.code).toBe('UNAUTHENTICATED')
    })

    it('links a membership whose token proves it, and is idempotent', async () => {
        const room = await newRoom('Ski Trip', 'Ana')
        const cookie = await signIn('ana@example.com')
        const membership = { slug: room.slug, memberId: room.memberId, token: room.memberToken }

        const first = await call<{ results: AttachResult[] }>(attach as Handler, {
            path: '/api/auth/attach',
            method: 'POST',
            cookie,
            body: { memberships: [membership] },
        })
        expect(first.body.results).toEqual([{ slug: room.slug, memberId: room.memberId, outcome: 'linked' }])

        const again = await call<{ results: AttachResult[] }>(attach as Handler, {
            path: '/api/auth/attach',
            method: 'POST',
            cookie,
            body: { memberships: [membership] },
        })
        expect(again.body.results[0].outcome).toBe('linked')

        const member = await prisma.member.findUniqueOrThrow({ where: { id: room.memberId } })
        expect(member.userId).toBeTruthy()
    })

    it('will not link a claimed identity that has no token behind it', async () => {
        const room = await newRoom('Ski Trip', 'Ana')
        const bea = await call<{ memberId: string; memberToken: string }>(postMember as Handler, {
            path: `/api/rooms/${room.slug}/members`,
            method: 'POST',
            params: { slug: room.slug },
            body: { name: 'Bea' },
        })
        const cookie = await signIn('mallory@example.com')

        // "I'm Bea" on the join gate stores no token, so the best an impersonator
        // can send is somebody else's — or a guess.
        const { body } = await call<{ results: AttachResult[] }>(attach as Handler, {
            path: '/api/auth/attach',
            method: 'POST',
            cookie,
            body: {
                memberships: [
                    { slug: room.slug, memberId: bea.body.memberId, token: 'not-the-token' },
                    { slug: room.slug, memberId: bea.body.memberId, token: room.memberToken },
                ],
            },
        })
        expect(body.results.map((r) => r.outcome)).toEqual(['token-mismatch', 'token-mismatch'])

        const member = await prisma.member.findUniqueOrThrow({ where: { id: bea.body.memberId } })
        expect(member.userId).toBeNull()
    })

    it('never steals a membership that already belongs to someone else', async () => {
        const room = await newRoom('Ski Trip', 'Ana')
        const membership = { slug: room.slug, memberId: room.memberId, token: room.memberToken }

        const anaCookie = await signIn('ana@example.com')
        await call(attach as Handler, {
            path: '/api/auth/attach',
            method: 'POST',
            cookie: anaCookie,
            body: { memberships: [membership] },
        })

        resetRateLimits()
        const malloryCookie = await signIn('mallory@example.com')
        const { body } = await call<{ results: AttachResult[] }>(attach as Handler, {
            path: '/api/auth/attach',
            method: 'POST',
            cookie: malloryCookie,
            body: { memberships: [membership] },
        })
        expect(body.results[0].outcome).toBe('already-linked')

        const ana = await prisma.user.findUniqueOrThrow({ where: { email: 'ana@example.com' } })
        const member = await prisma.member.findUniqueOrThrow({ where: { id: room.memberId } })
        expect(member.userId).toBe(ana.id)
    })

    it('skips the bad entries and keeps the good ones', async () => {
        const room = await newRoom('Ski Trip', 'Ana')
        const cookie = await signIn('ana@example.com')

        const { body } = await call<{ results: AttachResult[] }>(attach as Handler, {
            path: '/api/auth/attach',
            method: 'POST',
            cookie,
            body: {
                memberships: [
                    { slug: 'gone-forever', memberId: room.memberId, token: room.memberToken },
                    { slug: room.slug, memberId: room.memberId, token: room.memberToken },
                ],
            },
        })
        expect(body.results.map((r) => r.outcome)).toEqual(['token-mismatch', 'linked'])
    })
})

describe('reopening rooms on a new device', () => {
    it('hands the member token back to the account that proved it owns it', async () => {
        const first = await newRoom('Ski Trip', 'Ana')
        const second = await newRoom('Beach House', 'Ana')
        const cookie = await signIn('ana@example.com')

        await call(attach as Handler, {
            path: '/api/auth/attach',
            method: 'POST',
            cookie,
            body: {
                memberships: [
                    { slug: first.slug, memberId: first.memberId, token: first.memberToken },
                    { slug: second.slug, memberId: second.memberId, token: second.memberToken },
                ],
            },
        })

        const { status, body } = await call<{ rooms: AccountRoom[] }>(rooms as Handler, {
            path: '/api/auth/rooms',
            cookie,
        })
        expect(status).toBe(200)
        // Newest first — the trip you are on now is the one you came back for.
        expect(body.rooms.map((room) => room.slug)).toEqual([second.slug, first.slug])
        expect(body.rooms[0]).toMatchObject({
            name: 'Beach House',
            memberId: second.memberId,
            memberName: 'Ana',
            memberToken: second.memberToken,
        })
    })

    it('is empty for an account that has attached nothing', async () => {
        await newRoom('Ski Trip', 'Ana')
        const cookie = await signIn('ana@example.com')
        const { body } = await call<{ rooms: AccountRoom[] }>(rooms as Handler, { path: '/api/auth/rooms', cookie })
        expect(body.rooms).toEqual([])
    })
})
