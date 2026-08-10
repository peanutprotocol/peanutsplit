import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { DELETE as acknowledge, POST as redeem } from '@/app/api/install-handoff/route'
import { POST as prepare } from '@/app/api/rooms/[slug]/install-handoff/route'
import { POST as postRoom } from '@/app/api/rooms/route'
import type { ApiError, RoomStateWithMember } from '@/lib/api-types'
import {
    INSTALL_HANDOFF_COOKIE,
    INSTALL_HANDOFF_READY_COOKIE,
    INSTALL_HANDOFF_TTL_SECONDS,
    MAX_OUTSTANDING_INSTALL_HANDOFFS_PER_ROOM,
    pruneExpiredInstallHandoffs,
    type InstallHandoffPayload,
} from '@/server/installHandoff'
import { resetRateLimits } from '@/server/rateLimit'
import { prisma, truncateAll } from '@/server/test/db'

const ORIGIN = 'http://localhost'

const request = (
    path: string,
    method: 'POST' | 'DELETE',
    options: {
        body?: unknown
        token?: string
        cookie?: string
        origin?: string | null
        contentType?: string | null
    } = {}
): Request => {
    const headers: Record<string, string> = {
        ...(options.origin === null ? {} : { Origin: options.origin ?? ORIGIN }),
        ...(options.contentType === null ? {} : { 'Content-Type': options.contentType ?? 'application/json' }),
        ...(options.token ? { 'X-Member-Token': options.token } : {}),
        ...(options.cookie ? { Cookie: options.cookie } : {}),
    }
    return new Request(`${ORIGIN}${path}`, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
}

const createRoom = async (name = 'Install trip'): Promise<RoomStateWithMember> => {
    const response = await postRoom(
        request('/api/rooms', 'POST', {
            body: { name, currency: 'EUR', creatorName: 'Ana' },
        })
    )
    expect(response.status).toBe(201)
    return (await response.json()) as RoomStateWithMember
}

const prepareRoom = async (
    room: RoomStateWithMember,
    options: { token?: string; cookie?: string; origin?: string | null; body?: unknown; contentType?: string } = {}
): Promise<Response> =>
    prepare(
        request(`/api/rooms/${room.room.slug}/install-handoff`, 'POST', {
            body: options.body ?? {},
            token: options.token,
            cookie: options.cookie,
            origin: options.origin,
            contentType: options.contentType,
        }),
        { params: Promise.resolve({ slug: room.room.slug }) }
    )

const setCookies = (headers: Headers): string[] => {
    const extended = headers as Headers & { getSetCookie?: () => string[] }
    if (extended.getSetCookie) return extended.getSetCookie()
    // Node versions without getSetCookie combine the fields. The next cookie
    // always starts with __Host-, while the comma inside Expires does not.
    return (
        headers
            .get('set-cookie')
            ?.split(/,(?=\s*__Host-)/)
            .map((value) => value.trim()) ?? []
    )
}

const cookieNamed = (headers: Headers, name: string): string => {
    const header = setCookies(headers).find((value) => value.startsWith(`${name}=`))
    expect(header, `${name} Set-Cookie`).toBeTruthy()
    return header as string
}

const preparedCookies = (response: Response): { rawToken: string; requestCookie: string } => {
    const secret = cookieNamed(response.headers, INSTALL_HANDOFF_COOKIE)
    const ready = cookieNamed(response.headers, INSTALL_HANDOFF_READY_COOKIE)
    const rawToken = secret.slice(INSTALL_HANDOFF_COOKIE.length + 1).split(';', 1)[0]
    return {
        rawToken,
        requestCookie: `${INSTALL_HANDOFF_COOKIE}=${rawToken}; ${INSTALL_HANDOFF_READY_COOKIE}=1`,
    }
}

const redeemWith = (cookie?: string, options: { origin?: string | null; body?: unknown } = {}): Promise<Response> =>
    redeem(
        request('/api/install-handoff', 'POST', {
            body: options.body ?? {},
            cookie,
            origin: options.origin,
        })
    )

const acknowledgeWith = (cookie?: string, origin?: string | null): Promise<Response> =>
    acknowledge(request('/api/install-handoff', 'DELETE', { cookie, origin, contentType: null }))

const digest = (rawToken: string): string =>
    createHash('sha256').update(`split-install-handoff\0${rawToken}`).digest('hex')

const memberDigest = (memberToken: string): string =>
    createHash('sha256').update(`split-install-member-proof\0${memberToken}`).digest('hex')

beforeEach(async () => {
    await truncateAll()
    resetRateLimits()
})

describe('iOS install handoff', () => {
    it('stores only a hash, emits hardened host cookies, peeks idempotently, then ACKs idempotently', async () => {
        const room = await createRoom()
        const prepared = await prepareRoom(room, { token: room.memberToken })
        expect(prepared.status).toBe(201)
        expect(await prepared.clone().json()).toEqual({ prepared: true })
        expect(prepared.headers.get('cache-control')).toBe('private, no-store')

        const secretHeader = cookieNamed(prepared.headers, INSTALL_HANDOFF_COOKIE)
        const readyHeader = cookieNamed(prepared.headers, INSTALL_HANDOFF_READY_COOKIE)
        const { rawToken, requestCookie } = preparedCookies(prepared)
        expect(rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
        expect(secretHeader).toContain('HttpOnly')
        expect(readyHeader).not.toContain('HttpOnly')
        for (const header of [secretHeader, readyHeader]) {
            expect(header).toContain('Path=/')
            expect(header).toContain(`Max-Age=${INSTALL_HANDOFF_TTL_SECONDS}`)
            expect(header).toContain('Secure')
            expect(header).toContain('SameSite=Strict')
            expect(header.toLowerCase()).not.toContain('domain=')
        }

        const durable = await prisma.installHandoff.findFirstOrThrow()
        expect(durable.tokenHash).toBe(digest(rawToken))
        expect(JSON.stringify(durable)).not.toContain(rawToken)
        expect(durable.roomId).toBe(room.room.id)
        expect(durable.memberId).toBe(room.memberId)
        expect(durable.memberTokenHash).toBe(memberDigest(room.memberToken))
        expect(JSON.stringify(durable)).not.toContain(room.memberToken)
        expect(durable.expiresAt.getTime() - durable.createdAt.getTime()).toBeGreaterThan(
            (INSTALL_HANDOFF_TTL_SECONDS - 5) * 1000
        )

        const first = await redeemWith(requestCookie)
        const second = await redeemWith(requestCookie)
        expect(first.status).toBe(200)
        expect(second.status).toBe(200)
        expect(first.headers.get('cache-control')).toBe('private, no-store')
        const payload = (await first.json()) as InstallHandoffPayload
        expect(payload).toEqual({
            room: {
                slug: room.room.slug,
                name: room.room.name,
                emoji: room.room.emoji,
                theme: room.room.theme,
            },
            identity: { memberId: room.memberId, name: 'Ana', token: room.memberToken },
        })
        expect(await second.json()).toEqual(payload)
        expect(JSON.stringify({ prepared: true })).not.toContain(rawToken)
        expect(await prisma.installHandoff.count()).toBe(1)

        const [ackA, ackB] = await Promise.all([acknowledgeWith(requestCookie), acknowledgeWith(requestCookie)])
        expect(ackA.status).toBe(204)
        expect(ackB.status).toBe(204)
        expect(ackA.headers.get('cache-control')).toBe('private, no-store')
        expect(await prisma.installHandoff.count()).toBe(0)
        for (const header of setCookies(ackA.headers)) expect(header).toContain('Max-Age=0')

        const afterAck = await redeemWith(requestCookie)
        expect(afterAck.status).toBe(404)
        expect((await afterAck.json()) as ApiError).toEqual({
            error: { code: 'INSTALL_HANDOFF_UNAVAILABLE', message: 'this install handoff is unavailable' },
        })
    })

    it('restores a room without inventing identity when preparation had no proof', async () => {
        const room = await createRoom()
        const prepared = await prepareRoom(room)
        const { requestCookie } = preparedCookies(prepared)

        const response = await redeemWith(requestCookie)
        expect(response.status).toBe(200)
        expect(((await response.json()) as InstallHandoffPayload).identity).toBeNull()
        expect(await prisma.installHandoff.findFirstOrThrow()).toMatchObject({
            memberId: null,
            memberTokenHash: null,
        })
    })

    it('drops a member viewpoint that became Former while keeping current room presentation', async () => {
        const room = await createRoom()
        const prepared = await prepareRoom(room, { token: room.memberToken })
        const { requestCookie } = preparedCookies(prepared)

        await prisma.room.update({
            where: { id: room.room.id },
            data: { name: 'Renamed after install', emoji: 'plane', theme: 'coral' },
        })
        await prisma.member.update({ where: { id: room.memberId }, data: { removedAt: new Date() } })

        const response = await redeemWith(requestCookie)
        expect(await response.json()).toEqual({
            room: { slug: room.room.slug, name: 'Renamed after install', emoji: 'plane', theme: 'coral' },
            identity: null,
        })
    })

    it('does not upgrade a stale handoff to a rotated proof after a member is restored', async () => {
        const room = await createRoom()
        const prepared = await prepareRoom(room, { token: room.memberToken })
        const { requestCookie } = preparedCookies(prepared)
        const rotatedToken = 'rotated-member-proof-that-is-not-the-prepared-proof'

        await prisma.member.update({
            where: { id: room.memberId },
            data: { removedAt: new Date() },
        })
        await prisma.member.update({
            where: { id: room.memberId },
            data: { removedAt: null, token: rotatedToken },
        })

        const response = await redeemWith(requestCookie)
        expect(response.status).toBe(200)
        expect((await response.json()) as InstallHandoffPayload).toEqual({
            room: {
                slug: room.room.slug,
                name: room.room.name,
                emoji: room.room.emoji,
                theme: room.room.theme,
            },
            identity: null,
        })
    })

    it('rejects an invalid or Former supplied proof instead of degrading it to room-only', async () => {
        const room = await createRoom()

        const invalid = await prepareRoom(room, { token: 'not-this-room-token' })
        expect(invalid.status).toBe(403)
        expect(((await invalid.json()) as ApiError).error.code).toBe('MEMBER_TOKEN_INVALID')
        expect(setCookies(invalid.headers)).toEqual([])
        expect(await prisma.installHandoff.count()).toBe(0)

        await prisma.member.update({ where: { id: room.memberId }, data: { removedAt: new Date() } })
        const former = await prepareRoom(room, { token: room.memberToken })
        expect(former.status).toBe(403)
        expect(((await former.json()) as ApiError).error.code).toBe('MEMBER_TOKEN_INVALID')
        expect(await prisma.installHandoff.count()).toBe(0)
    })

    it('re-preparing in the same browser invalidates its previous room handoff', async () => {
        const firstRoom = await createRoom('First install room')
        const secondRoom = await createRoom('Second install room')
        const firstPrepared = await prepareRoom(firstRoom, { token: firstRoom.memberToken })
        const firstCookies = preparedCookies(firstPrepared)

        const secondPrepared = await prepareRoom(secondRoom, {
            token: secondRoom.memberToken,
            cookie: firstCookies.requestCookie,
        })
        const secondCookies = preparedCookies(secondPrepared)
        expect(secondCookies.rawToken).not.toBe(firstCookies.rawToken)
        expect(await prisma.installHandoff.count()).toBe(1)

        expect((await redeemWith(firstCookies.requestCookie)).status).toBe(404)
        const current = await redeemWith(secondCookies.requestCookie)
        expect(current.status).toBe(200)
        expect(((await current.json()) as InstallHandoffPayload).room.slug).toBe(secondRoom.room.slug)
    })

    it('refuses saturation without revoking existing install capabilities', async () => {
        const room = await createRoom('Bounded handoffs')
        const otherRoom = await createRoom('Independent handoff')
        const independent = preparedCookies(await prepareRoom(otherRoom))
        const prepared: Array<{ rawToken: string; requestCookie: string }> = []
        for (let index = 0; index < MAX_OUTSTANDING_INSTALL_HANDOFFS_PER_ROOM; index += 1) {
            prepared.push(preparedCookies(await prepareRoom(room)))
        }

        const saturated = await prepareRoom(room)
        expect(saturated.status).toBe(429)
        expect(((await saturated.json()) as ApiError).error.code).toBe('RATE_LIMITED')

        // Even when the saturated attempt carries a valid handoff for another
        // room, throwing rolls that cross-room delete back with the transaction.
        const saturatedReplacement = await prepareRoom(room, { cookie: independent.requestCookie })
        expect(saturatedReplacement.status).toBe(429)
        expect((await redeemWith(independent.requestCookie)).status).toBe(200)
        expect(await prisma.installHandoff.count({ where: { roomId: room.room.id } })).toBe(
            MAX_OUTSTANDING_INSTALL_HANDOFFS_PER_ROOM
        )
        const statuses = await Promise.all(prepared.map(({ requestCookie }) => redeemWith(requestCookie))).then(
            (responses) => responses.map((response) => response.status)
        )
        expect(statuses).toEqual(Array(MAX_OUTSTANDING_INSTALL_HANDOFFS_PER_ROOM).fill(200))

        // Re-arming with one's own cookie replaces only that row and still
        // succeeds at the cap; every other issued capability remains valid.
        const replacement = await prepareRoom(room, { cookie: prepared[0].requestCookie })
        expect(replacement.status).toBe(201)
        expect((await redeemWith(prepared[0].requestCookie)).status).toBe(404)
        expect((await redeemWith(prepared[1].requestCookie)).status).toBe(200)
        expect((await redeemWith(preparedCookies(replacement).requestCookie)).status).toBe(200)
        expect(await prisma.installHandoff.count({ where: { roomId: room.room.id } })).toBe(
            MAX_OUTSTANDING_INSTALL_HANDOFFS_PER_ROOM
        )
    })

    it('serializes concurrent cap contenders without revoking any issued capability', async () => {
        const room = await createRoom('Concurrent bounded handoffs')
        const contenderCount = MAX_OUTSTANDING_INSTALL_HANDOFFS_PER_ROOM + 8

        // Start every handler before awaiting any one result. Their room-row lock
        // must turn the otherwise-racy count-and-create pair into exactly 32
        // commits; contenders that arrive after the cap must only be rejected.
        const responses = await Promise.all(Array.from({ length: contenderCount }, () => prepareRoom(room)))
        const issuedResponses = responses.filter((response) => response.status === 201)
        const rejectedResponses = responses.filter((response) => response.status === 429)

        expect(issuedResponses).toHaveLength(MAX_OUTSTANDING_INSTALL_HANDOFFS_PER_ROOM)
        expect(rejectedResponses).toHaveLength(contenderCount - MAX_OUTSTANDING_INSTALL_HANDOFFS_PER_ROOM)
        for (const response of rejectedResponses) {
            expect(((await response.json()) as ApiError).error.code).toBe('RATE_LIMITED')
        }
        expect(await prisma.installHandoff.count({ where: { roomId: room.room.id } })).toBe(
            MAX_OUTSTANDING_INSTALL_HANDOFFS_PER_ROOM
        )

        // A rejecting contender must not evict an earlier winner. Every cookie
        // actually issued by the concurrent batch remains redeemable afterwards.
        const issued = issuedResponses.map(preparedCookies)
        const redemptionStatuses = await Promise.all(issued.map(({ requestCookie }) => redeemWith(requestCookie))).then(
            (redeemed) => redeemed.map((response) => response.status)
        )
        expect(redemptionStatuses).toEqual(Array(MAX_OUTSTANDING_INSTALL_HANDOFFS_PER_ROOM).fill(200))
        expect(await prisma.installHandoff.count({ where: { roomId: room.room.id } })).toBe(
            MAX_OUTSTANDING_INSTALL_HANDOFFS_PER_ROOM
        )
    })

    it('makes absent, malformed, unknown and expired secrets indistinguishable and clears both cookies', async () => {
        const room = await createRoom()
        const prepared = await prepareRoom(room, { token: room.memberToken })
        const valid = preparedCookies(prepared)
        await prisma.installHandoff.updateMany({ data: { expiresAt: new Date(Date.now() - 1_000) } })

        const attempts = [
            await redeemWith(),
            await redeemWith(`${INSTALL_HANDOFF_COOKIE}=short; ${INSTALL_HANDOFF_READY_COOKIE}=1`),
            await redeemWith(`${INSTALL_HANDOFF_COOKIE}=${'A'.repeat(43)}; ${INSTALL_HANDOFF_READY_COOKIE}=1`),
            await redeemWith(valid.requestCookie),
        ]
        const bodies = await Promise.all(attempts.map((response) => response.clone().json()))
        for (const response of attempts) {
            expect(response.status).toBe(404)
            expect(response.headers.get('cache-control')).toBe('private, no-store')
            expect(cookieNamed(response.headers, INSTALL_HANDOFF_COOKIE)).toContain('Max-Age=0')
            expect(cookieNamed(response.headers, INSTALL_HANDOFF_READY_COOKIE)).toContain('Max-Age=0')
        }
        expect(new Set(bodies.map((body) => JSON.stringify(body)))).toHaveLength(1)
        expect(await prisma.installHandoff.count()).toBe(0)
    })

    it('physically sweeps expired rows while retaining live handoffs', async () => {
        const expiredRoom = await createRoom('Expired handoff')
        const liveRoom = await createRoom('Live handoff')
        await prepareRoom(expiredRoom)
        await prepareRoom(liveRoom)
        const now = new Date()
        await prisma.installHandoff.updateMany({
            where: { roomId: expiredRoom.room.id },
            data: { expiresAt: new Date(now.getTime() - 1) },
        })

        await expect(pruneExpiredInstallHandoffs(now)).resolves.toBe(1)
        expect(await prisma.installHandoff.findMany({ select: { roomId: true } })).toEqual([
            { roomId: liveRoom.room.id },
        ])
    })

    it('requires same-origin empty-JSON POSTs and never clears cookies for a rejected cross-site ACK', async () => {
        const room = await createRoom()

        const noOrigin = await prepareRoom(room, { origin: null })
        expect(noOrigin.status).toBe(403)
        expect(((await noOrigin.json()) as ApiError).error.code).toBe('CROSS_SITE_REQUEST')

        const crossSite = await prepareRoom(room, { origin: 'https://attacker.example' })
        expect(crossSite.status).toBe(403)

        const wrongMedia = await prepareRoom(room, { contentType: 'text/plain' })
        expect(wrongMedia.status).toBe(415)
        expect(((await wrongMedia.json()) as ApiError).error.code).toBe('JSON_REQUIRED')

        const extraField = await prepareRoom(room, { body: { room: room.room.slug } })
        expect(extraField.status).toBe(400)
        expect(await prisma.installHandoff.count()).toBe(0)

        const rejectedAck = await acknowledgeWith(undefined, 'https://attacker.example')
        expect(rejectedAck.status).toBe(403)
        expect(setCookies(rejectedAck.headers)).toEqual([])
    })

    it('treats ACK without a token as success and clears any readable stale marker', async () => {
        const response = await acknowledgeWith()
        expect(response.status).toBe(204)
        expect(cookieNamed(response.headers, INSTALL_HANDOFF_COOKIE)).toContain('Max-Age=0')
        expect(cookieNamed(response.headers, INSTALL_HANDOFF_READY_COOKIE)).toContain('Max-Age=0')
    })
})
