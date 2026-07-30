/**
 * Handler-level tests: the real route modules against the real `peanut_split_test`
 * database. No HTTP server — Next route handlers are plain functions.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma, truncateAll } from '@/server/test/db'
import { CURRENCIES } from '@/server/money'
import { resetRateLimits } from '@/server/rateLimit'
import { GET as getCurrencies } from '@/app/api/currencies/route'
import { GET as getRate } from '@/app/api/rate/route'
import { POST as postRoom } from '@/app/api/rooms/route'
import { GET as getRoom } from '@/app/api/rooms/[slug]/route'
import { POST as postMember } from '@/app/api/rooms/[slug]/members/route'
import { POST as claimMember } from '@/app/api/rooms/[slug]/members/[memberId]/claim/route'
import { DELETE as deleteMember } from '@/app/api/rooms/[slug]/members/[memberId]/route'
import { POST as postExpense } from '@/app/api/rooms/[slug]/expenses/route'
import { DELETE as deleteExpense, PATCH as patchExpense } from '@/app/api/rooms/[slug]/expenses/[id]/route'
import { POST as restoreExpense } from '@/app/api/expenses/[id]/restore/route'
import { POST as postSettlement } from '@/app/api/rooms/[slug]/settlements/route'
import { DELETE as deleteSettlement } from '@/app/api/rooms/[slug]/settlements/[id]/route'
import { GET as readiness } from '@/app/readiness/route'
import { GET as healthcheck } from '@/app/healthcheck/route'
import { backfillPatch, latecomerOffer } from '@/lib/latecomer'
import type { ApiError, RoomState, RoomStateWithAddedMember, RoomStateWithMember } from '@/lib/api-types'

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

const addPayer = (slug: string, name: string) =>
    call<RoomStateWithAddedMember>(postMember as Handler, {
        path: `/api/rooms/${slug}/members`,
        method: 'POST',
        params: { slug },
        body: { name, intent: 'add' },
    })

const claim = (slug: string, memberId: string) =>
    call<RoomStateWithMember>(claimMember as Handler, {
        path: `/api/rooms/${slug}/members/${memberId}/claim`,
        method: 'POST',
        params: { slug, memberId },
    })

const removeMember = (slug: string, memberId: string) =>
    call<RoomState | ApiError>(deleteMember as Handler, {
        path: `/api/rooms/${slug}/members/${memberId}`,
        method: 'DELETE',
        params: { slug, memberId },
    })

const waitForAdvisoryWaiters = async (minimum: number): Promise<void> => {
    for (let attempt = 0; attempt < 100; attempt++) {
        const [row] = await prisma.$queryRaw<[{ count: bigint }]>`
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
    it('lists the currency catalog', async () => {
        const { status, body } = await call<{ currencies: { code: string; decimals: number }[] }>(
            getCurrencies as unknown as Handler,
            { path: '/api/currencies' }
        )
        expect(status).toBe(200)
        expect(body.currencies).toHaveLength(12)
        expect(body.currencies.find((c) => c.code === 'JPY')?.decimals).toBe(0)
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

    it('rejects an unsupported currency', async () => {
        const { status, body } = await call<ApiError>(getRate as Handler, { path: '/api/rate?from=EUR&to=XYZ' })
        expect(status).toBe(400)
        expect(body.error.code).toBe('VALIDATION_ERROR')
    })
})

describe('rooms and members', () => {
    it('creates a room with a shareable slug and a creator token', async () => {
        const { status, body } = await newRoom()
        expect(status).toBe(201)
        expect(body.room.slug).toMatch(/^ski-trip-[0-9a-hjkmnp-tv-z]{6}$/)
        expect(body.room.emoji).toBe('🎿')
        expect(body.members).toHaveLength(1)
        expect(body.memberId).toBe(body.members[0].id)
        expect(body.memberToken).toBeTruthy()
        expect(body.balances[body.memberId]).toBe('0')
    })

    it('never leaks a member token through a room read', async () => {
        const { body: created } = await newRoom()
        const { body } = await call<RoomState>(getRoom as Handler, {
            path: `/api/rooms/${created.room.slug}`,
            params: { slug: created.room.slug },
        })
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

    it('removes only an untouched on-behalf placeholder', async () => {
        const { body: created } = await newRoom()
        const { body: added } = await addPayer(created.room.slug, 'Bea')

        const removed = await removeMember(created.room.slug, added.memberId)
        expect(removed.status).toBe(200)
        expect((removed.body as RoomState).members.map((member) => member.name)).toEqual(['Ana'])
        expect(await prisma.member.findUnique({ where: { id: added.memberId } })).toBeNull()
    })

    it('permanently protects a placeholder as soon as that person claims it', async () => {
        const { body: created } = await newRoom()
        const { body: added } = await addPayer(created.room.slug, 'Bea')
        await claim(created.room.slug, added.memberId)

        const removal = await removeMember(created.room.slug, added.memberId)
        expect(removal.status).toBe(409)
        expect((removal.body as ApiError).error.code).toBe('MEMBER_HAS_HISTORY')
        expect(await prisma.member.findUnique({ where: { id: added.memberId } })).not.toBeNull()
    })

    it('protects a placeholder when even soft-deleted expense history references it', async () => {
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
        expect(fresh.body.members.find((member) => member.id === added.memberId)?.canRemove).toBe(false)
        const removal = await removeMember(created.room.slug, added.memberId)
        expect(removal.status).toBe(409)
        expect((removal.body as ApiError).error.code).toBe('MEMBER_HAS_HISTORY')
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
        expect((removed.body as ApiError).error.code).toBe('MEMBER_HAS_HISTORY')
        expect(await prisma.member.findUnique({ where: { id: added.memberId } })).not.toBeNull()
        expect(await prisma.expense.count({ where: { roomId: created.room.id, paidById: added.memberId } })).toBe(1)
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
        expect((removed.body as ApiError).error.code).toBe('MEMBER_HAS_HISTORY')
        expect(await prisma.member.findUnique({ where: { id: added.memberId } })).not.toBeNull()
        expect(
            await prisma.expense.count({ where: { id: expenseId, roomId: created.room.id, paidById: added.memberId } })
        ).toBe(1)
    })

    it('protects attribution, reaction, settlement and device history independently', async () => {
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
            expect(removal.status).toBe(409)
            expect((removal.body as ApiError).error.code).toBe('MEMBER_HAS_HISTORY')
        }
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
            path: `/api/expenses/${expenseId}/restore`,
            method: 'POST',
            params: { id: expenseId },
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

describe('fx is locked at creation', () => {
    /** The static table is deterministic but immovable, and these tests need the
     *  rate to MOVE between a write and an edit. Seeding a complete, fresh cache
     *  gives a movable table that still never reaches the network. */
    const seedRates = async (overrides: Record<string, number>) => {
        await prisma.fxRate.deleteMany()
        await prisma.fxRate.createMany({
            data: CURRENCIES.map((c) => ({
                base: 'USD',
                quote: c.code,
                rate: overrides[c.code] ?? c.usdPerUnit,
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
            call<RoomState>(postExpense as Handler, {
                path: `/api/rooms/${slug}/expenses`,
                method: 'POST',
                params: { slug },
                body: bodyFor(created.memberId),
            })

        expect((await post()).status).toBe(201)
        const retries = await Promise.all(Array.from({ length: 6 }, post))
        expect(retries.every((result) => result.status === 201)).toBe(true)
        expect(await prisma.expense.count({ where: { id: key, roomId: created.room.id } })).toBe(1)
        expect(await prisma.expenseShare.count({ where: { expenseId: key } })).toBe(2)
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
 * The catch-up repair, end to end: the client's own predicate and payload
 * builder (`lib/latecomer.ts`) against the real PATCH route. Testing the two
 * together is the point — a predicate that agrees with a route that no longer
 * re-splits would pass twice and fix nothing.
 */
describe('adding a latecomer to the expenses that predate them', () => {
    it('re-splits an EQUAL expense to include the person who joined after it', async () => {
        const { body: created } = await newRoom()
        const slug = created.room.slug
        const ana = created.memberId
        const { body: withBea } = await join(slug, 'Bea')
        const bea = withBea.memberId

        // €30, two ways, before anybody else arrives.
        await call<RoomState>(postExpense as Handler, {
            path: `/api/rooms/${slug}/expenses`,
            method: 'POST',
            params: { slug },
            token: created.memberToken,
            body: {
                description: 'Cabin deposit',
                amountMinor: '3000',
                currency: 'EUR',
                paidById: ana,
                splitMode: 'EQUAL',
            },
        })

        // An EXACT expense from the same moment, to prove it is never touched.
        await call<RoomState>(postExpense as Handler, {
            path: `/api/rooms/${slug}/expenses`,
            method: 'POST',
            params: { slug },
            token: created.memberToken,
            body: {
                description: 'Ana covered the ferry',
                amountMinor: '1000',
                currency: 'EUR',
                paidById: ana,
                splitMode: 'EXACT',
                exactShares: [{ memberId: bea, amountMinor: '1000' }],
            },
        })

        const { body: withDani } = await join(slug, 'Dani')
        const dani = withDani.memberId
        expect(withDani.balances).toEqual({ [ana]: '2500', [bea]: '-2500', [dani]: '0' })

        const offer = latecomerOffer(withDani)
        expect(offer?.member.id).toBe(dani)
        expect(offer?.expenses.map((expense) => expense.description)).toEqual(['Cabin deposit'])

        const target = offer!.expenses[0]
        const { status, body: repaired } = await call<RoomState>(patchExpense as Handler, {
            path: `/api/rooms/${slug}/expenses/${target.id}`,
            method: 'PATCH',
            params: { slug, id: target.id },
            body: backfillPatch(target, dani),
        })

        expect(status).toBe(200)
        const deposit = repaired.expenses.find((expense) => expense.description === 'Cabin deposit')!
        expect(deposit.shares.map((share) => share.amountMinor)).toEqual(['1000', '1000', '1000'])
        expect(deposit.shares.map((share) => share.memberId).sort()).toEqual([ana, bea, dani].sort())
        // Ana fronted 30 and owes 10 of it; the ferry is untouched at 10 on Bea.
        expect(repaired.balances).toEqual({ [ana]: '3000', [bea]: '-2000', [dani]: '-1000' })
        expect(netsToZero(repaired)).toBe(true)

        // The EXACT row is not offered and did not move.
        const ferry = repaired.expenses.find((expense) => expense.description === 'Ana covered the ferry')!
        expect(ferry.shares).toEqual([{ memberId: bea, amountMinor: '1000', enteredAmountMinor: '1000' }])

        // Idempotent by nature: with the share now present, there is nothing left
        // to offer, so pressing again is not a thing that can happen.
        expect(latecomerOffer(repaired)).toBeNull()
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
