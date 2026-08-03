import { PrismaClient } from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as postRoom } from '@/app/api/rooms/route'
import { POST as postMember } from '@/app/api/rooms/[slug]/members/route'
import { POST as postExpense } from '@/app/api/rooms/[slug]/expenses/route'
import { PATCH as patchExpense } from '@/app/api/rooms/[slug]/expenses/[id]/route'
import { PATCH as catchUpExpense } from './route'
import type {
    ApiError,
    ApiExpense,
    CatchUpExpenseInput,
    CatchUpExpenseResult,
    RoomState,
    RoomStateWithMember,
} from '@/lib/api-types'
import { resetEvents, subscribe } from '@/server/events'
import { resetRateLimits } from '@/server/rateLimit'
import { prisma, truncateAll } from '@/server/test/db'

const BASE = 'http://localhost'

type Params = Record<string, string>
type Handler = (request: Request, ctx: { params: Promise<Params> }) => Promise<Response>

const call = async <T>(
    handler: Handler,
    opts: { path: string; method?: string; body?: unknown; params?: Params; token?: string; ip?: string }
): Promise<{ status: number; body: T }> => {
    const response = await handler(
        new Request(`${BASE}${opts.path}`, {
            method: opts.method ?? 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...(opts.token ? { 'X-Member-Token': opts.token } : {}),
                ...(opts.ip ? { 'x-forwarded-for': opts.ip } : {}),
            },
            body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        }),
        { params: Promise.resolve(opts.params ?? {}) }
    )
    return { status: response.status, body: (await response.json()) as T }
}

const createRoom = () =>
    call<RoomStateWithMember>(postRoom as Handler, {
        path: '/api/rooms',
        method: 'POST',
        body: { name: 'Ski Trip', currency: 'EUR', creatorName: 'Ana' },
    })

const join = (slug: string, name: string) =>
    call<RoomStateWithMember>(postMember as Handler, {
        path: `/api/rooms/${slug}/members`,
        method: 'POST',
        params: { slug },
        body: { name },
    })

const createExpense = (
    slug: string,
    paidById: string,
    body: Partial<{
        description: string
        amountMinor: string
        currency: string
        splitMode: 'EQUAL' | 'EXACT'
        participantIds: string[]
        exactShares: { memberId: string; amountMinor: string }[]
        date: string
        category: string | null
    }> = {}
) =>
    call<RoomState>(postExpense as Handler, {
        path: `/api/rooms/${slug}/expenses`,
        method: 'POST',
        params: { slug },
        body: {
            description: 'Cabin deposit',
            amountMinor: '3000',
            currency: 'EUR',
            paidById,
            splitMode: 'EQUAL',
            date: '2026-01-20T12:34:56.000Z',
            category: 'stay',
            ...body,
        },
    })

const catchUp = (slug: string, expenseId: string, input: CatchUpExpenseInput, token?: string) =>
    call<CatchUpExpenseResult | ApiError>(catchUpExpense as Handler, {
        path: `/api/rooms/${slug}/expenses/${expenseId}`,
        method: 'PATCH',
        params: { slug, id: expenseId },
        body: { operation: 'CATCH_UP_EQUAL_PARTICIPANT', ...input },
        token,
    })

const snapshot = (expense: ApiExpense, memberId: string): CatchUpExpenseInput => ({
    action: 'add',
    memberId,
    expectedDescription: expense.description,
    expectedAmountMinor: expense.amountMinor,
    expectedBaseAmountMinor: expense.baseAmountMinor,
    expectedCurrency: expense.currency,
    expectedFxRate: expense.fxRate,
    expectedPaidById: expense.paidById,
    expectedDate: expense.date,
    expectedCategory: expense.category,
    expectedParticipantIds: expense.shares.map((share) => share.memberId),
})

const expenseIn = (state: RoomState, expenseId: string) => state.expenses.find((expense) => expense.id === expenseId)!

/** An observer outside the application's deliberately small test pool. */
const observerUrl = new URL(process.env.DATABASE_URL as string)
observerUrl.searchParams.set('connection_limit', '1')
const lockObserver = new PrismaClient({ datasourceUrl: observerUrl.toString() })

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

beforeEach(async () => {
    await truncateAll()
    resetRateLimits()
    resetEvents()
})

afterAll(async () => {
    await lockObserver.$disconnect()
})

describe('PATCH /api/rooms/:slug/expenses/:id catch-up command', () => {
    it('bounds malformed PATCH bodies before they can keep reaching validation', async () => {
        const ip = '203.0.113.203'
        const attempt = () =>
            call<ApiError>(catchUpExpense as Handler, {
                path: '/api/rooms/does-not-matter/expenses/does-not-matter',
                method: 'PATCH',
                params: { slug: 'does-not-matter', id: 'does-not-matter' },
                body: { operation: 'NOT_A_REAL_COMMAND' },
                ip,
            })

        for (let index = 0; index < 120; index++) {
            expect((await attempt()).status).toBe(400)
        }
        expect((await attempt()).status).toBe(429)
    })

    it('latches the first shared balance and never rearms it after Undo', async () => {
        const { body: created } = await createRoom()
        const slug = created.room.slug
        const { body: afterExpense } = await createExpense(slug, created.memberId, {
            participantIds: [created.memberId],
        })
        const before = afterExpense.expenses[0]
        expect(
            (await prisma.room.findUniqueOrThrow({ where: { id: created.room.id } })).firstSharedBalanceExpenseId
        ).toBeNull()

        const { body: withDani } = await join(slug, 'Dani')
        const added = await catchUp(slug, before.id, snapshot(before, withDani.memberId))
        expect(added.status).toBe(200)
        expect(
            (await prisma.room.findUniqueOrThrow({ where: { id: created.room.id } })).firstSharedBalanceExpenseId
        ).toBe(before.id)

        const repaired = expenseIn((added.body as CatchUpExpenseResult).state, before.id)
        const removed = await catchUp(slug, before.id, {
            ...snapshot(repaired, withDani.memberId),
            action: 'remove',
        })
        expect(removed.status).toBe(200)
        expect(
            (await prisma.room.findUniqueOrThrow({ where: { id: created.room.id } })).firstSharedBalanceExpenseId
        ).toBe(before.id)
    })

    it('adds one equal participant without rewriting any expense field and retries as a no-op', async () => {
        const { body: created } = await createRoom()
        const slug = created.room.slug
        const { body: withBea } = await join(slug, 'Bea')
        const { body: afterExpense } = await createExpense(slug, created.memberId, {
            currency: 'USD',
            category: 'accommodation',
        })
        const before = afterExpense.expenses[0]
        const { body: withDani } = await join(slug, 'Dani')
        const input = snapshot(before, withDani.memberId)
        const poke = vi.fn()
        const unsubscribe = subscribe(created.room.id, poke)

        const first = await catchUp(slug, before.id, input, created.memberToken)
        expect(first.status).toBe(200)
        expect((first.body as CatchUpExpenseResult).changed).toBe(true)
        expect(poke).toHaveBeenCalledTimes(1)
        const repaired = expenseIn((first.body as CatchUpExpenseResult).state, before.id)
        expect(repaired.shares.map((share) => share.memberId)).toEqual([
            created.memberId,
            withBea.memberId,
            withDani.memberId,
        ])
        expect(repaired.shares.reduce((sum, share) => sum + BigInt(share.amountMinor), 0n).toString()).toBe(
            before.baseAmountMinor
        )
        expect(
            await prisma.roomAuditEvent.count({
                where: { roomId: created.room.id, action: 'expense_edited', subjectId: before.id },
            })
        ).toBe(1)
        expect(
            await prisma.roomAuditEvent.findFirstOrThrow({
                where: { roomId: created.room.id, action: 'expense_edited', subjectId: before.id },
            })
        ).toMatchObject({
            actorMemberId: created.memberId,
            actorMemberName: 'Ana',
            detail: {
                operation: 'catch_up_equal_participant',
                action: 'add',
                memberId: withDani.memberId,
            },
        })
        expect({
            description: repaired.description,
            amountMinor: repaired.amountMinor,
            currency: repaired.currency,
            baseAmountMinor: repaired.baseAmountMinor,
            fxRate: repaired.fxRate,
            paidById: repaired.paidById,
            splitMode: repaired.splitMode,
            date: repaired.date,
            category: repaired.category,
        }).toEqual({
            description: before.description,
            amountMinor: before.amountMinor,
            currency: before.currency,
            baseAmountMinor: before.baseAmountMinor,
            fxRate: before.fxRate,
            paidById: before.paidById,
            splitMode: before.splitMode,
            date: before.date,
            category: before.category,
        })

        // Same reviewed command after a commit/lost-response window is success,
        // not a conflict and never a duplicate share.
        const retry = await catchUp(slug, before.id, input)
        expect(retry.status).toBe(200)
        expect((retry.body as CatchUpExpenseResult).changed).toBe(false)
        expect(poke).toHaveBeenCalledTimes(1)
        expect(expenseIn((retry.body as CatchUpExpenseResult).state, before.id).shares).toHaveLength(3)
        expect(await prisma.expenseShare.count({ where: { expenseId: before.id, memberId: withDani.memberId } })).toBe(
            1
        )
        expect(
            await prisma.roomAuditEvent.count({
                where: { roomId: created.room.id, action: 'expense_edited', subjectId: before.id },
            })
        ).toBe(1)

        const undoInput = { ...snapshot(repaired, withDani.memberId), action: 'remove' as const }
        const undone = await catchUp(slug, before.id, undoInput)
        expect(undone.status).toBe(200)
        expect((undone.body as CatchUpExpenseResult).changed).toBe(true)
        expect(poke).toHaveBeenCalledTimes(2)
        expect(
            expenseIn((undone.body as CatchUpExpenseResult).state, before.id).shares.map((share) => share.memberId)
        ).toEqual([created.memberId, withBea.memberId])
        expect(
            await prisma.roomAuditEvent.count({
                where: { roomId: created.room.id, action: 'expense_edited', subjectId: before.id },
            })
        ).toBe(2)

        const undoRetry = await catchUp(slug, before.id, undoInput)
        expect(undoRetry.status).toBe(200)
        expect((undoRetry.body as CatchUpExpenseResult).changed).toBe(false)
        expect(poke).toHaveBeenCalledTimes(2)
        unsubscribe?.()
    })

    it('restores the exact pre-Add shares when tied roster timestamps hide the rounding owner', async () => {
        const { body: created } = await createRoom()
        const slug = created.room.slug
        const { body: withBea } = await join(slug, 'Bea')
        const { body: withCaro } = await join(slug, 'Caro')
        const originalMemberIds = [created.memberId, withBea.memberId, withCaro.memberId]

        // Bulk imports create the original roster in one statement, so every
        // member has the same timestamp and share UUIDs used to be the accidental
        // ordering fallback. Make that production shape explicit in the fixture.
        await prisma.member.updateMany({
            where: { id: { in: originalMemberIds } },
            data: { createdAt: new Date('2025-01-01T00:00:00.000Z') },
        })
        const { body: afterExpense } = await createExpense(slug, created.memberId, {
            amountMinor: '1000',
            participantIds: originalMemberIds,
        })
        const before = afterExpense.expenses[0]
        const shareMap = (expense: ApiExpense) =>
            expense.shares
                .map((share) => [share.memberId, share.amountMinor] as const)
                .sort(([left], [right]) => left.localeCompare(right))
        const originalShares = shareMap(before)
        expect(originalShares.map(([, amount]) => amount).sort()).toEqual(['333', '333', '334'])

        const { body: withDani } = await join(slug, 'Dani')
        await prisma.member.update({
            where: { id: withDani.memberId },
            data: { createdAt: new Date('2099-01-01T00:00:00.000Z') },
        })
        const added = await catchUp(slug, before.id, snapshot(before, withDani.memberId))
        expect(added.status).toBe(200)
        const repaired = expenseIn((added.body as CatchUpExpenseResult).state, before.id)
        expect(repaired.shares.map((share) => share.amountMinor)).toEqual(['250', '250', '250', '250'])

        const undone = await catchUp(slug, before.id, {
            ...snapshot(repaired, withDani.memberId),
            action: 'remove',
        })
        expect(undone.status).toBe(200)
        expect(shareMap(expenseIn((undone.body as CatchUpExpenseResult).state, before.id))).toEqual(originalShares)
    })

    it('serializes two late joiners: one reviews again, then both are retained', async () => {
        const { body: created } = await createRoom()
        const slug = created.room.slug
        const { body: withBea } = await join(slug, 'Bea')
        const { body: afterExpense } = await createExpense(slug, created.memberId)
        const expense = afterExpense.expenses[0]
        const { body: withDani } = await join(slug, 'Dani')
        const { body: withEli } = await join(slug, 'Eli')

        const attempts = await Promise.all([
            catchUp(slug, expense.id, snapshot(expense, withDani.memberId)),
            catchUp(slug, expense.id, snapshot(expense, withEli.memberId)),
        ])
        expect(attempts.map((attempt) => attempt.status).sort()).toEqual([200, 409])
        const conflict = attempts.find((attempt) => attempt.status === 409)!
        expect((conflict.body as ApiError).error.code).toBe('CATCH_UP_REVIEW_CONFLICT')

        const winner = (attempts.find((attempt) => attempt.status === 200)!.body as CatchUpExpenseResult).state
        const afterWinner = expenseIn(winner, expense.id)
        const present = new Set(afterWinner.shares.map((share) => share.memberId))
        expect(present.has(created.memberId)).toBe(true)
        expect(present.has(withBea.memberId)).toBe(true)
        const loserId = present.has(withDani.memberId) ? withEli.memberId : withDani.memberId

        const resumed = await catchUp(slug, expense.id, snapshot(afterWinner, loserId))
        expect(resumed.status).toBe(200)
        expect(
            new Set(
                expenseIn((resumed.body as CatchUpExpenseResult).state, expense.id).shares.map(
                    (share) => share.memberId
                )
            )
        ).toEqual(new Set([created.memberId, withBea.memberId, withDani.memberId, withEli.memberId]))

        // The original winner can safely retry even after the second catch-up
        // changed the participant set.
        const winnerId = loserId === withDani.memberId ? withEli.memberId : withDani.memberId
        expect((await catchUp(slug, expense.id, snapshot(expense, winnerId))).status).toBe(200)
    })

    it.each(['amount', 'participants', 'mode'] as const)(
        'waits behind a concurrent %s edit and returns review-again without overwriting it',
        async (change) => {
            const { body: created } = await createRoom()
            const slug = created.room.slug
            const { body: withBea } = await join(slug, 'Bea')
            let extraParticipantId: string | null = null
            if (change === 'participants') extraParticipantId = (await join(slug, 'Cara')).body.memberId
            const { body: afterExpense } = await createExpense(slug, created.memberId, {
                participantIds: [created.memberId, withBea.memberId],
            })
            const expense = afterExpense.expenses[0]
            const { body: withDani } = await join(slug, 'Dani')
            const input = snapshot(expense, withDani.memberId)

            const editBody =
                change === 'amount'
                    ? {
                          description: expense.description,
                          amountMinor: '3600',
                          currency: expense.currency,
                          paidById: expense.paidById,
                          splitMode: 'EQUAL' as const,
                          participantIds: [created.memberId, withBea.memberId],
                          expectedSplitMode: 'EQUAL' as const,
                      }
                    : change === 'participants'
                      ? {
                            description: expense.description,
                            amountMinor: expense.amountMinor,
                            currency: expense.currency,
                            paidById: expense.paidById,
                            splitMode: 'EQUAL' as const,
                            participantIds: [created.memberId, withBea.memberId, extraParticipantId!],
                            expectedSplitMode: 'EQUAL' as const,
                        }
                      : {
                            description: expense.description,
                            amountMinor: expense.amountMinor,
                            currency: expense.currency,
                            paidById: expense.paidById,
                            splitMode: 'EXACT' as const,
                            exactShares: [
                                { memberId: created.memberId, amountMinor: '1500' },
                                { memberId: withBea.memberId, amountMinor: '1500' },
                            ],
                            expectedSplitMode: 'EQUAL' as const,
                        }

            const held = await holdRoomWriteLock(created.room.id)
            const edit = call<RoomState>(patchExpense as Handler, {
                path: `/api/rooms/${slug}/expenses/${expense.id}`,
                method: 'PATCH',
                params: { slug, id: expense.id },
                body: editBody,
            })
            await waitForAdvisoryWaiters(1)
            const catchUpAttempt = catchUp(slug, expense.id, input)
            await waitForAdvisoryWaiters(2)
            await held.release()

            expect((await edit).status).toBe(200)
            const refused = await catchUpAttempt
            expect(refused.status).toBe(409)
            expect((refused.body as ApiError).error.code).toBe('CATCH_UP_REVIEW_CONFLICT')

            const stored = await prisma.expense.findUnique({
                where: { id: expense.id },
                include: { shares: true },
            })
            expect(stored?.shares.some((share) => share.memberId === withDani.memberId)).toBe(false)
            if (change === 'amount') expect(stored?.amountMinor).toBe(3600n)
            if (change === 'participants')
                expect(stored?.shares.some((share) => share.memberId === extraParticipantId)).toBe(true)
            if (change === 'mode') expect(stored?.splitMode).toBe('EXACT')
        }
    )

    it('rejects a displayed amount change even when the room-currency base happens to match', async () => {
        const { body: created } = await createRoom()
        const slug = created.room.slug
        await join(slug, 'Bea')
        const { body: afterExpense } = await createExpense(slug, created.memberId)
        const expense = afterExpense.expenses[0]
        const { body: withDani } = await join(slug, 'Dani')
        const input = snapshot(expense, withDani.memberId)

        await prisma.expense.update({ where: { id: expense.id }, data: { amountMinor: 3001n } })
        const refused = await catchUp(slug, expense.id, input)
        expect(refused.status).toBe(409)
        expect((refused.body as ApiError).error.code).toBe('CATCH_UP_REVIEW_CONFLICT')
        expect(await prisma.expenseShare.count({ where: { expenseId: expense.id } })).toBe(2)
    })

    it.each(['description', 'date', 'category', 'payer', 'fx-rate'] as const)(
        'rejects a reviewed %s change without touching shares',
        async (field) => {
            const { body: created } = await createRoom()
            const slug = created.room.slug
            const { body: withBea } = await join(slug, 'Bea')
            const { body: afterExpense } = await createExpense(slug, created.memberId)
            const expense = afterExpense.expenses[0]
            const { body: withDani } = await join(slug, 'Dani')
            const input = snapshot(expense, withDani.memberId)

            if (field === 'description')
                await prisma.expense.update({ where: { id: expense.id }, data: { description: 'Renamed cabin' } })
            if (field === 'date')
                await prisma.expense.update({
                    where: { id: expense.id },
                    data: { date: new Date('2026-01-21T12:34:56.000Z') },
                })
            if (field === 'category')
                await prisma.expense.update({ where: { id: expense.id }, data: { category: 'food' } })
            if (field === 'payer')
                await prisma.expense.update({ where: { id: expense.id }, data: { paidById: withBea.memberId } })
            if (field === 'fx-rate')
                await prisma.expense.update({ where: { id: expense.id }, data: { fxRate: '1.001' } })

            const refused = await catchUp(slug, expense.id, input)
            expect(refused.status).toBe(409)
            expect((refused.body as ApiError).error.code).toBe('CATCH_UP_REVIEW_CONFLICT')
            expect(await prisma.expenseShare.count({ where: { expenseId: expense.id } })).toBe(2)
        }
    )

    it('refuses Undo after another participant change instead of erasing it', async () => {
        const { body: created } = await createRoom()
        const slug = created.room.slug
        await join(slug, 'Bea')
        const { body: afterExpense } = await createExpense(slug, created.memberId)
        const expense = afterExpense.expenses[0]
        const { body: withDani } = await join(slug, 'Dani')
        const added = await catchUp(slug, expense.id, snapshot(expense, withDani.memberId))
        const afterDani = expenseIn((added.body as CatchUpExpenseResult).state, expense.id)

        const { body: withEli } = await join(slug, 'Eli')
        const afterEliResult = await catchUp(slug, expense.id, snapshot(afterDani, withEli.memberId))
        const afterEli = expenseIn((afterEliResult.body as CatchUpExpenseResult).state, expense.id)

        const undoDani = await catchUp(slug, expense.id, {
            ...snapshot(afterDani, withDani.memberId),
            action: 'remove',
        })
        expect(undoDani.status).toBe(409)
        expect((undoDani.body as ApiError).error.code).toBe('CATCH_UP_REVIEW_CONFLICT')
        const storedIds = (
            await prisma.expenseShare.findMany({ where: { expenseId: expense.id }, select: { memberId: true } })
        ).map((share) => share.memberId)
        expect(new Set(storedIds)).toEqual(new Set(afterEli.shares.map((share) => share.memberId)))
    })

    it('rejects an archived room, a non-member target, and a non-EQUAL row before changing shares', async () => {
        const { body: created } = await createRoom()
        const slug = created.room.slug
        const { body: withBea } = await join(slug, 'Bea')
        const { body: equalState } = await createExpense(slug, created.memberId)
        const equal = equalState.expenses[0]

        const outsider = await catchUp(slug, equal.id, snapshot(equal, 'member-from-another-room'))
        expect(outsider.status).toBe(400)
        expect((outsider.body as ApiError).error.code).toBe('NOT_A_MEMBER')

        const { body: exactState } = await createExpense(slug, created.memberId, {
            description: 'Ferry',
            splitMode: 'EXACT',
            exactShares: [{ memberId: withBea.memberId, amountMinor: '3000' }],
        })
        const exact = exactState.expenses.find((expense) => expense.description === 'Ferry')!
        const notEqual = await catchUp(slug, exact.id, snapshot(exact, created.memberId))
        expect(notEqual.status).toBe(409)
        expect((notEqual.body as ApiError).error.code).toBe('CATCH_UP_REVIEW_CONFLICT')

        const before = await prisma.expenseShare.findMany({ where: { expenseId: equal.id } })
        await prisma.room.update({ where: { id: created.room.id }, data: { archivedAt: new Date() } })
        const archived = await catchUp(slug, equal.id, snapshot(equal, withBea.memberId))
        expect(archived.status).toBe(409)
        expect((archived.body as ApiError).error.code).toBe('ROOM_ARCHIVED')
        expect(await prisma.expenseShare.findMany({ where: { expenseId: equal.id } })).toEqual(before)
    })
})
