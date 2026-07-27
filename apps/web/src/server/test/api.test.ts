/**
 * Handler-level tests: the real route modules against the real `peanut_split_test`
 * database. No HTTP server — Next route handlers are plain functions.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { truncateAll } from '@/server/test/db'
import { GET as getCurrencies } from '@/app/api/currencies/route'
import { GET as getRate } from '@/app/api/rate/route'
import { POST as postRoom } from '@/app/api/rooms/route'
import { GET as getRoom } from '@/app/api/rooms/[slug]/route'
import { POST as postMember } from '@/app/api/rooms/[slug]/members/route'
import { POST as postExpense } from '@/app/api/rooms/[slug]/expenses/route'
import { DELETE as deleteExpense, PATCH as patchExpense } from '@/app/api/rooms/[slug]/expenses/[id]/route'
import { POST as restoreExpense } from '@/app/api/expenses/[id]/restore/route'
import { POST as postSettlement } from '@/app/api/rooms/[slug]/settlements/route'
import { DELETE as deleteSettlement } from '@/app/api/rooms/[slug]/settlements/[id]/route'
import { GET as readiness } from '@/app/readiness/route'
import { GET as healthcheck } from '@/app/healthcheck/route'
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

/** Balances must always net to zero — the whole model rests on it. */
const netsToZero = (state: RoomState) => Object.values(state.balances).reduce((a, b) => a + BigInt(b), 0n) === 0n

beforeEach(async () => {
    await truncateAll()
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

    it('adds a joiner and returns the roster that already contains them', async () => {
        const { body: created } = await newRoom()
        const { status, body } = await join(created.room.slug, 'Bea')
        expect(status).toBe(201)
        expect(body.members.map((m) => m.name)).toEqual(['Ana', 'Bea'])
        expect(body.members.some((m) => m.id === body.memberId)).toBe(true)
    })

    it('409s on a duplicate name so the join gate can offer the existing member', async () => {
        const { body: created } = await newRoom()
        const { status, body } = await join(created.room.slug, 'ana')
        expect(status).toBe(409)
        expect((body as unknown as ApiError).error.code).toBe('DUPLICATE_MEMBER_NAME')
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
                body: { ...transfer, method: 'peanut', note: 'via the settle sheet' },
            })
            expect(status).toBe(201)
            state = body
        }
        expect(state.suggestedTransfers).toEqual([])
        expect(Object.values(state.balances).every((b) => b === '0')).toBe(true)
        expect(state.settlements[0].method).toBe('peanut')
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
        expect((await post(expenseBody(ana, { description: '' }))).status).toBe(400)
        expect((await post(expenseBody(ana, { amountMinor: '10.00' }))).status).toBe(400)
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
        expect((await post({ fromId: ana, toId: 'ghost', amountMinor: '100' })).status).toBe(400)
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
