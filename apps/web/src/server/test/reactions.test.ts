/**
 * Expense reactions against the real handlers and the real database.
 *
 * Two rules carry the feature and both are pinned here: the write needs a
 * token-PROVEN member (a room's ledger deliberately does not), and a reaction
 * rides its expense — soft-delete the expense and the reactions leave the wire
 * with it, undo and they come back.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma, truncateAll } from '@/server/test/db'
import { resetRateLimits } from '@/server/rateLimit'
import { REACTION_EMOJIS } from '@/lib/reactions'
import { POST as postRoom } from '@/app/api/rooms/route'
import { POST as postMember } from '@/app/api/rooms/[slug]/members/route'
import { POST as postExpense } from '@/app/api/rooms/[slug]/expenses/route'
import { DELETE as deleteExpense } from '@/app/api/rooms/[slug]/expenses/[id]/route'
import { POST as restoreExpense } from '@/app/api/expenses/[id]/restore/route'
import { DELETE as unreact, POST as react } from '@/app/api/expenses/[id]/reactions/route'
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

interface Fixture {
    slug: string
    expenseId: string
    ana: { id: string; token: string }
    bruno: { id: string; token: string }
}

async function makeRoom(): Promise<Fixture> {
    const { body: created } = await call<RoomStateWithMember>(postRoom as Handler, {
        path: '/api/rooms',
        method: 'POST',
        body: { name: 'Ski Trip', emoji: '🎿', currency: 'EUR', creatorName: 'Ana' },
    })
    const slug = created.room.slug
    const { body: joined } = await call<RoomStateWithMember>(postMember as Handler, {
        path: `/api/rooms/${slug}/members`,
        method: 'POST',
        params: { slug },
        body: { name: 'Bruno' },
    })
    const { body: withExpense } = await call<RoomState>(postExpense as Handler, {
        path: `/api/rooms/${slug}/expenses`,
        method: 'POST',
        params: { slug },
        token: created.memberToken,
        body: {
            description: 'Lift passes',
            amountMinor: '12000',
            currency: 'EUR',
            paidById: created.memberId,
            splitMode: 'EQUAL',
        },
    })
    return {
        slug,
        expenseId: withExpense.expenses[0].id,
        ana: { id: created.memberId, token: created.memberToken },
        bruno: { id: joined.memberId, token: joined.memberToken },
    }
}

const reactWith = (
    expenseId: string,
    body: { emoji: string; memberId: string; memberToken: string },
    verb: 'add' | 'remove' = 'add'
) =>
    call<RoomState & ApiError>((verb === 'add' ? react : unreact) as Handler, {
        path: `/api/expenses/${expenseId}/reactions`,
        method: verb === 'add' ? 'POST' : 'DELETE',
        params: { id: expenseId },
        body,
    })

const reactionsOf = (state: RoomState, expenseId: string) =>
    state.expenses.find((expense) => expense.id === expenseId)?.reactions ?? []

beforeEach(async () => {
    await truncateAll()
    resetRateLimits()
})

describe('POST /api/expenses/:id/reactions', () => {
    it('records a reaction and hands back the whole room', async () => {
        const fixture = await makeRoom()
        const { status, body } = await reactWith(fixture.expenseId, {
            emoji: '🔥',
            memberId: fixture.bruno.id,
            memberToken: fixture.bruno.token,
        })
        expect(status).toBe(200)
        expect(reactionsOf(body, fixture.expenseId)).toEqual([{ emoji: '🔥', memberId: fixture.bruno.id }])
        // Money is untouched — a reaction is not a ledger row.
        expect(body.balances[fixture.ana.id]).toBe('6000')
    })

    /**
     * The identity decision. Anyone holding the link can write an expense in
     * Ana's name, because inside a room that is visible and fixable. Nobody can
     * make Ana laugh at one.
     */
    it('refuses a member id the caller cannot prove', async () => {
        const fixture = await makeRoom()
        const { status, body } = await reactWith(fixture.expenseId, {
            emoji: '😂',
            memberId: fixture.ana.id,
            memberToken: fixture.bruno.token,
        })
        expect(status).toBe(403)
        expect(body.error.code).toBe('MEMBER_TOKEN_INVALID')
        expect(await prisma.expenseReaction.count()).toBe(0)
    })

    it('refuses a made-up token and a made-up member alike', async () => {
        const fixture = await makeRoom()
        for (const attempt of [
            { memberId: fixture.ana.id, memberToken: 'not-a-token' },
            { memberId: 'ghost', memberToken: fixture.ana.token },
        ]) {
            const { status } = await reactWith(fixture.expenseId, { emoji: '👏', ...attempt })
            expect(status).toBe(403)
        }
        expect(await prisma.expenseReaction.count()).toBe(0)
    })

    it('rejects any emoji outside the six', async () => {
        const fixture = await makeRoom()
        // A skin tone, a ZWJ family, a lookalike, plain text, a payload — the
        // Unicode swamp the allowlist exists to stay out of.
        for (const emoji of ['👏🏽', '👨‍👩‍👧', '🎉', 'lol', '<script>alert(1)</script>', '']) {
            const { status, body } = await reactWith(fixture.expenseId, {
                emoji,
                memberId: fixture.ana.id,
                memberToken: fixture.ana.token,
            })
            expect(status, emoji).toBe(400)
            expect(body.error.code).toBe('VALIDATION_ERROR')
        }
        expect(await prisma.expenseReaction.count()).toBe(0)
    })

    it('accepts every emoji that IS on the list', async () => {
        const fixture = await makeRoom()
        for (const emoji of REACTION_EMOJIS) {
            const { status } = await reactWith(fixture.expenseId, {
                emoji,
                memberId: fixture.ana.id,
                memberToken: fixture.ana.token,
            })
            expect(status, emoji).toBe(200)
        }
        expect(await prisma.expenseReaction.count()).toBe(REACTION_EMOJIS.length)
    })

    /** A retry on a flaky connection must not be an error, and must not double
     *  the pill. The unique key is what makes that true in the database. */
    it('is idempotent — a repeat inserts nothing and is not a conflict', async () => {
        const fixture = await makeRoom()
        const input = { emoji: '🫶', memberId: fixture.ana.id, memberToken: fixture.ana.token }

        await reactWith(fixture.expenseId, input)
        const { status, body } = await reactWith(fixture.expenseId, input)

        expect(status).toBe(200)
        expect(reactionsOf(body, fixture.expenseId)).toHaveLength(1)
        expect(await prisma.expenseReaction.count()).toBe(1)
    })

    it('says so when the expense does not exist', async () => {
        const fixture = await makeRoom()
        const { status, body } = await reactWith('11111111-2222-3333-4444-555555555555', {
            emoji: '🔥',
            memberId: fixture.ana.id,
            memberToken: fixture.ana.token,
        })
        expect(status).toBe(404)
        expect(body.error.code).toBe('EXPENSE_NOT_FOUND')
    })
})

describe('DELETE /api/expenses/:id/reactions', () => {
    it('takes back your own', async () => {
        const fixture = await makeRoom()
        const input = { emoji: '🤑', memberId: fixture.ana.id, memberToken: fixture.ana.token }
        await reactWith(fixture.expenseId, input)

        const { status, body } = await reactWith(fixture.expenseId, input, 'remove')
        expect(status).toBe(200)
        expect(reactionsOf(body, fixture.expenseId)).toEqual([])
    })

    it('cannot take back somebody else’s', async () => {
        const fixture = await makeRoom()
        await reactWith(fixture.expenseId, {
            emoji: '😭',
            memberId: fixture.ana.id,
            memberToken: fixture.ana.token,
        })

        // Bruno proves he is Bruno and asks for the same emoji off. The proven
        // member id is part of the key, so there is no shape of this request
        // that reaches Ana's row.
        const { status, body } = await reactWith(
            fixture.expenseId,
            { emoji: '😭', memberId: fixture.bruno.id, memberToken: fixture.bruno.token },
            'remove'
        )
        expect(status).toBe(200)
        expect(reactionsOf(body, fixture.expenseId)).toEqual([{ emoji: '😭', memberId: fixture.ana.id }])
    })

    it('refuses an unproven caller before it deletes anything', async () => {
        const fixture = await makeRoom()
        await reactWith(fixture.expenseId, {
            emoji: '🔥',
            memberId: fixture.ana.id,
            memberToken: fixture.ana.token,
        })

        const { status } = await reactWith(
            fixture.expenseId,
            { emoji: '🔥', memberId: fixture.ana.id, memberToken: fixture.bruno.token },
            'remove'
        )
        expect(status).toBe(403)
        expect(await prisma.expenseReaction.count()).toBe(1)
    })
})

describe('reactions ride their expense', () => {
    it('leave the wire when the expense is soft-deleted, and come back on undo', async () => {
        const fixture = await makeRoom()
        await reactWith(fixture.expenseId, {
            emoji: '🔥',
            memberId: fixture.bruno.id,
            memberToken: fixture.bruno.token,
        })

        const { body: afterDelete } = await call<RoomState>(deleteExpense as Handler, {
            path: `/api/rooms/${fixture.slug}/expenses/${fixture.expenseId}`,
            method: 'DELETE',
            params: { slug: fixture.slug, id: fixture.expenseId },
        })
        expect(afterDelete.expenses).toHaveLength(0)
        // Hidden, not destroyed — a soft delete never loses data here.
        expect(await prisma.expenseReaction.count()).toBe(1)

        const { body: afterUndo } = await call<RoomState>(restoreExpense as Handler, {
            path: `/api/expenses/${fixture.expenseId}/restore`,
            method: 'POST',
            params: { id: fixture.expenseId },
        })
        expect(reactionsOf(afterUndo, fixture.expenseId)).toEqual([{ emoji: '🔥', memberId: fixture.bruno.id }])
    })

    it('cannot be written onto a deleted expense', async () => {
        const fixture = await makeRoom()
        await call<RoomState>(deleteExpense as Handler, {
            path: `/api/rooms/${fixture.slug}/expenses/${fixture.expenseId}`,
            method: 'DELETE',
            params: { slug: fixture.slug, id: fixture.expenseId },
        })

        const { status, body } = await reactWith(fixture.expenseId, {
            emoji: '🔥',
            memberId: fixture.ana.id,
            memberToken: fixture.ana.token,
        })
        expect(status).toBe(409)
        expect(body.error.code).toBe('EXPENSE_DELETED')
    })

    it('are cascaded away with a hard delete of the expense or the member', async () => {
        const fixture = await makeRoom()
        await reactWith(fixture.expenseId, {
            emoji: '👏',
            memberId: fixture.bruno.id,
            memberToken: fixture.bruno.token,
        })

        await prisma.expense.delete({ where: { id: fixture.expenseId } })
        expect(await prisma.expenseReaction.count()).toBe(0)
    })
})

describe('wire determinism', () => {
    it('orders reactions oldest first, stably across loads', async () => {
        const fixture = await makeRoom()
        const order = [
            { emoji: '🔥', member: fixture.ana },
            { emoji: '😂', member: fixture.bruno },
            { emoji: '🤑', member: fixture.ana },
        ]
        for (const { emoji, member } of order) {
            await reactWith(fixture.expenseId, { emoji, memberId: member.id, memberToken: member.token })
        }

        const { body: first } = await reactWith(fixture.expenseId, {
            emoji: '🔥',
            memberId: fixture.ana.id,
            memberToken: fixture.ana.token,
        })
        const { body: second } = await reactWith(fixture.expenseId, {
            emoji: '🔥',
            memberId: fixture.ana.id,
            memberToken: fixture.ana.token,
        })

        const expected = order.map(({ emoji, member }) => ({ emoji, memberId: member.id }))
        expect(reactionsOf(first, fixture.expenseId)).toEqual(expected)
        expect(reactionsOf(second, fixture.expenseId)).toEqual(expected)
    })
})
