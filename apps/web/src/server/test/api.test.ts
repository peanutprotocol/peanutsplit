/**
 * Handler-level tests: the real route modules against the real `peanut_split_test`
 * database. No HTTP server — Next route handlers are plain functions.
 */
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma, truncateAll } from '@/server/test/db'
import { STATIC_USD_PER_UNIT } from '@/server/money'
import { resetRateLimits } from '@/server/rateLimit'
import { encodeRoomDrawing } from '@/lib/room-drawing'
import { GET as getCurrencies } from '@/app/api/currencies/route'
import { GET as getRate } from '@/app/api/rate/route'
import { POST as postRoom } from '@/app/api/rooms/route'
import { GET as getRoom } from '@/app/api/rooms/[slug]/route'
import { POST as postMember } from '@/app/api/rooms/[slug]/members/route'
import { POST as claimMember } from '@/app/api/rooms/[slug]/members/[memberId]/claim/route'
import { DELETE as deleteMember, PATCH as patchMember } from '@/app/api/rooms/[slug]/members/[memberId]/route'
import { POST as restoreMember } from '@/app/api/rooms/[slug]/members/[memberId]/restore/route'
import { POST as reactivateAndClaimMember } from '@/app/api/rooms/[slug]/members/[memberId]/reactivate/route'
import { POST as postExpense } from '@/app/api/rooms/[slug]/expenses/route'
import { DELETE as deleteExpense, PATCH as patchExpense } from '@/app/api/rooms/[slug]/expenses/[id]/route'
import { POST as restoreExpense } from '@/app/api/rooms/[slug]/expenses/[id]/restore/route'
import { POST as postSettlement } from '@/app/api/rooms/[slug]/settlements/route'
import { DELETE as deleteSettlement } from '@/app/api/rooms/[slug]/settlements/[id]/route'
import { GET as readiness } from '@/app/readiness/route'
import { GET as healthcheck } from '@/app/healthcheck/route'
import type {
    ApiError,
    ExpenseCreateResult,
    RoomState,
    RoomStateWithAddedMember,
    RoomStateWithMember,
} from '@/lib/api-types'

const BASE = 'http://localhost'

/**
 * The two serialization tests below deliberately fill the application's pool:
 * one connection owns the room lock while two route transactions queue behind
 * it. CI gives Prisma a three-connection pool, so observing those waiters
 * through the application client would itself wait forever for connection four.
 * Keep the observer outside the pool under test and bound it to one connection.
 */
const observerUrl = new URL(process.env.DATABASE_URL as string)
observerUrl.searchParams.set('connection_limit', '1')
const lockObserver = new PrismaClient({ datasourceUrl: observerUrl.toString() })

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

const newRoom = (body?: Partial<Record<string, unknown>>) =>
    call<RoomStateWithMember>(postRoom as Handler, {
        path: '/api/rooms',
        method: 'POST',
        body: { name: 'Ski Trip', emoji: '🎿', currency: 'EUR', creatorName: 'Ana', ...body },
    })

const join = (slug: string, name: string) =>
    call<RoomStateWithMember>(postMember as Handler, {
        path: `/api/rooms/${slug}/members`,
        method: 'POST',
        params: { slug },
        body: { name },
    })

const addPayer = (slug: string, name: string, token?: string) =>
    call<RoomStateWithAddedMember>(postMember as Handler, {
        path: `/api/rooms/${slug}/members`,
        method: 'POST',
        params: { slug },
        token,
        body: { name, intent: 'add' },
    })

const claim = (slug: string, memberId: string) =>
    call<RoomStateWithMember>(claimMember as Handler, {
        path: `/api/rooms/${slug}/members/${memberId}/claim`,
        method: 'POST',
        params: { slug, memberId },
    })

const removeMember = (slug: string, memberId: string, token?: string) =>
    call<RoomState | ApiError>(deleteMember as Handler, {
        path: `/api/rooms/${slug}/members/${memberId}`,
        method: 'DELETE',
        params: { slug, memberId },
        token,
    })

const reactivateMember = (slug: string, memberId: string) =>
    call<RoomState>(restoreMember as Handler, {
        path: `/api/rooms/${slug}/members/${memberId}/restore`,
        method: 'POST',
        params: { slug, memberId },
    })

const reactivateAndClaim = (slug: string, memberId: string) =>
    call<RoomStateWithMember>(reactivateAndClaimMember as Handler, {
        path: `/api/rooms/${slug}/members/${memberId}/reactivate`,
        method: 'POST',
        params: { slug, memberId },
    })

const waitForAdvisoryWaiters = async (minimum: number): Promise<void> => {
    for (let attempt = 0; attempt < 100; attempt++) {
        const [row] = await lockObserver.$queryRaw<[{ count: bigint }]>`
            SELECT count(*)::bigint AS count
            FROM pg_locks
            WHERE locktype = 'advisory' AND granted = false
        `
        if (Number(row.count) >= minimum) return
        await new Promise<void>((resolve) => setImmediate(resolve))
    }
    throw new Error(`expected ${minimum} advisory lock waiter(s)`)
}

/**
 * Hold the room's advisory lock so a test can prove a route actually queues
 * behind it. The release is explicit: starting the writer first, observing its
 * waiter, then starting member deletion gives PostgreSQL a deterministic order.
 */
const holdRoomWriteLock = async (roomId: string): Promise<{ release: () => Promise<void> }> => {
    let unlock!: () => void
    let acquired!: () => void
    const gate = new Promise<void>((resolve) => {
        unlock = resolve
    })
    const entered = new Promise<void>((resolve) => {
        acquired = resolve
    })
    const transaction = prisma.$transaction(
        async (tx) => {
            await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${roomId}, 0))`
            acquired()
            await gate
        },
        { timeout: 10_000 }
    )
    await entered
    return {
        release: async () => {
            unlock()
            await transaction
        },
    }
}

/** Balances must always net to zero — the whole model rests on it. */
const netsToZero = (state: RoomState) => Object.values(state.balances).reduce((a, b) => a + BigInt(b), 0n) === 0n

beforeEach(async () => {
    await truncateAll()
    // The limiter is process-wide: without this, the room a later test
    // creates fails for a reason belonging to an earlier one.
    resetRateLimits()
})

afterAll(async () => {
    await lockObserver.$disconnect()
})

describe('ops endpoints', () => {
    it('healthcheck answers without touching the database', async () => {
        const res = healthcheck()
        expect(res.status).toBe(200)
        expect(await res.text()).toBe('ok')
    })

    it('readiness reports ready once SELECT 1 works', async () => {
        const res = await readiness()
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ status: 'ready' })
    })
})

describe('reference data', () => {
    it('lists the currency catalog, with rate coverage per code', async () => {
        const { status, body } = await call<{ currencies: { code: string; decimals: number; hasRate: boolean }[] }>(
            getCurrencies as unknown as Handler,
            { path: '/api/currencies' }
        )
        expect(status).toBe(200)
        expect(body.currencies).toHaveLength(162)
        expect(body.currencies.find((c) => c.code === 'JPY')?.decimals).toBe(0)
        expect(body.currencies.find((c) => c.code === 'KWD')?.decimals).toBe(3)
        // The picker needs this to know which currencies a room can actually take.
        expect(body.currencies.find((c) => c.code === 'EUR')?.hasRate).toBe(true)
        expect(body.currencies.find((c) => c.code === 'KPW')?.hasRate).toBe(false)
    })

    it('quotes an indicative rate and says that it is indicative', async () => {
        const { status, body } = await call<{ rate: number; source: string; indicative: boolean }>(getRate as Handler, {
            path: '/api/rate?from=THB&to=EUR',
        })
        expect(status).toBe(200)
        // No cached rows and remote fetching is off in tests → the static table.
        expect(body.source).toBe('static')
        expect(body.indicative).toBe(true)
        expect(body.rate).toBeCloseTo(0.028 / 1.08, 12)
    })

    /**
     * A pair nothing can price is an answer, not a failure. `useRate` runs with `retry: false`,
     * so a 4xx here would render as a broken screen for what is now an ordinary case: somebody
     * typed a ticker that does not exist.
     */
    it('answers 200 with a null rate for a pair it cannot price', async () => {
        const { status, body } = await call<{ rate: number | null; source: string }>(getRate as Handler, {
            path: '/api/rate?from=EUR&to=DOGE',
        })
        expect(status).toBe(200)
        expect(body.rate).toBeNull()
        expect(body.source).toBe('static')
    })

    it('rejects a string that is not a currency code at all', async () => {
        const { status, body } = await call<ApiError>(getRate as Handler, { path: '/api/rate?from=EUR&to=EUROS' })
        expect(status).toBe(400)
        expect(body.error.code).toBe('VALIDATION_ERROR')
    })
})

describe('rooms and members', () => {
    it('creates a room with a shareable slug and a creator token', async () => {
        const { status, body } = await newRoom()
        expect(status).toBe(201)
        expect(body.room.slug).toMatch(/^ski-trip-[A-Za-z0-9_-]{22}$/)
        expect(body.room.emoji).toBe('🎿')
        expect(body.members).toHaveLength(1)
        expect(body.memberId).toBe(body.members[0].id)
        expect(body.memberToken).toBeTruthy()
        expect(body.balances[body.memberId]).toBe('0')
    })

    it('creates a room with a custom drawing intact', async () => {
        const custom = encodeRoomDrawing([[{ x: 0.5, y: 0.5 }]])
        const { status, body } = await newRoom({ emoji: custom })
        expect(status).toBe(201)
        expect(body.room.emoji).toBe(custom)
        expect((await prisma.room.findUnique({ where: { id: body.room.id } }))?.emoji).toBe(custom)
    })

    it('never leaks or caches private room state', async () => {
        const { body: created } = await newRoom()
        const response = await (getRoom as Handler)(new Request(`${BASE}/api/rooms/${created.room.slug}`), {
            params: Promise.resolve({ slug: created.room.slug }),
        })
        const body = (await response.json()) as RoomState
        expect(response.status).toBe(200)
        expect(response.headers.get('Cache-Control')).toBe('private, no-store')
        expect(JSON.stringify(body)).not.toContain(created.memberToken)
    })

    it('404s on an unknown slug', async () => {
        const { status, body } = await call<ApiError>(getRoom as Handler, {
            path: '/api/rooms/nope-123456',
            params: { slug: 'nope-123456' },
        })
        expect(status).toBe(404)
        expect(body.error.code).toBe('NOT_FOUND')
    })

    it('meters only missing room lookups, then hides whether any slug exists', async () => {
        const { body: created } = await newRoom()

        // Normal room polling does not spend the miss budget.
        for (let i = 0; i < 35; i++) {
            const { status } = await call<RoomState>(getRoom as Handler, {
                path: `/api/rooms/${created.room.slug}`,
                params: { slug: created.room.slug },
            })
            expect(status).toBe(200)
        }

        for (let i = 0; i < 31; i++) {
            const { status } = await call<ApiError>(getRoom as Handler, {
                path: `/api/rooms/missing-${i}`,
                params: { slug: `missing-${i}` },
            })
            expect(status).toBe(i < 30 ? 404 : 429)
        }

        const { status, body } = await call<ApiError>(getRoom as Handler, {
            path: `/api/rooms/${created.room.slug}`,
            params: { slug: created.room.slug },
        })
        expect(status).toBe(429)
        expect(body.error.code).toBe('RATE_LIMITED')
    })

    it('adds a joiner and returns the roster that already contains them', async () => {
        const { body: created } = await newRoom()
        const { status, body } = await join(created.room.slug, 'Bea')
        expect(status).toBe(201)
        expect(body.members.map((m) => m.name)).toEqual(['Ana', 'Bea'])
        expect(body.members.some((m) => m.id === body.memberId)).toBe(true)
        expect(body.memberToken).toBeTruthy()
    })

    it('adds a payer without returning their identity token at the HTTP boundary', async () => {
        const { body: created } = await newRoom()
        const { status, body } = await addPayer(created.room.slug, 'Bea')

        expect(status).toBe(201)
        expect(body.members.some((member) => member.id === body.memberId && member.name === 'Bea')).toBe(true)
        expect(body).not.toHaveProperty('memberToken')

        const stored = await prisma.member.findUnique({ where: { id: body.memberId }, select: { token: true } })
        expect(stored?.token).toBeTruthy()
        expect(JSON.stringify(body)).not.toContain(stored?.token)
        expect(body.members.find((member) => member.id === body.memberId)?.canRemove).toBe(true)
    })

    it('marks an exact-zero member Former without deleting their identity', async () => {
        const { body: created } = await newRoom()
        const { body: added } = await addPayer(created.room.slug, 'Bea')

        const removed = await removeMember(created.room.slug, added.memberId)
        expect(removed.status).toBe(200)
        const member = (removed.body as RoomState).members.find((candidate) => candidate.id === added.memberId)
        expect(member?.removedAt).toBeTruthy()
        expect(await prisma.member.findUnique({ where: { id: added.memberId } })).not.toBeNull()
    })

    it('keeps device selection separate from roster cleanup status', async () => {
        const { body: created } = await newRoom()
        const { body: added } = await addPayer(created.room.slug, 'Bea')
        await claim(created.room.slug, added.memberId)

        const removal = await removeMember(created.room.slug, added.memberId)
        expect(removal.status).toBe(200)
        expect((await prisma.member.findUnique({ where: { id: added.memberId } }))?.removedAt).not.toBeNull()
    })

    it('blocks the last active member and makes repeated removal idempotent', async () => {
        const { body: created } = await newRoom()
        const last = await removeMember(created.room.slug, created.memberId)
        expect(last.status).toBe(409)
        expect((last.body as ApiError).error.code).toBe('LAST_ACTIVE_MEMBER')

        const { body: added } = await addPayer(created.room.slug, 'Bea')
        const first = await removeMember(created.room.slug, added.memberId)
        const second = await removeMember(created.room.slug, added.memberId)
        expect(first.status).toBe(200)
        expect(second.status).toBe(200)
        const firstRemovedAt = (first.body as RoomState).members.find(
            (member) => member.id === added.memberId
        )?.removedAt
        expect((second.body as RoomState).members.find((member) => member.id === added.memberId)?.removedAt).toBe(
            firstRemovedAt
        )
        expect(await prisma.member.count({ where: { id: added.memberId } })).toBe(1)
    })

    it('reactivates the same member id, rotates proof, and never assigns that identity to the restorer', async () => {
        const { body: created } = await newRoom()
        const { body: added } = await addPayer(created.room.slug, 'Bea')
        const before = await prisma.member.findUniqueOrThrow({ where: { id: added.memberId }, select: { token: true } })
        await removeMember(created.room.slug, added.memberId)

        const duplicate = await addPayer(created.room.slug, 'bea')
        expect(duplicate.status).toBe(409)
        expect((duplicate.body as unknown as ApiError).error.code).toBe('MEMBER_REACTIVATION_REQUIRED')
        const staleClaim = await claim(created.room.slug, added.memberId)
        expect(staleClaim.status).toBe(404)

        const restored = await reactivateMember(created.room.slug, added.memberId)
        expect(restored.status).toBe(200)
        expect(restored.body.members.find((member) => member.id === added.memberId)?.removedAt).toBeNull()
        expect(restored.body).not.toHaveProperty('memberId')
        expect(restored.body).not.toHaveProperty('memberToken')
        const after = await prisma.member.findUniqueOrThrow({ where: { id: added.memberId }, select: { token: true } })
        expect(after.token).not.toBe(before.token)

        const replay = await reactivateMember(created.room.slug, added.memberId)
        expect(replay.status).toBe(200)
        expect((await prisma.member.findUniqueOrThrow({ where: { id: added.memberId } })).token).toBe(after.token)
        expect(await prisma.member.count({ where: { roomId: created.room.id, name: { equals: 'Bea' } } })).toBe(1)
    })

    it('explicitly reactivates and claims the same id with a newly rotated token', async () => {
        const { body: created } = await newRoom()
        const { body: added } = await addPayer(created.room.slug, 'Bea')
        const oldToken = (await prisma.member.findUniqueOrThrow({ where: { id: added.memberId } })).token
        await removeMember(created.room.slug, added.memberId)

        const claimed = await reactivateAndClaim(created.room.slug, added.memberId)

        expect(claimed.status).toBe(200)
        expect(claimed.body.memberId).toBe(added.memberId)
        expect(claimed.body.memberToken).not.toBe(oldToken)
        expect(claimed.body.members.find((member) => member.id === added.memberId)?.removedAt).toBeNull()
        expect((await prisma.member.findUniqueOrThrow({ where: { id: added.memberId } })).token).toBe(
            claimed.body.memberToken
        )
    })

    it('reserves Former personas and palettes across new joins and active avatar edits', async () => {
        const { body: created } = await newRoom()
        const { body: bea } = await addPayer(created.room.slug, 'Bea')
        const former = await prisma.member.findUniqueOrThrow({ where: { id: bea.memberId } })
        await removeMember(created.room.slug, bea.memberId)

        const { body: caro } = await addPayer(created.room.slug, 'Caro')
        const newMember = await prisma.member.findUniqueOrThrow({ where: { id: caro.memberId } })
        expect(newMember.avatar).not.toBe(former.avatar)
        expect(newMember.avatarPalette).not.toBe(former.avatarPalette)

        const repainted = await call<RoomState>(patchMember as Handler, {
            path: `/api/rooms/${created.room.slug}/members/${created.memberId}`,
            method: 'PATCH',
            params: { slug: created.room.slug, memberId: created.memberId },
            body: { avatar: 'tea-dragon', avatarPalette: former.avatarPalette },
        })
        expect(repainted.status).toBe(200)
        expect(repainted.body.members.find((member) => member.id === created.memberId)?.avatarPalette).not.toBe(
            former.avatarPalette
        )

        await reactivateMember(created.room.slug, bea.memberId)
        const restored = await prisma.member.findUniqueOrThrow({ where: { id: bea.memberId } })
        expect(restored.avatar).toBe(former.avatar)
        expect(restored.avatarPalette).toBe(former.avatarPalette)
    })

    it('refuses restore when legacy data already has an active case-insensitive name collision', async () => {
        const { body: created } = await newRoom()
        const { body: added } = await addPayer(created.room.slug, 'Bea')
        await removeMember(created.room.slug, added.memberId)
        await prisma.member.create({
            data: { roomId: created.room.id, name: 'bea', token: `legacy-${crypto.randomUUID()}` },
        })

        const restored = await reactivateMember(created.room.slug, added.memberId)
        expect(restored.status).toBe(409)
        expect((restored.body as unknown as ApiError).error.code).toBe('MEMBER_NAME_CONFLICT')
        expect((await prisma.member.findUniqueOrThrow({ where: { id: added.memberId } })).removedAt).not.toBeNull()
    })

    it('keeps Former out of new writes but lets historical edits reopen and settle their exact balance', async () => {
        const { body: created } = await newRoom()
        const { body: bea } = await join(created.room.slug, 'Bea')
        const slug = created.room.slug
        const original = await call<RoomState>(postExpense as Handler, {
            path: `/api/rooms/${slug}/expenses`,
            method: 'POST',
            params: { slug },
            body: {
                description: 'Cabin',
                amountMinor: '1000',
                currency: 'EUR',
                paidById: created.memberId,
                splitMode: 'EQUAL',
            },
        })
        const expenseId = original.body.expenses[0].id
        const square = await call<RoomState>(postSettlement as Handler, {
            path: `/api/rooms/${slug}/settlements`,
            method: 'POST',
            params: { slug },
            body: { fromId: bea.memberId, toId: created.memberId, amountMinor: '500' },
        })
        expect(square.body.balances[bea.memberId]).toBe('0')

        const removed = await removeMember(slug, bea.memberId)
        expect(removed.status).toBe(200)
        expect((removed.body as RoomState).members.find((member) => member.id === bea.memberId)?.removedAt).toBeTruthy()

        const explicitFormer = await call<ApiError>(postExpense as Handler, {
            path: `/api/rooms/${slug}/expenses`,
            method: 'POST',
            params: { slug },
            body: {
                description: 'Bad replay',
                amountMinor: '100',
                currency: 'EUR',
                paidById: created.memberId,
                splitMode: 'EXACT',
                exactShares: [{ memberId: bea.memberId, amountMinor: '100' }],
            },
        })
        expect(explicitFormer.status).toBe(400)
        expect(explicitFormer.body.error.code).toBe('MEMBER_FORMER')

        const activeDefault = await call<RoomState>(postExpense as Handler, {
            path: `/api/rooms/${slug}/expenses`,
            method: 'POST',
            params: { slug },
            body: {
                description: 'Ana only now',
                amountMinor: '100',
                currency: 'EUR',
                paidById: created.memberId,
                splitMode: 'EQUAL',
            },
        })
        expect(activeDefault.body.expenses[0].shares.map((share) => share.memberId)).toEqual([created.memberId])

        const reopened = await call<RoomState>(patchExpense as Handler, {
            path: `/api/rooms/${slug}/expenses/${expenseId}`,
            method: 'PATCH',
            params: { slug, id: expenseId },
            body: {
                description: 'Cabin corrected',
                amountMinor: '1200',
                currency: 'EUR',
                paidById: created.memberId,
                splitMode: 'EXACT',
                exactShares: [
                    { memberId: created.memberId, amountMinor: '600' },
                    { memberId: bea.memberId, amountMinor: '600' },
                ],
            },
        })
        expect(reopened.status).toBe(200)
        expect(reopened.body.balances[bea.memberId]).toBe('-100')
        expect(reopened.body.members.find((member) => member.id === bea.memberId)?.removedAt).toBeTruthy()
        expect(reopened.body.suggestedTransfers).toContainEqual({
            fromId: bea.memberId,
            toId: created.memberId,
            amountMinor: '100',
        })

        const resettled = await call<RoomState>(postSettlement as Handler, {
            path: `/api/rooms/${slug}/settlements`,
            method: 'POST',
            params: { slug },
            body: { fromId: bea.memberId, toId: created.memberId, amountMinor: '100' },
        })
        expect(resettled.status).toBe(201)
        expect(resettled.body.balances[bea.memberId]).toBe('0')
        expect(resettled.body.members.find((member) => member.id === bea.memberId)?.removedAt).toBeTruthy()
    })

    it('restoring a deleted expense reopens a Former balance without restoring membership', async () => {
        const { body: created } = await newRoom()
        const { body: bea } = await join(created.room.slug, 'Bea')
        const added = await call<RoomState>(postExpense as Handler, {
            path: `/api/rooms/${created.room.slug}/expenses`,
            method: 'POST',
            params: { slug: created.room.slug },
            body: {
                description: 'Dinner',
                amountMinor: '1000',
                currency: 'EUR',
                paidById: created.memberId,
                splitMode: 'EQUAL',
            },
        })
        const expenseId = added.body.expenses[0].id
        await call<RoomState>(deleteExpense as Handler, {
            path: `/api/rooms/${created.room.slug}/expenses/${expenseId}`,
            method: 'DELETE',
            params: { slug: created.room.slug, id: expenseId },
        })
        expect((await removeMember(created.room.slug, bea.memberId)).status).toBe(200)

        const restored = await call<RoomState>(restoreExpense as Handler, {
            path: `/api/rooms/${created.room.slug}/expenses/${expenseId}/restore`,
            method: 'POST',
            params: { slug: created.room.slug, id: expenseId },
        })

        expect(restored.status).toBe(200)
        expect(restored.body.balances[bea.memberId]).toBe('-500')
        expect(restored.body.members.find((member) => member.id === bea.memberId)?.removedAt).toBeTruthy()
    })

    it('deleting a settlement reopens a Former balance without restoring membership', async () => {
        const { body: created } = await newRoom()
        const { body: bea } = await join(created.room.slug, 'Bea')
        await call<RoomState>(postExpense as Handler, {
            path: `/api/rooms/${created.room.slug}/expenses`,
            method: 'POST',
            params: { slug: created.room.slug },
            body: {
                description: 'Dinner',
                amountMinor: '1000',
                currency: 'EUR',
                paidById: created.memberId,
                splitMode: 'EQUAL',
            },
        })
        const settled = await call<RoomState>(postSettlement as Handler, {
            path: `/api/rooms/${created.room.slug}/settlements`,
            method: 'POST',
            params: { slug: created.room.slug },
            body: { fromId: bea.memberId, toId: created.memberId, amountMinor: '500' },
        })
        const settlementId = settled.body.settlements[0].id
        expect((await removeMember(created.room.slug, bea.memberId)).status).toBe(200)

        const reopened = await call<RoomState>(deleteSettlement as Handler, {
            path: `/api/rooms/${created.room.slug}/settlements/${settlementId}`,
            method: 'DELETE',
            params: { slug: created.room.slug, id: settlementId },
        })

        expect(reopened.status).toBe(200)
        expect(reopened.body.balances[bea.memberId]).toBe('-500')
        expect(reopened.body.members.find((member) => member.id === bea.memberId)?.removedAt).toBeTruthy()
    })

    it('preserves only each Former member’s original payer or participant role on edit', async () => {
        const { body: created } = await newRoom()
        const { body: bea } = await join(created.room.slug, 'Bea')
        const { body: caro } = await join(created.room.slug, 'Caro')
        const participantRow = await call<RoomState>(postExpense as Handler, {
            path: `/api/rooms/${created.room.slug}/expenses`,
            method: 'POST',
            params: { slug: created.room.slug },
            body: {
                description: 'Bea participated',
                amountMinor: '1000',
                currency: 'EUR',
                paidById: created.memberId,
                splitMode: 'EXACT',
                exactShares: [{ memberId: bea.memberId, amountMinor: '1000' }],
            },
        })
        await call<RoomState>(postSettlement as Handler, {
            path: `/api/rooms/${created.room.slug}/settlements`,
            method: 'POST',
            params: { slug: created.room.slug },
            body: { fromId: bea.memberId, toId: created.memberId, amountMinor: '1000' },
        })
        const payerRow = await call<RoomState>(postExpense as Handler, {
            path: `/api/rooms/${created.room.slug}/expenses`,
            method: 'POST',
            params: { slug: created.room.slug },
            body: {
                description: 'Caro paid',
                amountMinor: '700',
                currency: 'EUR',
                paidById: caro.memberId,
                splitMode: 'EXACT',
                exactShares: [{ memberId: created.memberId, amountMinor: '700' }],
            },
        })
        await call<RoomState>(postSettlement as Handler, {
            path: `/api/rooms/${created.room.slug}/settlements`,
            method: 'POST',
            params: { slug: created.room.slug },
            body: { fromId: created.memberId, toId: caro.memberId, amountMinor: '700' },
        })
        await removeMember(created.room.slug, bea.memberId)
        await removeMember(created.room.slug, caro.memberId)

        const participantToPayer = await call<ApiError>(patchExpense as Handler, {
            path: `/api/rooms/${created.room.slug}/expenses/${participantRow.body.expenses[0].id}`,
            method: 'PATCH',
            params: { slug: created.room.slug, id: participantRow.body.expenses[0].id },
            body: {
                description: 'Role swap',
                amountMinor: '1000',
                currency: 'EUR',
                paidById: bea.memberId,
                splitMode: 'EXACT',
                exactShares: [{ memberId: bea.memberId, amountMinor: '1000' }],
            },
        })
        expect(participantToPayer.status).toBe(400)
        expect(participantToPayer.body.error.code).toBe('MEMBER_FORMER')

        const payerToParticipant = await call<ApiError>(patchExpense as Handler, {
            path: `/api/rooms/${created.room.slug}/expenses/${payerRow.body.expenses[0].id}`,
            method: 'PATCH',
            params: { slug: created.room.slug, id: payerRow.body.expenses[0].id },
            body: {
                description: 'Other role swap',
                amountMinor: '700',
                currency: 'EUR',
                paidById: created.memberId,
                splitMode: 'EXACT',
                exactShares: [{ memberId: caro.memberId, amountMinor: '700' }],
            },
        })
        expect(payerToParticipant.status).toBe(400)
        expect(payerToParticipant.body.error.code).toBe('MEMBER_FORMER')
    })

    it('uses the current exact balance while preserving soft-deleted history', async () => {
        const createdResult = await newRoom()
        expect(createdResult.status).toBe(201)
        const created = createdResult.body
        const { body: added } = await addPayer(created.room.slug, 'Bea')
        const { body: afterExpense } = await call<RoomState>(postExpense as Handler, {
            path: `/api/rooms/${created.room.slug}/expenses`,
            method: 'POST',
            params: { slug: created.room.slug },
            body: {
                description: 'Taxi',
                amountMinor: '1000',
                currency: 'EUR',
                paidById: added.memberId,
                splitMode: 'EXACT',
                exactShares: [{ memberId: created.memberId, amountMinor: '1000' }],
            },
        })
        await call<RoomState>(deleteExpense as Handler, {
            path: `/api/rooms/${created.room.slug}/expenses/${afterExpense.expenses[0].id}`,
            method: 'DELETE',
            params: { slug: created.room.slug, id: afterExpense.expenses[0].id },
        })

        const fresh = await call<RoomState>(getRoom as Handler, {
            path: `/api/rooms/${created.room.slug}`,
            params: { slug: created.room.slug },
        })
        expect(fresh.body.members.find((member) => member.id === added.memberId)?.canRemove).toBe(true)
        const removal = await removeMember(created.room.slug, added.memberId)
        expect(removal.status).toBe(200)
        expect(
            (removal.body as RoomState).members.find((member) => member.id === added.memberId)?.removedAt
        ).toBeTruthy()
        expect(await prisma.expense.count({ where: { roomId: created.room.id, paidById: added.memberId } })).toBe(1)
    })

    it('serializes ordinary expense creation before placeholder removal', async () => {
        const { body: created } = await newRoom()
        const { body: added } = await addPayer(created.room.slug, 'Bea')
        const blocker = await holdRoomWriteLock(created.room.id)

        const write = call<RoomState>(postExpense as Handler, {
            path: `/api/rooms/${created.room.slug}/expenses`,
            method: 'POST',
            params: { slug: created.room.slug },
            body: {
                description: 'Bea paid the taxi',
                amountMinor: '1000',
                currency: 'EUR',
                paidById: added.memberId,
                splitMode: 'EXACT',
                exactShares: [{ memberId: created.memberId, amountMinor: '1000' }],
            },
        })
        await waitForAdvisoryWaiters(1)
        const removal = removeMember(created.room.slug, added.memberId)
        await waitForAdvisoryWaiters(2)
        await blocker.release()

        expect((await write).status).toBe(201)
        const removed = await removal
        expect(removed.status).toBe(409)
        expect((removed.body as ApiError).error.code).toBe('MEMBER_BALANCE_NOT_ZERO')
        expect(await prisma.member.findUnique({ where: { id: added.memberId } })).not.toBeNull()
        expect(await prisma.expense.count({ where: { roomId: created.room.id, paidById: added.memberId } })).toBe(1)
    })

    it('rejects a queued expense when exact-zero removal wins the room lock first', async () => {
        const { body: created } = await newRoom()
        const { body: added } = await addPayer(created.room.slug, 'Bea')
        const blocker = await holdRoomWriteLock(created.room.id)

        const removal = removeMember(created.room.slug, added.memberId)
        await waitForAdvisoryWaiters(1)
        const write = call<ApiError>(postExpense as Handler, {
            path: `/api/rooms/${created.room.slug}/expenses`,
            method: 'POST',
            params: { slug: created.room.slug },
            body: {
                description: 'Stale Bea draft',
                amountMinor: '1000',
                currency: 'EUR',
                paidById: created.memberId,
                splitMode: 'EXACT',
                exactShares: [{ memberId: added.memberId, amountMinor: '1000' }],
            },
        })
        await waitForAdvisoryWaiters(2)
        await blocker.release()

        expect((await removal).status).toBe(200)
        const rejected = await write
        expect(rejected.status).toBe(400)
        expect(rejected.body.error.code).toBe('MEMBER_FORMER')
        expect(await prisma.expenseShare.count({ where: { memberId: added.memberId } })).toBe(0)
        expect((await prisma.member.findUniqueOrThrow({ where: { id: added.memberId } })).removedAt).not.toBeNull()
    })

    it('rejects a stale actor token when removal wins before adding another member', async () => {
        const { body: created } = await newRoom()
        const { body: bea } = await addPayer(created.room.slug, 'Bea')
        const beaToken = (await prisma.member.findUniqueOrThrow({ where: { id: bea.memberId } })).token
        const blocker = await holdRoomWriteLock(created.room.id)

        const removal = removeMember(created.room.slug, bea.memberId)
        await waitForAdvisoryWaiters(1)
        const staleAdd = addPayer(created.room.slug, 'Caro', beaToken)
        await waitForAdvisoryWaiters(2)
        await blocker.release()

        expect((await removal).status).toBe(200)
        const rejected = await staleAdd
        expect(rejected.status).toBe(403)
        expect((rejected.body as unknown as ApiError).error.code).toBe('MEMBER_TOKEN_INVALID')
        expect(await prisma.member.count({ where: { roomId: created.room.id, name: 'Caro' } })).toBe(0)
    })

    it('never accepts a supplied Former token as anonymous attribution', async () => {
        const { body: created } = await newRoom()
        const { body: bea } = await addPayer(created.room.slug, 'Bea')
        const beaToken = (await prisma.member.findUniqueOrThrow({ where: { id: bea.memberId } })).token
        await removeMember(created.room.slug, bea.memberId)

        const rejected = await call<ApiError>(postExpense as Handler, {
            path: `/api/rooms/${created.room.slug}/expenses`,
            method: 'POST',
            params: { slug: created.room.slug },
            token: beaToken,
            body: {
                clientKey: 'stale-actor-new-expense-01',
                description: 'Must not become anonymous',
                amountMinor: '100',
                currency: 'EUR',
                paidById: created.memberId,
                splitMode: 'EXACT',
                exactShares: [{ memberId: created.memberId, amountMinor: '100' }],
            },
        })
        expect(rejected.status).toBe(403)
        expect(rejected.body.error.code).toBe('MEMBER_TOKEN_INVALID')
        expect(await prisma.expense.count({ where: { id: 'stale-actor-new-expense-01' } })).toBe(0)
    })

    it('serializes expense edits before placeholder removal', async () => {
        const { body: created } = await newRoom()
        const { body: original } = await call<RoomState>(postExpense as Handler, {
            path: `/api/rooms/${created.room.slug}/expenses`,
            method: 'POST',
            params: { slug: created.room.slug },
            body: {
                description: 'Taxi',
                amountMinor: '1000',
                currency: 'EUR',
                paidById: created.memberId,
                splitMode: 'EQUAL',
            },
        })
        const expenseId = original.expenses[0].id
        const { body: added } = await addPayer(created.room.slug, 'Bea')
        const blocker = await holdRoomWriteLock(created.room.id)

        const write = call<RoomState>(patchExpense as Handler, {
            path: `/api/rooms/${created.room.slug}/expenses/${expenseId}`,
            method: 'PATCH',
            params: { slug: created.room.slug, id: expenseId },
            body: {
                description: 'Taxi, paid by Bea',
                amountMinor: '1000',
                currency: 'EUR',
                paidById: added.memberId,
                splitMode: 'EXACT',
                exactShares: [{ memberId: created.memberId, amountMinor: '1000' }],
            },
        })
        await waitForAdvisoryWaiters(1)
        const removal = removeMember(created.room.slug, added.memberId)
        await waitForAdvisoryWaiters(2)
        await blocker.release()

        expect((await write).status).toBe(200)
        const removed = await removal
        expect(removed.status).toBe(409)
        expect((removed.body as ApiError).error.code).toBe('MEMBER_BALANCE_NOT_ZERO')
        expect(await prisma.member.findUnique({ where: { id: added.memberId } })).not.toBeNull()
        expect(
            await prisma.expense.count({ where: { id: expenseId, roomId: created.room.id, paidById: added.memberId } })
        ).toBe(1)
    })

    it('preserves attribution, reactions and settlements while dropping push on Former', async () => {
        const createdResult = await newRoom()
        expect(createdResult.status).toBe(201)
        const created = createdResult.body
        const slug = created.room.slug
        const attributed = (await addPayer(slug, 'Bea')).body.memberId
        const reacted = (await addPayer(slug, 'Caro')).body.memberId
        const settled = (await addPayer(slug, 'Dani')).body.memberId
        const subscribed = (await addPayer(slug, 'Eli')).body.memberId
        const attributedToken = await prisma.member.findUniqueOrThrow({
            where: { id: attributed },
            select: { token: true },
        })

        const { body: afterExpense } = await call<RoomState>(postExpense as Handler, {
            path: `/api/rooms/${slug}/expenses`,
            method: 'POST',
            params: { slug },
            token: attributedToken.token,
            body: {
                description: 'Ana only',
                amountMinor: '1000',
                currency: 'EUR',
                paidById: created.memberId,
                splitMode: 'EXACT',
                exactShares: [{ memberId: created.memberId, amountMinor: '1000' }],
            },
        })
        const expenseId = afterExpense.expenses[0].id
        await prisma.expenseReaction.create({
            data: { expenseId, memberId: reacted, emoji: 'heart' },
        })
        await prisma.settlement.create({
            data: {
                roomId: created.room.id,
                fromId: settled,
                toId: created.memberId,
                amountMinor: 1n,
                deletedAt: new Date(),
            },
        })
        await prisma.pushSubscription.create({
            data: {
                roomId: created.room.id,
                memberId: subscribed,
                endpoint: `https://updates.push.services.mozilla.com/wpush/v2/${subscribed}`,
                p256dh: 'p256dh',
                auth: 'auth',
            },
        })

        for (const memberId of [attributed, reacted, settled, subscribed]) {
            const removal = await removeMember(slug, memberId)
            expect(removal.status).toBe(200)
            expect((removal.body as RoomState).members.find((member) => member.id === memberId)?.removedAt).toBeTruthy()
        }
        expect(await prisma.expense.count({ where: { createdById: attributed } })).toBe(1)
        expect(await prisma.expenseReaction.count({ where: { memberId: reacted } })).toBe(1)
        expect(await prisma.settlement.count({ where: { fromId: settled } })).toBe(1)
        expect(await prisma.pushSubscription.count({ where: { memberId: subscribed } })).toBe(0)
    })

    it('claims an existing roster entry with its stable token instead of rotating it', async () => {
        const { body: created } = await newRoom()
        const { body: added } = await addPayer(created.room.slug, 'Bea')
        const before = await prisma.member.findUnique({ where: { id: added.memberId }, select: { token: true } })

        const first = await claim(created.room.slug, added.memberId)
        const second = await claim(created.room.slug, added.memberId)
        const after = await prisma.member.findUnique({ where: { id: added.memberId }, select: { token: true } })

        expect(first.status).toBe(200)
        expect(first.body.memberId).toBe(added.memberId)
        expect(first.body.memberToken).toBe(before?.token)
        expect(second.body.memberToken).toBe(first.body.memberToken)
        expect(after?.token).toBe(before?.token)
    })

    it('will not claim a member id through a different room link', async () => {
        const { body: first } = await newRoom()
        const { body: second } = await newRoom({ name: 'Other Trip' })

        const { status, body } = await claim(second.room.slug, first.memberId)

        expect(status).toBe(404)
        expect((body as unknown as ApiError).error.code).toBe('NOT_FOUND')
    })

    it('409s on a duplicate name so the join gate can offer the existing member', async () => {
        const { body: created } = await newRoom()
        const { status, body } = await join(created.room.slug, 'ana')
        expect(status).toBe(409)
        expect((body as unknown as ApiError).error.code).toBe('DUPLICATE_MEMBER_NAME')
    })

    it('serializes case-insensitive joins and returns a token only to the winner', async () => {
        const { body: created } = await newRoom()
        const results = await Promise.all([join(created.room.slug, 'Bea'), join(created.room.slug, 'bea')])

        expect(results.map(({ status }) => status).sort()).toEqual([201, 409])
        const winner = results.find(({ status }) => status === 201)
        expect(winner?.body.memberToken).toBeTruthy()

        const { body: room } = await call<RoomState>(getRoom as Handler, {
            path: `/api/rooms/${created.room.slug}`,
            params: { slug: created.room.slug },
        })
        expect(room.members.filter(({ name }) => name.toLowerCase() === 'bea')).toHaveLength(1)
    })

    it('400s on an empty name', async () => {
        const { body: created } = await newRoom()
        const { status } = await call<ApiError>(postMember as Handler, {
            path: `/api/rooms/${created.room.slug}/members`,
            method: 'POST',
            params: { slug: created.room.slug },
            body: { name: '   ' },
        })
        expect(status).toBe(400)
    })
})

describe('the full room lifecycle', () => {
    it('creates a staged payer and expense atomically, and rolls both back when the expense fails', async () => {
        const { body: created } = await newRoom()
        const slug = created.room.slug

        const successful = await call<RoomState>(postExpense as Handler, {
            path: `/api/rooms/${slug}/expenses`,
            method: 'POST',
            params: { slug },
            token: created.memberToken,
            body: {
                description: 'Dinner',
                amountMinor: '1800',
                currency: 'EUR',
                newPaidByName: 'Bea',
                splitMode: 'EQUAL',
            },
        })
        expect(successful.status).toBe(201)
        const bea = successful.body.members.find((member) => member.name === 'Bea')
        expect(bea).toBeTruthy()
        expect(successful.body.expenses[0].paidById).toBe(bea?.id)
        expect(successful.body.expenses[0].shares.map((share) => share.memberId)).toEqual([created.memberId, bea?.id])
        expect(successful.body.expenses[0].createdById).toBe(created.memberId)

        const failed = await call<ApiError>(postExpense as Handler, {
            path: `/api/rooms/${slug}/expenses`,
            method: 'POST',
            params: { slug },
            body: {
                description: 'Broken exact split',
                amountMinor: '1000',
                currency: 'EUR',
                newPaidByName: 'Caro',
                splitMode: 'EXACT',
                exactShares: [{ memberId: created.memberId, amountMinor: '999' }],
            },
        })
        expect(failed.status).toBe(400)
        expect(failed.body.error.code).toBe('SHARES_DO_NOT_ADD_UP')
        expect(await prisma.member.count({ where: { roomId: created.room.id, name: 'Caro' } })).toBe(0)
        expect(
            await prisma.expense.count({ where: { roomId: created.room.id, description: 'Broken exact split' } })
        ).toBe(0)

        const anonymous = await call<RoomState>(postExpense as Handler, {
            path: `/api/rooms/${slug}/expenses`,
            method: 'POST',
            params: { slug },
            body: {
                description: 'Filed without a member token',
                amountMinor: '200',
                currency: 'EUR',
                paidById: created.memberId,
                splitMode: 'EXACT',
                exactShares: [{ memberId: created.memberId, amountMinor: '200' }],
            },
        })
        expect(
            anonymous.body.expenses.find((expense) => expense.description === 'Filed without a member token')
                ?.createdById
        ).toBeNull()
    })

    it('goes create → join → split → settle → all square', async () => {
        const { body: created } = await newRoom()
        const slug = created.room.slug
        const ana = created.memberId
        const { body: withBea } = await join(slug, 'Bea')
        const bea = withBea.memberId
        const { body: withCaro } = await join(slug, 'Caro')
        const caro = withCaro.memberId

        // EQUAL: €10 three ways — 3.34 / 3.33 / 3.33.
        const { status: expenseStatus, body: afterEqual } = await call<RoomState>(postExpense as Handler, {
            path: `/api/rooms/${slug}/expenses`,
            method: 'POST',
            params: { slug },
            token: created.memberToken,
            body: {
                description: 'Cable car',
                amountMinor: '1000',
                currency: 'EUR',
                paidById: ana,
                splitMode: 'EQUAL',
            },
        })
        expect(expenseStatus).toBe(201)
        expect(afterEqual.expenses[0].shares.map((s) => s.amountMinor)).toEqual(['334', '333', '333'])
        expect(afterEqual.expenses[0].createdById).toBe(ana)
        expect(afterEqual.balances).toEqual({ [ana]: '666', [bea]: '-333', [caro]: '-333' })
        expect(netsToZero(afterEqual)).toBe(true)

        // EXACT in a foreign currency: ฿3000 paid by Bea, ฿1000 Ana / ฿2000 Caro.
        const { body: afterExact } = await call<RoomState>(postExpense as Handler, {
            path: `/api/rooms/${slug}/expenses`,
            method: 'POST',
            params: { slug },
            token: withBea.memberToken,
            body: {
                description: 'Dinner in Bangkok',
                amountMinor: '300000',
                currency: 'THB',
                paidById: bea,
                splitMode: 'EXACT',
                exactShares: [
                    { memberId: ana, amountMinor: '100000' },
                    { memberId: caro, amountMinor: '200000' },
                ],
            },
        })
        const exact = afterExact.expenses.find((e) => e.currency === 'THB')!
        expect(exact.baseAmountMinor).toBe('7778')
        expect(exact.shares.map((s) => s.enteredAmountMinor)).toEqual(['100000', '200000'])
        expect(exact.shares.reduce((a, s) => a + BigInt(s.amountMinor), 0n)).toBe(7778n)
        expect(netsToZero(afterExact)).toBe(true)

        // Re-open and re-save that expense verbatim: balances must not drift.
        const before = afterExact.balances
        const { status: patchStatus, body: afterResave } = await call<RoomState>(patchExpense as Handler, {
            path: `/api/rooms/${slug}/expenses/${exact.id}`,
            method: 'PATCH',
            params: { slug, id: exact.id },
            body: {
                description: exact.description,
                amountMinor: exact.amountMinor,
                currency: exact.currency,
                paidById: exact.paidById,
                splitMode: 'EXACT',
                exactShares: exact.shares.map((s) => ({ memberId: s.memberId, amountMinor: s.enteredAmountMinor! })),
            },
        })
        expect(patchStatus).toBe(200)
        expect(afterResave.balances).toEqual(before)
        const resaved = afterResave.expenses.find((e) => e.id === exact.id)!
        expect(resaved.date).toBe(exact.date)
        expect(resaved.shares.map((s) => s.amountMinor)).toEqual(exact.shares.map((s) => s.amountMinor))

        // Settle every suggested transfer.
        let state = afterResave
        expect(state.suggestedTransfers.length).toBeLessThanOrEqual(state.members.length - 1)
        for (const transfer of state.suggestedTransfers) {
            const { status, body } = await call<RoomState>(postSettlement as Handler, {
                path: `/api/rooms/${slug}/settlements`,
                method: 'POST',
                params: { slug },
                token: created.memberToken,
                body: {
                    ...transfer,
                    method: 'peanut',
                    note: 'via the settle sheet',
                    receiptUrl: 'https://receipts.example/payment/abc',
                },
            })
            expect(status).toBe(201)
            state = body
        }
        expect(state.suggestedTransfers).toEqual([])
        expect(Object.values(state.balances).every((b) => b === '0')).toBe(true)
        expect(state.settlements[0].method).toBe('peanut')
        expect(state.settlements[0].receiptUrl).toBe('https://receipts.example/payment/abc')
        expect(state.settlements[0].createdById).toBe(ana)

        // Undoing a settlement re-opens the debt.
        const settlementId = state.settlements[0].id
        const { body: afterUndo } = await call<RoomState>(deleteSettlement as Handler, {
            path: `/api/rooms/${slug}/settlements/${settlementId}`,
            method: 'DELETE',
            params: { slug, id: settlementId },
        })
        expect(afterUndo.settlements.some((s) => s.id === settlementId)).toBe(false)
        expect(afterUndo.suggestedTransfers.length).toBeGreaterThan(0)
        expect(netsToZero(afterUndo)).toBe(true)
        const auditRow = await prisma.settlement.findUniqueOrThrow({ where: { id: settlementId } })
        expect(auditRow.deletedAt).not.toBeNull()
        expect(auditRow.method).toBe('peanut')
        expect(auditRow.receiptUrl).toBe('https://receipts.example/payment/abc')
        expect(auditRow.createdById).toBe(ana)
        expect(auditRow.amountMinor).toBeGreaterThan(0n)
        expect(auditRow.createdAt).toBeInstanceOf(Date)
    })

    it('recomputes EQUAL shares when the expense is edited', async () => {
        const { body: created } = await newRoom()
        const slug = created.room.slug
        const ana = created.memberId
        const bea = (await join(slug, 'Bea')).body.memberId

        const { body: afterAdd } = await call<RoomState>(postExpense as Handler, {
            path: `/api/rooms/${slug}/expenses`,
            method: 'POST',
            params: { slug },
            body: { description: 'Taxi', amountMinor: '1000', currency: 'EUR', paidById: ana, splitMode: 'EQUAL' },
        })
        const expenseId = afterAdd.expenses[0].id
        expect(afterAdd.balances[bea]).toBe('-500')

        const { body: afterEdit } = await call<RoomState>(patchExpense as Handler, {
            path: `/api/rooms/${slug}/expenses/${expenseId}`,
            method: 'PATCH',
            params: { slug, id: expenseId },
            body: {
                description: 'Taxi (both ways)',
                amountMinor: '2001',
                currency: 'EUR',
                paidById: ana,
                splitMode: 'EQUAL',
            },
        })
        expect(afterEdit.expenses[0].description).toBe('Taxi (both ways)')
        expect(afterEdit.expenses[0].shares.map((s) => s.amountMinor)).toEqual(['1001', '1000'])
        expect(afterEdit.balances[bea]).toBe('-1000')
        expect(netsToZero(afterEdit)).toBe(true)
    })

    it('keeps the name on a PATCH that does not mention it, and clears it on an empty one', async () => {
        const { body: created } = await newRoom()
        const slug = created.room.slug
        const ana = created.memberId

        const { body: afterAdd } = await call<RoomState>(postExpense as Handler, {
            path: `/api/rooms/${slug}/expenses`,
            method: 'POST',
            params: { slug },
            body: {
                description: 'Lift passes',
                amountMinor: '1000',
                currency: 'EUR',
                paidById: ana,
                splitMode: 'EQUAL',
            },
        })
        const expenseId = afterAdd.expenses[0].id
        const edit = (body: Record<string, unknown>) =>
            call<RoomState>(patchExpense as Handler, {
                path: `/api/rooms/${slug}/expenses/${expenseId}`,
                method: 'PATCH',
                params: { slug, id: expenseId },
                body: { amountMinor: '1000', currency: 'EUR', paidById: ana, splitMode: 'EQUAL', ...body },
            })

        // No `description` key: the client moved the amount, not the name. The
        // create schema's `.default('')` used to blank it here.
        const { body: untouched } = await edit({ amountMinor: '1500' })
        expect(untouched.expenses[0].description).toBe('Lift passes')

        // An explicit empty string still means "take the name off".
        const { body: cleared } = await edit({ description: '' })
        expect(cleared.expenses[0].description).toBe('')
    })

    it('soft-deletes an expense and restores it unchanged', async () => {
        const { body: created } = await newRoom()
        const slug = created.room.slug
        const ana = created.memberId
        await join(slug, 'Bea')

        const { body: afterAdd } = await call<RoomState>(postExpense as Handler, {
            path: `/api/rooms/${slug}/expenses`,
            method: 'POST',
            params: { slug },
            body: { description: 'Wine', amountMinor: '1000', currency: 'EUR', paidById: ana, splitMode: 'EQUAL' },
        })
        const expenseId = afterAdd.expenses[0].id

        const { body: afterDelete } = await call<RoomState>(deleteExpense as Handler, {
            path: `/api/rooms/${slug}/expenses/${expenseId}`,
            method: 'DELETE',
            params: { slug, id: expenseId },
        })
        expect(afterDelete.expenses).toHaveLength(0)
        expect(Object.values(afterDelete.balances).every((b) => b === '0')).toBe(true)

        // Deleting twice is a no-op — the undo toast is tappable more than once.
        const { status: secondDelete } = await call<RoomState>(deleteExpense as Handler, {
            path: `/api/rooms/${slug}/expenses/${expenseId}`,
            method: 'DELETE',
            params: { slug, id: expenseId },
        })
        expect(secondDelete).toBe(200)

        const { status, body: afterRestore } = await call<RoomState>(restoreExpense as Handler, {
            path: `/api/rooms/${slug}/expenses/${expenseId}/restore`,
            method: 'POST',
            params: { slug, id: expenseId },
        })
        expect(status).toBe(200)
        expect(afterRestore.expenses).toHaveLength(1)
        expect(afterRestore.balances).toEqual(afterAdd.balances)
    })

    it('refuses to edit a deleted expense until it is restored', async () => {
        const { body: created } = await newRoom()
        const slug = created.room.slug
        const ana = created.memberId
        const { body: afterAdd } = await call<RoomState>(postExpense as Handler, {
            path: `/api/rooms/${slug}/expenses`,
            method: 'POST',
            params: { slug },
            body: { description: 'Wine', amountMinor: '1000', currency: 'EUR', paidById: ana, splitMode: 'EQUAL' },
        })
        const expenseId = afterAdd.expenses[0].id
        await call(deleteExpense as Handler, {
            path: `/api/rooms/${slug}/expenses/${expenseId}`,
            method: 'DELETE',
            params: { slug, id: expenseId },
        })
        const { status, body } = await call<ApiError>(patchExpense as Handler, {
            path: `/api/rooms/${slug}/expenses/${expenseId}`,
            method: 'PATCH',
            params: { slug, id: expenseId },
            body: { description: 'Wine', amountMinor: '900', currency: 'EUR', paidById: ana, splitMode: 'EQUAL' },
        })
        expect(status).toBe(409)
        expect(body.error.code).toBe('EXPENSE_DELETED')
    })

    it('requires the saved weighted mode before replacing its shares', async () => {
        const { body: created } = await newRoom()
        const slug = created.room.slug
        const ana = created.memberId
        const bea = (await join(slug, 'Bea')).body.memberId
        const { body: afterAdd } = await call<RoomState>(postExpense as Handler, {
            path: `/api/rooms/${slug}/expenses`,
            method: 'POST',
            params: { slug },
            body: {
                description: 'Cabin',
                amountMinor: '1000',
                currency: 'EUR',
                paidById: ana,
                splitMode: 'PERCENTAGE',
                weightedShares: [
                    { memberId: ana, weight: '2500' },
                    { memberId: bea, weight: '7500' },
                ],
            },
        })
        const saved = afterAdd.expenses[0]

        // An older cached client knows nothing about expectedSplitMode. It must
        // not flatten a newer weighted split into its default EQUAL payload.
        const legacy = await call<ApiError>(patchExpense as Handler, {
            path: `/api/rooms/${slug}/expenses/${saved.id}`,
            method: 'PATCH',
            params: { slug, id: saved.id },
            body: {
                description: 'Cabin from old tab',
                amountMinor: '1000',
                currency: 'EUR',
                paidById: ana,
                splitMode: 'EQUAL',
            },
        })
        expect(legacy.status).toBe(409)
        expect(legacy.body.error.code).toBe('SPLIT_MODE_CONFLICT')

        const unchanged = await prisma.expense.findUniqueOrThrow({
            where: { id: saved.id },
            include: { shares: { orderBy: { memberId: 'asc' } } },
        })
        expect(unchanged.splitMode).toBe('PERCENTAGE')
        expect(unchanged.shares.map((share) => share.splitWeight).sort()).toEqual([2500n, 7500n])

        const guarded = await call<RoomState>(patchExpense as Handler, {
            path: `/api/rooms/${slug}/expenses/${saved.id}`,
            method: 'PATCH',
            params: { slug, id: saved.id },
            body: {
                description: 'Cabin by shares',
                amountMinor: '1000',
                currency: 'EUR',
                paidById: ana,
                splitMode: 'SHARES',
                weightedShares: [
                    { memberId: ana, weight: '1' },
                    { memberId: bea, weight: '3' },
                ],
                expectedSplitMode: 'PERCENTAGE',
            },
        })
        expect(guarded.status).toBe(200)
        expect(guarded.body.expenses[0].splitMode).toBe('SHARES')
    })
})

describe('write validation', () => {
    const expenseBody = (paidById: string, overrides: Record<string, unknown> = {}) => ({
        description: 'Lunch',
        amountMinor: '1000',
        currency: 'EUR',
        paidById,
        splitMode: 'EQUAL',
        ...overrides,
    })

    it('rejects a zero amount, an unknown payer and a foreign member', async () => {
        const { body: created } = await newRoom()
        const slug = created.room.slug
        const ana = created.memberId
        const post = (body: unknown) =>
            call<ApiError>(postExpense as Handler, {
                path: `/api/rooms/${slug}/expenses`,
                method: 'POST',
                params: { slug },
                body,
            })

        expect((await post(expenseBody(ana, { amountMinor: '0' }))).status).toBe(400)
        expect((await post(expenseBody('someone-else'))).status).toBe(400)
        expect((await post(expenseBody(ana, { participantIds: [ana, 'ghost'] }))).status).toBe(400)
        expect((await post(expenseBody(ana, { participantIds: [ana, ana] }))).status).toBe(400)
        expect((await post(expenseBody(ana, { currency: 'XYZ' }))).status).toBe(400)
        // A blank name is NOT a validation failure — the row is labelled by its day.
        expect((await post(expenseBody(ana, { description: '' }))).status).toBe(201)
        expect((await post(expenseBody(ana, { amountMinor: '10.00' }))).status).toBe(400)
        expect((await post(expenseBody(ana, { amountMinor: 1000 }))).status).toBe(400)
        expect((await post(expenseBody(ana, { amountMinor: '9223372036854775808' }))).status).toBe(400)
    })

    it('rejects EXACT shares that do not add up to the total', async () => {
        const { body: created } = await newRoom()
        const slug = created.room.slug
        const ana = created.memberId
        const bea = (await join(slug, 'Bea')).body.memberId

        const { status, body } = await call<ApiError>(postExpense as Handler, {
            path: `/api/rooms/${slug}/expenses`,
            method: 'POST',
            params: { slug },
            body: expenseBody(ana, {
                splitMode: 'EXACT',
                exactShares: [
                    { memberId: ana, amountMinor: '400' },
                    { memberId: bea, amountMinor: '400' },
                ],
            }),
        })
        expect(status).toBe(400)
        expect(body.error.message).toMatch(/add up/)
    })

    it('rejects a settlement to yourself and a settlement of zero', async () => {
        const { body: created } = await newRoom()
        const slug = created.room.slug
        const ana = created.memberId
        const bea = (await join(slug, 'Bea')).body.memberId
        const post = (body: unknown) =>
            call<ApiError>(postSettlement as Handler, {
                path: `/api/rooms/${slug}/settlements`,
                method: 'POST',
                params: { slug },
                body,
            })

        expect((await post({ fromId: ana, toId: ana, amountMinor: '100' })).status).toBe(400)
        expect((await post({ fromId: ana, toId: bea, amountMinor: '0' })).status).toBe(400)
        expect((await post({ fromId: ana, toId: bea, amountMinor: 100 })).status).toBe(400)
        expect((await post({ fromId: ana, toId: bea, amountMinor: '9223372036854775808' })).status).toBe(400)
        expect((await post({ fromId: ana, toId: 'ghost', amountMinor: '100' })).status).toBe(400)
        const malformedReceipt = await post({
            fromId: ana,
            toId: bea,
            amountMinor: '100',
            receiptUrl: 'not a url',
        })
        expect(malformedReceipt.status).toBe(400)
        expect(malformedReceipt.body.error.code).toBe('VALIDATION_ERROR')
        expect(await prisma.settlement.count({ where: { roomId: created.room.id } })).toBe(0)
    })

    it('404s on an expense that belongs to another room', async () => {
        const { body: roomA } = await newRoom()
        const { body: roomB } = await newRoom({ name: 'Other' })
        const { body: added } = await call<RoomState>(postExpense as Handler, {
            path: `/api/rooms/${roomA.room.slug}/expenses`,
            method: 'POST',
            params: { slug: roomA.room.slug },
            body: expenseBody(roomA.memberId),
        })
        const { status } = await call<ApiError>(deleteExpense as Handler, {
            path: `/api/rooms/${roomB.room.slug}/expenses/${added.expenses[0].id}`,
            method: 'DELETE',
            params: { slug: roomB.room.slug, id: added.expenses[0].id },
        })
        expect(status).toBe(404)
    })
})

describe('manual custom-currency conversion', () => {
    const customExpense = (paidById: string, overrides: Record<string, unknown> = {}) => ({
        description: 'Friday round',
        amountMinor: '1000',
        currency: 'BEER',
        manualFxRate: '5',
        paidById,
        splitMode: 'EQUAL',
        ...overrides,
    })

    it('persists and prices all 24 digits of a large Decimal manual rate', async () => {
        const { body: created } = await newRoom()
        const rawRate = '123456789012.123456789012'
        const result = await call<RoomState>(postExpense as Handler, {
            path: `/api/rooms/${created.room.slug}/expenses`,
            method: 'POST',
            params: { slug: created.room.slug },
            body: customExpense(created.memberId, { amountMinor: '3001', manualFxRate: rawRate }),
        })

        expect(result.status).toBe(201)
        expect(result.body.expenses[0].baseAmountMinor).toBe('370493823825382')
        const stored = await prisma.expense.findUniqueOrThrow({ where: { id: result.body.expenses[0].id } })
        expect(stored.fxRate.toFixed(12)).toBe(rawRate)
        expect(stored.baseAmountMinor).toBe(370_493_823_825_382n)
    })

    it('returns and reuses the smallest stored rate as a plain decimal', async () => {
        const { body: created } = await newRoom()
        const slug = created.room.slug
        const added = await call<RoomState>(postExpense as Handler, {
            path: `/api/rooms/${slug}/expenses`,
            method: 'POST',
            params: { slug },
            body: customExpense(created.memberId, {
                amountMinor: '1000000000000',
                manualFxRate: '0.000000000001',
            }),
        })

        expect(added.status).toBe(201)
        expect(added.body.expenses[0].fxRate).toBe('0.000000000001')
        expect(added.body.expenses[0].baseAmountMinor).toBe('1')

        const renamed = await call<RoomState>(patchExpense as Handler, {
            path: `/api/rooms/${slug}/expenses/${added.body.expenses[0].id}`,
            method: 'PATCH',
            params: { slug, id: added.body.expenses[0].id },
            body: customExpense(created.memberId, {
                description: 'Tiny frozen rate',
                amountMinor: '1000000000000',
                manualFxRate: undefined,
            }),
        })

        expect(renamed.status).toBe(200)
        expect(renamed.body.expenses[0].fxRate).toBe('0.000000000001')
        expect(renamed.body.expenses[0].baseAmountMinor).toBe('1')
    })

    it('persists the frozen rate and keeps it on rename, then reprices for an explicit change', async () => {
        const { body: created } = await newRoom()
        const slug = created.room.slug
        const ana = created.memberId
        const bea = (await join(slug, 'Bea')).body.memberId

        const added = await call<RoomState>(postExpense as Handler, {
            path: `/api/rooms/${slug}/expenses`,
            method: 'POST',
            params: { slug },
            body: customExpense(ana),
        })
        expect(added.status).toBe(201)
        const expense = added.body.expenses[0]
        expect(expense.fxRate).toBe('5')
        expect(expense.baseAmountMinor).toBe('5000')
        expect(added.body.balances).toEqual({ [ana]: '2500', [bea]: '-2500' })
        expect(netsToZero(added.body)).toBe(true)

        const renamed = await call<RoomState>(patchExpense as Handler, {
            path: `/api/rooms/${slug}/expenses/${expense.id}`,
            method: 'PATCH',
            params: { slug, id: expense.id },
            body: customExpense(ana, { description: 'Friday round (final)', manualFxRate: undefined }),
        })
        expect(renamed.status).toBe(200)
        expect(renamed.body.expenses[0].fxRate).toBe(expense.fxRate)
        expect(renamed.body.expenses[0].baseAmountMinor).toBe(expense.baseAmountMinor)
        expect(renamed.body.balances).toEqual(added.body.balances)

        const repriced = await call<RoomState>(patchExpense as Handler, {
            path: `/api/rooms/${slug}/expenses/${expense.id}`,
            method: 'PATCH',
            params: { slug, id: expense.id },
            body: customExpense(ana, { description: 'Friday round (final)', manualFxRate: '6' }),
        })
        expect(repriced.status).toBe(200)
        expect(repriced.body.expenses[0].fxRate).toBe('6')
        expect(repriced.body.expenses[0].baseAmountMinor).toBe('6000')
        expect(repriced.body.balances).toEqual({ [ana]: '3000', [bea]: '-3000' })
        expect(netsToZero(repriced.body)).toBe(true)

        const stored = await prisma.expense.findUniqueOrThrow({ where: { id: expense.id } })
        expect(stored.fxRate.toFixed(12)).toBe('6.000000000000')
        expect(stored.baseAmountMinor).toBe(6000n)
    })

    it('requires the custom agreement, forbids catalog overrides, and refuses a zero room total', async () => {
        const { body: created } = await newRoom()
        const slug = created.room.slug
        const post = (overrides: Record<string, unknown>) =>
            call<ApiError>(postExpense as Handler, {
                path: `/api/rooms/${slug}/expenses`,
                method: 'POST',
                params: { slug },
                body: customExpense(created.memberId, overrides),
            })

        const missing = await post({ manualFxRate: undefined })
        expect(missing.status).toBe(400)
        expect(missing.body.error.code).toBe('MANUAL_FX_RATE_REQUIRED')

        const catalogOverride = await post({ currency: 'USD', manualFxRate: '7' })
        expect(catalogOverride.status).toBe(400)
        expect(catalogOverride.body.error.code).toBe('MANUAL_FX_RATE_NOT_ALLOWED')

        const roundedToZero = await post({ amountMinor: '1', manualFxRate: '0.000000000001' })
        expect(roundedToZero.status).toBe(400)
        expect(roundedToZero.body.error.code).toBe('MANUAL_FX_RATE_INVALID')
        expect(await prisma.expense.count({ where: { roomId: created.room.id } })).toBe(0)
    })
})

describe('fx is locked at creation', () => {
    /** The static table is deterministic but immovable, and these tests need the
     *  rate to MOVE between a write and an edit. Seeding a complete, fresh cache
     *  gives a movable table that still never reaches the network. */
    const seedRates = async (overrides: Record<string, number>) => {
        await prisma.fxRate.deleteMany()
        const usdRates = { ...STATIC_USD_PER_UNIT, ...overrides }
        await prisma.fxRate.createMany({
            data: Object.entries(usdRates).map(([code, usdPerUnit]) => ({
                base: 'EUR',
                quote: code,
                rate: usdPerUnit / usdRates.EUR,
                fetchedAt: new Date(),
            })),
        })
    }

    beforeEach(() => {
        process.env.SPLIT_FX_MODE = ''
    })
    afterEach(() => {
        process.env.SPLIT_FX_MODE = 'static'
    })

    it('keeps the creation rate through an edit, and re-derives it when the currency changes', async () => {
        await seedRates({})
        const { body: created } = await newRoom()
        const slug = created.room.slug
        const ana = created.memberId
        const expense = (body: Record<string, unknown>) => ({
            description: 'Marina fees',
            amountMinor: '300000',
            currency: 'THB',
            paidById: ana,
            splitMode: 'EQUAL',
            ...body,
        })

        const { body: afterAdd } = await call<RoomState>(postExpense as Handler, {
            path: `/api/rooms/${slug}/expenses`,
            method: 'POST',
            params: { slug },
            body: expense({}),
        })
        const added = afterAdd.expenses[0]
        expect(Number(added.fxRate)).toBeCloseTo(0.028 / 1.08, 12)

        // The world moves under the expense: THB doubles, GBP doubles.
        await seedRates({ THB: 0.056, GBP: 2.54 })

        const { body: afterRename } = await call<RoomState>(patchExpense as Handler, {
            path: `/api/rooms/${slug}/expenses/${added.id}`,
            method: 'PATCH',
            params: { slug, id: added.id },
            body: expense({ description: 'Marina fees (final)' }),
        })
        const renamed = afterRename.expenses[0]
        expect(renamed.description).toBe('Marina fees (final)')
        // Fixing a typo must not move anyone's balance.
        expect(renamed.fxRate).toBe(added.fxRate)
        expect(renamed.baseAmountMinor).toBe(added.baseAmountMinor)
        expect(renamed.shares.map((s) => s.amountMinor)).toEqual(added.shares.map((s) => s.amountMinor))

        // A different currency makes the stored rate meaningless — re-derive it.
        const { body: afterCurrency } = await call<RoomState>(patchExpense as Handler, {
            path: `/api/rooms/${slug}/expenses/${added.id}`,
            method: 'PATCH',
            params: { slug, id: added.id },
            body: expense({ currency: 'GBP' }),
        })
        const repriced = afterCurrency.expenses[0]
        expect(Number(repriced.fxRate)).toBeCloseTo(2.54 / 1.08, 12)
        expect(repriced.baseAmountMinor).not.toBe(added.baseAmountMinor)
    })
})

describe('foreign EXACT share apportionment', () => {
    it('persists only nonnegative shares that sum exactly to the converted total', async () => {
        const { body: created } = await newRoom()
        const slug = created.room.slug
        const members = [created.memberId]
        for (const name of ['Bea', 'Caro', 'Dani']) members.push((await join(slug, name)).body.memberId)

        // At the static BRL→EUR rate, each R$0.03 share independently rounds to
        // €0.01, but the R$0.12 total is €0.02. The old reconciliation wrote a
        // negative share to force four rounded cents back to two.
        const { status, body } = await call<RoomState>(postExpense as Handler, {
            path: `/api/rooms/${slug}/expenses`,
            method: 'POST',
            params: { slug },
            body: {
                description: 'Four tiny coffees',
                amountMinor: '12',
                currency: 'BRL',
                paidById: created.memberId,
                splitMode: 'EXACT',
                exactShares: members.map((memberId) => ({ memberId, amountMinor: '3' })),
            },
        })

        expect(status).toBe(201)
        const expense = body.expenses[0]
        expect(expense.baseAmountMinor).toBe('2')
        expect(expense.shares.map((share) => share.amountMinor)).toEqual(['1', '1', '0', '0'])
        expect(expense.shares.every((share) => BigInt(share.amountMinor) >= 0n)).toBe(true)
        expect(expense.shares.reduce((sum, share) => sum + BigInt(share.amountMinor), 0n)).toBe(2n)
        expect(netsToZero(body)).toBe(true)

        const stored = await prisma.expense.findUniqueOrThrow({
            where: { id: expense.id },
            include: { shares: true },
        })
        expect(stored.shares.every((share) => share.amountMinor >= 0n)).toBe(true)
        expect(stored.shares.reduce((sum, share) => sum + share.amountMinor, 0n)).toBe(stored.baseAmountMinor)
    })
})

describe('first shared balance activation', () => {
    const add = (slug: string, paidById: string, clientKey: string) =>
        call<ExpenseCreateResult>(postExpense as Handler, {
            path: `/api/rooms/${slug}/expenses`,
            method: 'POST',
            params: { slug },
            body: {
                clientKey,
                description: 'Dinner',
                amountMinor: '4000',
                currency: 'EUR',
                paidById,
                splitMode: 'EQUAL',
            },
        })

    it('fires once, and deleting the triggering expense does not re-arm it', async () => {
        const { body: created } = await newRoom()
        const slug = created.room.slug

        const solo = await add(slug, created.memberId, 'solo-expense-key-0001')
        expect(solo.body.createdFirstSharedBalance).toBe(false)

        await join(slug, 'Bea')
        const firstId = 'first-shared-key-0001'
        const first = await add(slug, created.memberId, firstId)
        expect(first.body.createdFirstSharedBalance).toBe(true)
        expect(first.body.expenses.some((expense) => expense.id === firstId)).toBe(true)

        const second = await add(slug, created.memberId, 'second-shared-key-0001')
        expect(second.body.createdFirstSharedBalance).toBe(false)
        expect(
            (await prisma.room.findUniqueOrThrow({ where: { id: created.room.id } })).firstSharedBalanceExpenseId
        ).toBe(firstId)

        await call<RoomState>(deleteExpense as Handler, {
            path: `/api/rooms/${slug}/expenses/${firstId}`,
            method: 'DELETE',
            params: { slug, id: firstId },
        })
        const afterDelete = await add(slug, created.memberId, 'after-delete-key-0001')
        expect(afterDelete.body.createdFirstSharedBalance).toBe(false)
        expect(
            (await prisma.room.findUniqueOrThrow({ where: { id: created.room.id } })).firstSharedBalanceExpenseId
        ).toBe(firstId)
    })

    it('serializes distinct first-balance candidates so exactly one fires', async () => {
        const { body: created } = await newRoom()
        await join(created.room.slug, 'Bea')

        const results = await Promise.all([
            add(created.room.slug, created.memberId, 'concurrent-shared-key-01'),
            add(created.room.slug, created.memberId, 'concurrent-shared-key-02'),
        ])

        expect(results.filter((result) => result.body.createdFirstSharedBalance)).toHaveLength(1)
        const marker = (await prisma.room.findUniqueOrThrow({ where: { id: created.room.id } }))
            .firstSharedBalanceExpenseId
        const winner = results.find((result) => result.body.createdFirstSharedBalance)
        expect(marker).not.toBeNull()
        expect(winner?.body.expenses.some((expense) => expense.id === marker)).toBe(true)
    })
})

describe('expense request idempotency', () => {
    const key = 'expense-retry-key-0001'

    const bodyFor = (paidById: string) => ({
        clientKey: key,
        description: 'Dinner',
        amountMinor: '4000',
        currency: 'EUR',
        paidById,
        splitMode: 'EQUAL',
    })

    it('returns the original write for sequential and concurrent retries', async () => {
        const { body: created } = await newRoom()
        const slug = created.room.slug
        await join(slug, 'Bea')
        const post = () =>
            call<ExpenseCreateResult>(postExpense as Handler, {
                path: `/api/rooms/${slug}/expenses`,
                method: 'POST',
                params: { slug },
                body: bodyFor(created.memberId),
            })

        const first = await post()
        expect(first.status).toBe(201)
        expect(first.body.createdFirstSharedBalance).toBe(true)
        const retries = await Promise.all(Array.from({ length: 6 }, post))
        expect(retries.every((result) => result.status === 201)).toBe(true)
        expect(retries.every((result) => result.body.createdFirstSharedBalance)).toBe(true)
        expect(await prisma.expense.count({ where: { id: key, roomId: created.room.id } })).toBe(1)
        expect(await prisma.expenseShare.count({ where: { expenseId: key } })).toBe(2)
    })

    it('returns a committed retry before validating a token rotated by remove and restore', async () => {
        const { body: created } = await newRoom()
        const { body: bea } = await join(created.room.slug, 'Bea')
        const clientKey = 'expense-rotated-token-retry-01'
        const post = () =>
            call<ExpenseCreateResult>(postExpense as Handler, {
                path: `/api/rooms/${created.room.slug}/expenses`,
                method: 'POST',
                params: { slug: created.room.slug },
                token: bea.memberToken,
                body: {
                    clientKey,
                    description: 'Ana-only attributed fact',
                    amountMinor: '100',
                    currency: 'EUR',
                    paidById: created.memberId,
                    splitMode: 'EXACT',
                    exactShares: [{ memberId: created.memberId, amountMinor: '100' }],
                },
            })

        expect((await post()).status).toBe(201)
        await removeMember(created.room.slug, bea.memberId)
        await reactivateMember(created.room.slug, bea.memberId)
        expect((await prisma.member.findUniqueOrThrow({ where: { id: bea.memberId } })).token).not.toBe(bea.memberToken)

        expect((await post()).status).toBe(201)
        expect(await prisma.expense.count({ where: { id: clientKey } })).toBe(1)
    })

    it('turns a concurrent cross-room key collision into 409, never 500', async () => {
        const { body: first } = await newRoom({ name: 'First' })
        const { body: second } = await newRoom({ name: 'Second' })
        const post = (room: RoomStateWithMember) =>
            call<RoomState | ApiError>(postExpense as Handler, {
                path: `/api/rooms/${room.room.slug}/expenses`,
                method: 'POST',
                params: { slug: room.room.slug },
                body: bodyFor(room.memberId),
            })

        const results = await Promise.all([post(first), post(second)])
        expect(results.map((result) => result.status).sort()).toEqual([201, 409])
        expect(results.some((result) => result.status === 500)).toBe(false)
        const conflictResult = results.find((result) => result.status === 409)!
        expect((conflictResult.body as ApiError).error.code).toBe('IDEMPOTENCY_KEY_REUSED')
        expect(await prisma.expense.count({ where: { id: key } })).toBe(1)
    })
})

describe('rate limiting', () => {
    it('429s room creation once the hourly bucket is empty', async () => {
        for (let i = 0; i < 20; i++) expect((await newRoom()).status).toBe(201)
        const { status, body } = await newRoom()
        expect(status).toBe(429)
        expect((body as unknown as ApiError).error.code).toBe('RATE_LIMITED')
    })
})

/**
 * Part-paying a debt. The route has always taken an arbitrary positive amount —
 * this pins that, because the settle sheet now offers it and a regression here
 * would silently turn "I gave you half" into "I gave you all of it".
 */
describe('recording part of a debt', () => {
    it('leaves the remainder outstanding and keeps the room net to zero', async () => {
        const { body: created } = await newRoom()
        const slug = created.room.slug
        const ana = created.memberId
        const { body: withBea } = await join(slug, 'Bea')
        const bea = withBea.memberId

        await call<RoomState>(postExpense as Handler, {
            path: `/api/rooms/${slug}/expenses`,
            method: 'POST',
            params: { slug },
            token: created.memberToken,
            body: { description: 'Cabin', amountMinor: '10000', currency: 'EUR', paidById: ana, splitMode: 'EQUAL' },
        })

        const owed = (state: RoomState) => state.suggestedTransfers.map((t) => t.amountMinor)

        // Bea owes 50.00. She hands over 20.00 now.
        const { status, body: afterPart } = await call<RoomState>(postSettlement as Handler, {
            path: `/api/rooms/${slug}/settlements`,
            method: 'POST',
            params: { slug },
            token: withBea.memberToken,
            body: { fromId: bea, toId: ana, amountMinor: '2000', method: 'cash', note: 'rest on Friday' },
        })

        expect(status).toBe(201)
        expect(afterPart.settlements).toHaveLength(1)
        expect(afterPart.settlements[0].amountMinor).toBe('2000')
        // Method, note and who recorded it all survive to the wire — the three
        // fields the timeline row is built from.
        expect(afterPart.settlements[0].method).toBe('cash')
        expect(afterPart.settlements[0].note).toBe('rest on Friday')
        expect(afterPart.settlements[0].createdById).toBe(bea)
        expect(afterPart.balances).toEqual({ [ana]: '3000', [bea]: '-3000' })
        expect(owed(afterPart)).toEqual(['3000'])
        expect(netsToZero(afterPart)).toBe(true)

        // Friday. The rest clears it.
        const { body: afterRest } = await call<RoomState>(postSettlement as Handler, {
            path: `/api/rooms/${slug}/settlements`,
            method: 'POST',
            params: { slug },
            token: withBea.memberToken,
            body: { fromId: bea, toId: ana, amountMinor: '3000', method: 'bank' },
        })

        expect(afterRest.settlements).toHaveLength(2)
        expect(afterRest.balances).toEqual({ [ana]: '0', [bea]: '0' })
        expect(owed(afterRest)).toEqual([])
        expect(netsToZero(afterRest)).toBe(true)
    })

    it('refuses a payment of nothing', async () => {
        const { body: created } = await newRoom()
        const slug = created.room.slug
        const { body: withBea } = await join(slug, 'Bea')

        const { status, body } = await call<ApiError>(postSettlement as Handler, {
            path: `/api/rooms/${slug}/settlements`,
            method: 'POST',
            params: { slug },
            body: { fromId: withBea.memberId, toId: created.memberId, amountMinor: '0' },
        })

        expect(status).toBe(400)
        expect(body.error.code).toBe('AMOUNT_NOT_POSITIVE')
    })

    it('refuses to record more than the payer currently owes the payee', async () => {
        const { body: created } = await newRoom()
        const slug = created.room.slug
        const { body: withBea } = await join(slug, 'Bea')
        await call<RoomState>(postExpense as Handler, {
            path: `/api/rooms/${slug}/expenses`,
            method: 'POST',
            params: { slug },
            body: {
                description: 'Cabin',
                amountMinor: '10000',
                currency: 'EUR',
                paidById: created.memberId,
                splitMode: 'EQUAL',
            },
        })

        const { status, body } = await call<ApiError>(postSettlement as Handler, {
            path: `/api/rooms/${slug}/settlements`,
            method: 'POST',
            params: { slug },
            body: { fromId: withBea.memberId, toId: created.memberId, amountMinor: '5001' },
        })

        expect(status).toBe(400)
        expect(body.error.code).toBe('SETTLEMENT_EXCEEDS_DEBT')
        expect(await prisma.settlement.count()).toBe(0)
    })
})

describe('settlement request idempotency and serialization', () => {
    const roomWithDebt = async (name: string) => {
        const { body: created } = await newRoom({ name })
        const { body: joined } = await join(created.room.slug, 'Bea')
        await call<RoomState>(postExpense as Handler, {
            path: `/api/rooms/${created.room.slug}/expenses`,
            method: 'POST',
            params: { slug: created.room.slug },
            body: {
                description: 'Cabin',
                amountMinor: '10000',
                currency: 'EUR',
                paidById: created.memberId,
                splitMode: 'EQUAL',
            },
        })
        return { created, joined }
    }

    const settle = (room: Awaited<ReturnType<typeof roomWithDebt>>, clientKey: string, amountMinor = '5000') =>
        call<RoomState | ApiError>(postSettlement as Handler, {
            path: `/api/rooms/${room.created.room.slug}/settlements`,
            method: 'POST',
            params: { slug: room.created.room.slug },
            token: room.joined.memberToken,
            body: {
                clientKey,
                fromId: room.joined.memberId,
                toId: room.created.memberId,
                amountMinor,
                method: 'cash',
            },
        })

    it('checks the idempotency key before a retry sees the now-empty debt', async () => {
        const room = await roomWithDebt('Retry room')
        const clientKey = 'settlement-retry-key-0001'

        expect((await settle(room, clientKey)).status).toBe(201)
        expect((await settle(room, clientKey)).status).toBe(201)
        expect(await prisma.settlement.count({ where: { id: clientKey } })).toBe(1)
    })

    it('returns a committed retry before validating the now-Former actor token', async () => {
        const room = await roomWithDebt('Former retry room')
        const clientKey = 'settlement-former-token-retry-01'

        expect((await settle(room, clientKey)).status).toBe(201)
        expect((await removeMember(room.created.room.slug, room.joined.memberId)).status).toBe(200)

        expect((await settle(room, clientKey)).status).toBe(201)
        expect(await prisma.settlement.count({ where: { id: clientKey } })).toBe(1)
    })

    it('makes concurrent deliveries of one key one settlement', async () => {
        const room = await roomWithDebt('Concurrent retry room')
        const clientKey = 'settlement-concurrent-key-01'
        const results = await Promise.all(Array.from({ length: 8 }, () => settle(room, clientKey)))

        expect(results.every((result) => result.status === 201)).toBe(true)
        expect(await prisma.settlement.count({ where: { id: clientKey } })).toBe(1)
    })

    it('serializes distinct keys so their sum cannot exceed the debt', async () => {
        const room = await roomWithDebt('Serialized room')
        const results = await Promise.all(
            Array.from({ length: 8 }, (_, index) =>
                settle(room, `settlement-serialized-${String(index).padStart(4, '0')}`, '1000')
            )
        )

        expect(results.filter((result) => result.status === 201)).toHaveLength(5)
        expect(results.filter((result) => result.status === 400)).toHaveLength(3)
        expect(results.some((result) => result.status === 500)).toBe(false)
        expect(await prisma.settlement.count({ where: { roomId: room.created.room.id } })).toBe(5)
        const final = await call<RoomState>(getRoom as Handler, {
            path: `/api/rooms/${room.created.room.slug}`,
            params: { slug: room.created.room.slug },
        })
        expect(final.body.suggestedTransfers).toEqual([])
        expect(Object.values(final.body.balances).every((balance) => balance === '0')).toBe(true)
    })

    it('turns a concurrent cross-room key collision into 409, never 500', async () => {
        const first = await roomWithDebt('Settlement first')
        const second = await roomWithDebt('Settlement second')
        const clientKey = 'settlement-cross-room-key-01'
        const results = await Promise.all([settle(first, clientKey), settle(second, clientKey)])

        expect(results.map((result) => result.status).sort()).toEqual([201, 409])
        expect(results.some((result) => result.status === 500)).toBe(false)
        const conflictResult = results.find((result) => result.status === 409)!
        expect((conflictResult.body as ApiError).error.code).toBe('IDEMPOTENCY_KEY_REUSED')
        expect(await prisma.settlement.count({ where: { id: clientKey } })).toBe(1)
    })
})
