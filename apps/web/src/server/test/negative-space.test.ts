/**
 * The routes' negative space: everything a mutating endpoint has to REFUSE.
 *
 * `api.test.ts` walks the happy paths and the money invariants. This file is the other half — the
 * requests a stranger with a room link, a stale tab, or a broken client actually sends:
 *
 *   · a body far larger than the ceiling                      → 413, not a 500 and not 512 MB of RAM
 *   · an id that belongs to a different room                  → 404, and the other room untouched
 *   · a value outside the allowlist                           → 400
 *   · a repeat of a write that already landed                 → the same answer, and no second row
 *
 * Split is accountless — the slug IS the credential — so "authorization" here means room scoping
 * and token PROOF on the two writes that carry identity (reactions, push). Every one of those
 * boundaries is one `where` clause away from leaking, which is exactly why they are worth pinning.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma, truncateAll } from '@/server/test/db'
import { resetRateLimits } from '@/server/rateLimit'
import { POST as postRoom } from '@/app/api/rooms/route'
import { POST as postMember } from '@/app/api/rooms/[slug]/members/route'
import { POST as postExpense } from '@/app/api/rooms/[slug]/expenses/route'
import { DELETE as deleteExpense, PATCH as patchExpense } from '@/app/api/rooms/[slug]/expenses/[id]/route'
import { POST as restoreExpense } from '@/app/api/rooms/[slug]/expenses/[id]/restore/route'
import { POST as postSettlement } from '@/app/api/rooms/[slug]/settlements/route'
import { DELETE as deleteSettlement } from '@/app/api/rooms/[slug]/settlements/[id]/route'
import { POST as addReaction } from '@/app/api/expenses/[id]/reactions/route'
import { PATCH as patchRoom } from '@/app/api/rooms/[slug]/route'
import type { ApiError, RoomState, RoomStateWithMember } from '@/lib/api-types'

const BASE = 'http://localhost'

type Params = Record<string, string>
type Handler = (request: Request, ctx: { params: Promise<Params> }) => Promise<Response>

const call = async <T>(
    handler: Handler,
    opts: { path: string; method?: string; body?: unknown; raw?: string; params?: Params; token?: string }
): Promise<{ status: number; body: T }> => {
    const request = new Request(`${BASE}${opts.path}`, {
        method: opts.method ?? 'GET',
        headers: {
            'Content-Type': 'application/json',
            ...(opts.token ? { 'X-Member-Token': opts.token } : {}),
        },
        body: opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
    })
    const res = await handler(request, { params: Promise.resolve(opts.params ?? {}) })
    return { status: res.status, body: (await res.json()) as T }
}

const codeOf = (body: unknown): string => (body as ApiError).error?.code ?? 'none'

const newRoom = (name = 'Ski Trip') =>
    call<RoomStateWithMember>(postRoom as Handler, {
        path: '/api/rooms',
        method: 'POST',
        body: { name, currency: 'EUR', creatorName: 'Ana' },
    })

const join = (slug: string, name: string) =>
    call<RoomStateWithMember>(postMember as Handler, {
        path: `/api/rooms/${slug}/members`,
        method: 'POST',
        params: { slug },
        body: { name },
    })

/** A room with two members and one €10 dinner split between them. */
async function seedRoom(name = 'Ski Trip') {
    const { body: created } = await newRoom(name)
    const slug = created.room.slug
    const { body: bea } = await join(slug, 'Bea')
    const { body: withExpense } = await call<RoomState>(postExpense as Handler, {
        path: `/api/rooms/${slug}/expenses`,
        method: 'POST',
        params: { slug },
        token: created.memberToken,
        body: {
            clientKey: crypto.randomUUID(),
            description: 'Dinner',
            amountMinor: '1000',
            currency: 'EUR',
            paidById: created.memberId,
            splitMode: 'EQUAL',
            participantIds: [created.memberId, bea.memberId],
        },
    })
    return { slug, created, bea, expenseId: withExpense.expenses[0].id }
}

beforeEach(async () => {
    await truncateAll()
    resetRateLimits()
})

afterEach(() => {
    resetRateLimits()
})

// ─── request-body ceilings ───────────────────────────────────────────────────

describe('a body bigger than the ceiling', () => {
    /** Past `DEFAULT_JSON_BODY_BYTES` (64 KB) — counted as it arrives, not trusted from a header. */
    const oversized = (extra: Record<string, unknown> = {}) =>
        JSON.stringify({ ...extra, padding: 'x'.repeat(80 * 1024) })

    it('is refused by room creation before anything is written', async () => {
        const { status, body } = await call<ApiError>(postRoom as Handler, {
            path: '/api/rooms',
            method: 'POST',
            raw: oversized({ name: 'Ski Trip', currency: 'EUR', creatorName: 'Ana' }),
        })
        expect(`${status}:${codeOf(body)}`).toBe('413:REQUEST_TOO_LARGE')
        expect(await prisma.room.count()).toBe(0)
    })

    it('is refused by an expense write, and the room is left exactly as it was', async () => {
        const { slug, created } = await seedRoom()
        const before = await prisma.expense.count()
        const { status, body } = await call<ApiError>(postExpense as Handler, {
            path: `/api/rooms/${slug}/expenses`,
            method: 'POST',
            params: { slug },
            token: created.memberToken,
            raw: oversized({ description: 'Dinner', amountMinor: '1000', currency: 'EUR' }),
        })
        expect(`${status}:${codeOf(body)}`).toBe('413:REQUEST_TOO_LARGE')
        expect(await prisma.expense.count()).toBe(before)
    })

    it('is refused by a settlement, an expense edit, a join and a settings change alike', async () => {
        const { slug, created, expenseId } = await seedRoom()
        const answers = [
            await call<ApiError>(postSettlement as Handler, {
                path: `/api/rooms/${slug}/settlements`,
                method: 'POST',
                params: { slug },
                raw: oversized({ fromId: created.memberId, toId: created.memberId, amountMinor: '1' }),
            }),
            await call<ApiError>(patchExpense as Handler, {
                path: `/api/rooms/${slug}/expenses/${expenseId}`,
                method: 'PATCH',
                params: { slug, id: expenseId },
                raw: oversized({ description: 'Dinner' }),
            }),
            await call<ApiError>(postMember as Handler, {
                path: `/api/rooms/${slug}/members`,
                method: 'POST',
                params: { slug },
                raw: oversized({ name: 'Cora' }),
            }),
            await call<ApiError>(patchRoom as Handler, {
                path: `/api/rooms/${slug}`,
                method: 'PATCH',
                params: { slug },
                raw: oversized({ theme: 'sunset' }),
            }),
        ]
        expect(answers.map((answer) => `${answer.status}:${codeOf(answer.body)}`)).toEqual([
            '413:REQUEST_TOO_LARGE',
            '413:REQUEST_TOO_LARGE',
            '413:REQUEST_TOO_LARGE',
            '413:REQUEST_TOO_LARGE',
        ])
        expect(await prisma.settlement.count()).toBe(0)
        expect(await prisma.member.count()).toBe(2)
    })

    it('answers the house envelope for a body that is not JSON at all', async () => {
        const { status, body } = await call<ApiError>(postRoom as Handler, {
            path: '/api/rooms',
            method: 'POST',
            raw: 'name=Ski+Trip&currency=EUR',
        })
        expect(`${status}:${codeOf(body)}`).toBe('400:MALFORMED_JSON')
    })
})

// ─── room scoping ────────────────────────────────────────────────────────────

describe('an id that belongs to somebody else’s room', () => {
    it('cannot be deleted through this room’s settlement endpoint', async () => {
        const one = await seedRoom('Ski Trip')
        const two = await seedRoom('Beach House')

        const { body: settled } = await call<RoomState>(postSettlement as Handler, {
            path: `/api/rooms/${two.slug}/settlements`,
            method: 'POST',
            params: { slug: two.slug },
            token: two.bea.memberToken,
            body: {
                clientKey: crypto.randomUUID(),
                fromId: two.bea.memberId,
                toId: two.created.memberId,
                amountMinor: '100',
            },
        })
        const settlementId = settled.settlements[0].id

        const { status, body } = await call<ApiError>(deleteSettlement as Handler, {
            path: `/api/rooms/${one.slug}/settlements/${settlementId}`,
            method: 'DELETE',
            params: { slug: one.slug, id: settlementId },
            token: one.created.memberToken,
        })
        expect(`${status}:${codeOf(body)}`).toBe('404:SETTLEMENT_NOT_FOUND')
        // The other room's payment is still standing.
        const row = await prisma.settlement.findUniqueOrThrow({ where: { id: settlementId } })
        expect(row.deletedAt).toBeNull()
    })

    it('cannot be edited or deleted through this room’s expense endpoint', async () => {
        const one = await seedRoom('Ski Trip')
        const two = await seedRoom('Beach House')

        const edited = await call<ApiError>(patchExpense as Handler, {
            path: `/api/rooms/${one.slug}/expenses/${two.expenseId}`,
            method: 'PATCH',
            params: { slug: one.slug, id: two.expenseId },
            token: one.created.memberToken,
            body: {
                description: 'Not yours',
                amountMinor: '9999',
                currency: 'EUR',
                paidById: one.created.memberId,
                splitMode: 'EQUAL',
                participantIds: [one.created.memberId, one.bea.memberId],
            },
        })
        const removed = await call<ApiError>(deleteExpense as Handler, {
            path: `/api/rooms/${one.slug}/expenses/${two.expenseId}`,
            method: 'DELETE',
            params: { slug: one.slug, id: two.expenseId },
            token: one.created.memberToken,
        })
        expect([`${edited.status}:${codeOf(edited.body)}`, `${removed.status}:${codeOf(removed.body)}`]).toEqual([
            '404:EXPENSE_NOT_FOUND',
            '404:EXPENSE_NOT_FOUND',
        ])
        const row = await prisma.expense.findUniqueOrThrow({ where: { id: two.expenseId } })
        expect(`${row.description}:${row.amountMinor}:${row.deletedAt}`).toBe('Dinner:1000:null')
    })

    it('cannot be reacted to with a member token minted in another room', async () => {
        const one = await seedRoom('Ski Trip')
        const two = await seedRoom('Beach House')

        const wrongRoomToken = await call<ApiError>(addReaction as Handler, {
            path: `/api/expenses/${one.expenseId}/reactions`,
            method: 'POST',
            params: { id: one.expenseId },
            body: { emoji: '🔥', memberId: two.bea.memberId, memberToken: two.bea.memberToken },
        })
        const wrongMemberOwnRoom = await call<ApiError>(addReaction as Handler, {
            path: `/api/expenses/${one.expenseId}/reactions`,
            method: 'POST',
            params: { id: one.expenseId },
            body: { emoji: '🔥', memberId: one.bea.memberId, memberToken: two.bea.memberToken },
        })
        expect(wrongRoomToken.status).toBe(403)
        expect(wrongMemberOwnRoom.status).toBe(403)
        expect(await prisma.expenseReaction.count()).toBe(0)
    })

    it('cannot be settled between two people who are not both on the roster', async () => {
        const one = await seedRoom('Ski Trip')
        const two = await seedRoom('Beach House')

        const { status, body } = await call<ApiError>(postSettlement as Handler, {
            path: `/api/rooms/${one.slug}/settlements`,
            method: 'POST',
            params: { slug: one.slug },
            token: one.created.memberToken,
            body: {
                clientKey: crypto.randomUUID(),
                fromId: one.bea.memberId,
                toId: two.created.memberId,
                amountMinor: '100',
            },
        })
        expect(`${status}:${codeOf(body)}`).toBe('400:SETTLEMENT_PAYEE_NOT_MEMBER')
        expect(await prisma.settlement.count()).toBe(0)
    })
})

// ─── values outside the allowlist ────────────────────────────────────────────

describe('values that are not on any list', () => {
    it('are refused by the expense write, whatever shape they arrive in', async () => {
        const { slug, created, bea } = await seedRoom()
        const base = {
            description: 'Dinner',
            amountMinor: '1000',
            currency: 'EUR',
            paidById: created.memberId,
            splitMode: 'EQUAL' as const,
            participantIds: [created.memberId, bea.memberId],
        }
        const cases: [name: string, body: Record<string, unknown>][] = [
            ['a split mode that does not exist', { ...base, splitMode: 'MAGIC' }],
            ['a four-letter currency that is not one', { ...base, currency: 'EURO' }],
            ['a Cyrillic homoglyph currency', { ...base, currency: 'ЕUR' }],
            ['money as a JSON number, already rounded by somebody', { ...base, amountMinor: 1000 }],
            ['a fractional minor amount', { ...base, amountMinor: '10.50' }],
            ['a negative amount', { ...base, amountMinor: '-1000' }],
            ['zero', { ...base, amountMinor: '0' }],
            ['the same participant twice', { ...base, participantIds: [created.memberId, created.memberId] }],
            ['a payer who is not on the roster', { ...base, paidById: crypto.randomUUID() }],
            [
                'a participant who is not on the roster',
                { ...base, participantIds: [created.memberId, crypto.randomUUID()] },
            ],
        ]
        const answers = await Promise.all(
            cases.map(([name, body]) =>
                call<ApiError>(postExpense as Handler, {
                    path: `/api/rooms/${slug}/expenses`,
                    method: 'POST',
                    params: { slug },
                    token: created.memberToken,
                    body: { ...body, clientKey: crypto.randomUUID() },
                }).then((answer) => `${name} → ${answer.status}`)
            )
        )
        expect(answers).toEqual(cases.map(([name]) => `${name} → 400`))
        // One dinner, and only the one the seed wrote.
        expect(await prisma.expense.count()).toBe(1)
    })

    /** Not a rejection: an omitted or empty participant list means the whole room. Pinned here so
     *  the refusal list above cannot quietly grow to include it and break ordinary expense entry. */
    it('reads an empty participant list as everybody, rather than as nobody', async () => {
        const { slug, created, bea } = await seedRoom()
        const { status, body } = await call<RoomState>(postExpense as Handler, {
            path: `/api/rooms/${slug}/expenses`,
            method: 'POST',
            params: { slug },
            token: created.memberToken,
            body: {
                clientKey: crypto.randomUUID(),
                description: 'Breakfast',
                amountMinor: '1000',
                currency: 'EUR',
                paidById: created.memberId,
                splitMode: 'EQUAL',
                participantIds: [],
            },
        })
        expect(status).toBe(201)
        const breakfast = body.expenses.find((expense) => expense.description === 'Breakfast')!
        expect(breakfast.shares.map((share) => share.memberId).sort()).toEqual([created.memberId, bea.memberId].sort())
        expect(breakfast.shares.reduce((total, share) => total + BigInt(share.amountMinor), 0n)).toBe(1000n)
    })

    it('are refused by the room settings write, which must not become a slug rename', async () => {
        const { slug } = await seedRoom()
        const answers = await Promise.all(
            [{ theme: 'not-a-theme' }, { slug: 'chosen-by-me' }, {}, { name: '' }, { name: 'x'.repeat(200) }].map(
                (body) =>
                    call<ApiError>(patchRoom as Handler, {
                        path: `/api/rooms/${slug}`,
                        method: 'PATCH',
                        params: { slug },
                        body,
                    })
            )
        )
        expect(answers.map((answer) => answer.status)).toEqual([400, 400, 400, 400, 400])
        const room = await prisma.room.findUniqueOrThrow({ where: { slug } })
        expect(`${room.slug}:${room.theme}`).toBe(`${slug}:null`)
    })

    it('are refused by the reaction write — the six emoji are the whole vocabulary', async () => {
        const { expenseId, bea } = await seedRoom()
        const answers = await Promise.all(
            ['💩', '', '🔥🔥', 'fire'].map((emoji) =>
                call<ApiError>(addReaction as Handler, {
                    path: `/api/expenses/${expenseId}/reactions`,
                    method: 'POST',
                    params: { id: expenseId },
                    body: { emoji, memberId: bea.memberId, memberToken: bea.memberToken },
                })
            )
        )
        expect(answers.map((answer) => answer.status)).toEqual([400, 400, 400, 400])
        expect(await prisma.expenseReaction.count()).toBe(0)
    })
})

// ─── undo, and what it restores ──────────────────────────────────────────────

describe('restore', () => {
    it('brings back the expense and every share byte for byte', async () => {
        const { slug, created, expenseId } = await seedRoom()
        const snapshot = async () => ({
            expense: await prisma.expense.findUniqueOrThrow({ where: { id: expenseId } }),
            shares: await prisma.expenseShare.findMany({ where: { expenseId }, orderBy: { memberId: 'asc' } }),
            reactions: await prisma.expenseReaction.findMany({ where: { expenseId }, orderBy: { id: 'asc' } }),
        })
        const before = await snapshot()

        await call<RoomState>(deleteExpense as Handler, {
            path: `/api/rooms/${slug}/expenses/${expenseId}`,
            method: 'DELETE',
            params: { slug, id: expenseId },
            token: created.memberToken,
        })
        await call<RoomState>(restoreExpense as Handler, {
            path: `/api/rooms/${slug}/expenses/${expenseId}/restore`,
            method: 'POST',
            params: { slug, id: expenseId },
            token: created.memberToken,
        })

        const after = await snapshot()
        const stringify = (value: unknown) =>
            JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? item.toString() : item))
        expect(stringify(after)).toBe(stringify(before))
    })

    it('is a no-op on a live expense, and writes no second history entry for it', async () => {
        const { slug, created, expenseId } = await seedRoom()
        const auditCount = () =>
            prisma.roomAuditEvent.count({ where: { subjectId: expenseId, action: 'expense_restored' } })
        expect(await auditCount()).toBe(0)

        const { status } = await call<RoomState>(restoreExpense as Handler, {
            path: `/api/rooms/${slug}/expenses/${expenseId}/restore`,
            method: 'POST',
            params: { slug, id: expenseId },
            token: created.memberToken,
        })
        expect(status).toBe(200)
        expect(await auditCount()).toBe(0)
    })

    it('404s an expense id nobody ever wrote, rather than opening a transaction for it', async () => {
        const { body: created } = await newRoom()
        const id = crypto.randomUUID()
        const { status, body } = await call<ApiError>(restoreExpense as Handler, {
            path: `/api/rooms/${created.room.slug}/expenses/${id}/restore`,
            method: 'POST',
            params: { slug: created.room.slug, id },
        })
        expect(`${status}:${codeOf(body)}`).toBe('404:EXPENSE_NOT_FOUND')
    })

    it('conceals a leaked expense id behind the correct room slug before restoring it', async () => {
        const owner = await seedRoom('Owner room')
        const other = await seedRoom('Other room')
        await call<RoomState>(deleteExpense as Handler, {
            path: `/api/rooms/${owner.slug}/expenses/${owner.expenseId}`,
            method: 'DELETE',
            params: { slug: owner.slug, id: owner.expenseId },
            token: owner.created.memberToken,
        })

        const before = await prisma.expense.findUniqueOrThrow({ where: { id: owner.expenseId } })
        const wrongRoom = await call<ApiError>(restoreExpense as Handler, {
            path: `/api/rooms/${other.slug}/expenses/${owner.expenseId}/restore`,
            method: 'POST',
            params: { slug: other.slug, id: owner.expenseId },
            token: other.created.memberToken,
        })

        expect(`${wrongRoom.status}:${codeOf(wrongRoom.body)}`).toBe('404:EXPENSE_NOT_FOUND')
        expect('room' in wrongRoom.body).toBe(false)
        expect((await prisma.expense.findUniqueOrThrow({ where: { id: owner.expenseId } })).deletedAt).toEqual(
            before.deletedAt
        )
        expect(
            await prisma.roomAuditEvent.count({ where: { subjectId: owner.expenseId, action: 'expense_restored' } })
        ).toBe(0)

        const correctRoom = await call<RoomState>(restoreExpense as Handler, {
            path: `/api/rooms/${owner.slug}/expenses/${owner.expenseId}/restore`,
            method: 'POST',
            params: { slug: owner.slug, id: owner.expenseId },
            token: owner.created.memberToken,
        })
        expect(correctRoom.status).toBe(200)
        expect(correctRoom.body.room.slug).toBe(owner.slug)
        expect(correctRoom.body.expenses.map((expense) => expense.id)).toContain(owner.expenseId)
        expect((await prisma.expense.findUniqueOrThrow({ where: { id: owner.expenseId } })).deletedAt).toBeNull()
    })

    it('records exactly one history entry however many times undo is tapped', async () => {
        const { slug, created, expenseId } = await seedRoom()
        const tap = (handler: Handler, path: string, params: Params, method: string) =>
            call<RoomState>(handler, { path, method, params, token: created.memberToken })

        await tap(
            deleteExpense as Handler,
            `/api/rooms/${slug}/expenses/${expenseId}`,
            { slug, id: expenseId },
            'DELETE'
        )
        await tap(
            deleteExpense as Handler,
            `/api/rooms/${slug}/expenses/${expenseId}`,
            { slug, id: expenseId },
            'DELETE'
        )
        await tap(
            restoreExpense as Handler,
            `/api/rooms/${slug}/expenses/${expenseId}/restore`,
            { slug, id: expenseId },
            'POST'
        )
        await tap(
            restoreExpense as Handler,
            `/api/rooms/${slug}/expenses/${expenseId}/restore`,
            { slug, id: expenseId },
            'POST'
        )

        const events = await prisma.roomAuditEvent.findMany({ where: { subjectId: expenseId } })
        const counts = events.reduce<Record<string, number>>((result, event) => {
            result[event.action] = (result[event.action] ?? 0) + 1
            return result
        }, {})
        expect(counts).toEqual({ expense_added: 1, expense_deleted: 1, expense_restored: 1 })
    })
})
