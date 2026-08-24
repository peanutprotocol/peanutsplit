import { beforeEach, describe, expect, it } from 'vitest'
import { prisma, truncateAll } from '@/server/test/db'
import { resetRateLimits } from '@/server/rateLimit'
import { roomHistoryBySlug } from '@/server/history'
import { POST as postRoom } from '@/app/api/rooms/route'
import { PATCH as patchRoom } from '@/app/api/rooms/[slug]/route'
import { POST as postMember } from '@/app/api/rooms/[slug]/members/route'
import { DELETE as deleteMember, PATCH as patchMember } from '@/app/api/rooms/[slug]/members/[memberId]/route'
import { POST as claimMember } from '@/app/api/rooms/[slug]/members/[memberId]/claim/route'
import { POST as postExpense } from '@/app/api/rooms/[slug]/expenses/route'
import { DELETE as deleteExpense, PATCH as patchExpense } from '@/app/api/rooms/[slug]/expenses/[id]/route'
import { POST as restoreExpense } from '@/app/api/rooms/[slug]/expenses/[id]/restore/route'
import { DELETE as removeReaction, POST as addReaction } from '@/app/api/expenses/[id]/reactions/route'
import { POST as postSettlement } from '@/app/api/rooms/[slug]/settlements/route'
import { DELETE as deleteSettlement } from '@/app/api/rooms/[slug]/settlements/[id]/route'
import {
    DELETE as deletePushSubscription,
    POST as postPushSubscription,
} from '@/app/api/rooms/[slug]/push-subscriptions/route'
import { POST as postImport } from '@/app/api/import/route'
import { GET as getHistory } from '@/app/api/rooms/[slug]/history/route'
import type { RoomHistoryPage, RoomState, RoomStateWithMember } from '@/lib/api-types'

const BASE = 'http://localhost'
type Params = Record<string, string>
type Handler = (request: Request, ctx: { params: Promise<Params> }) => Promise<Response>

async function call<T>(
    handler: Handler,
    options: {
        path: string
        method?: string
        body?: unknown
        params?: Params
        token?: string
        device?: string
    }
): Promise<{ status: number; body: T; headers: Headers }> {
    const request = new Request(`${BASE}${options.path}`, {
        method: options.method ?? 'GET',
        headers: {
            'Content-Type': 'application/json',
            ...(options.token ? { 'X-Member-Token': options.token } : {}),
            ...(options.device ? { Cookie: `device-id=${options.device}` } : {}),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
    const response = await handler(request, { params: Promise.resolve(options.params ?? {}) })
    return { status: response.status, body: (await response.json()) as T, headers: response.headers }
}

beforeEach(async () => {
    await truncateAll()
    resetRateLimits()
})

describe('room history', () => {
    it('attributes stable room-local device labels and does not duplicate a no-op', async () => {
        const { body: created } = await call<RoomStateWithMember>(postRoom as Handler, {
            path: '/api/rooms',
            method: 'POST',
            device: 'raw-phone-id',
            body: { name: 'Ski Trip', emoji: 'ski', currency: 'EUR', creatorName: 'Ana' },
        })
        const path = `/api/rooms/${created.room.slug}`
        const rename = () =>
            call<RoomState>(patchRoom as Handler, {
                path,
                method: 'PATCH',
                params: { slug: created.room.slug },
                token: created.memberToken,
                device: 'raw-phone-id',
                body: { name: 'Mountain escape' },
            })
        expect((await rename()).status).toBe(200)
        expect((await rename()).status).toBe(200)

        await call<RoomStateWithMember>(postMember as Handler, {
            path: `${path}/members`,
            method: 'POST',
            params: { slug: created.room.slug },
            device: 'raw-laptop-id',
            body: { name: 'Bea' },
        })

        const history = await call<RoomHistoryPage>(getHistory as Handler, {
            path: `${path}/history`,
            params: { slug: created.room.slug },
        })
        expect(history.status).toBe(200)
        expect(history.body.events.map((event) => event.action)).toEqual([
            'member_joined',
            'room_settings_updated',
            'room_created',
        ])
        expect(history.body.events.map((event) => event.deviceLabel)).toEqual(['B', 'A', 'A'])
        expect(history.body.events.find((event) => event.action === 'room_settings_updated')).toMatchObject({
            actorMemberId: created.memberId,
            actorMemberName: 'Ana',
        })
        expect(JSON.stringify(history.body)).not.toContain('raw-phone-id')
        expect(JSON.stringify(history.body)).not.toContain('actorDeviceHash')

        const rows = await prisma.roomAuditEvent.findMany({ where: { roomId: created.room.id } })
        expect(rows).toHaveLength(3)
        expect(rows.every((row) => !row.actorDeviceHash?.includes('raw-'))).toBe(true)
    })

    it('has database-level UPDATE and DELETE guards', async () => {
        const { body: created } = await call<RoomStateWithMember>(postRoom as Handler, {
            path: '/api/rooms',
            method: 'POST',
            body: { name: 'Guarded', currency: 'EUR', creatorName: 'Ana' },
        })
        const event = await prisma.roomAuditEvent.findFirstOrThrow({ where: { roomId: created.room.id } })

        await expect(
            prisma.roomAuditEvent.update({ where: { id: event.id }, data: { action: 'history_started' } })
        ).rejects.toThrow('append-only')
        await expect(prisma.roomAuditEvent.delete({ where: { id: event.id } })).rejects.toThrow('append-only')
    })

    it('paginates in monotonic audit order and never caches the private log', async () => {
        const { body: created } = await call<RoomStateWithMember>(postRoom as Handler, {
            path: '/api/rooms',
            method: 'POST',
            body: { name: 'Long trip', currency: 'EUR', creatorName: 'Ana' },
        })
        await prisma.roomAuditEvent.createMany({
            data: Array.from({ length: 55 }, (_, index) => ({
                roomId: created.room.id,
                action: 'room_settings_updated',
                subjectType: 'room',
                subjectId: created.room.id,
                detail: { index },
            })),
        })

        const path = `/api/rooms/${created.room.slug}/history`
        const first = await call<RoomHistoryPage>(getHistory as Handler, {
            path,
            params: { slug: created.room.slug },
        })
        expect(first.body.events).toHaveLength(50)
        expect(first.body.nextCursor).toBeTruthy()
        expect(first.headers.get('cache-control')).toBe('private, no-store')

        const second = await call<RoomHistoryPage>(getHistory as Handler, {
            path: `${path}?cursor=${first.body.nextCursor}`,
            params: { slug: created.room.slug },
        })
        expect(second.body.events).toHaveLength(6)
        expect(second.body.nextCursor).toBeNull()
        const ids = [...first.body.events, ...second.body.events].map((event) => BigInt(event.id))
        expect(new Set(ids.map(String))).toHaveLength(56)
        expect(ids.every((id, index) => index === 0 || ids[index - 1] > id)).toBe(true)
    })

    it('covers user-visible mutations once and redacts credentials and device fingerprints', async () => {
        const device = 'phone-install-id'
        const { body: created } = await call<RoomStateWithMember>(postRoom as Handler, {
            path: '/api/rooms',
            method: 'POST',
            device,
            body: { name: 'Audit trip', currency: 'EUR', creatorName: 'Ana' },
        })
        const slug = created.room.slug
        const roomPath = `/api/rooms/${slug}`

        const { body: withBea } = await call<RoomState & { memberId: string }>(postMember as Handler, {
            path: `${roomPath}/members`,
            method: 'POST',
            params: { slug },
            token: created.memberToken,
            device,
            body: { name: 'Bea', intent: 'add' },
        })
        const beaId = withBea.memberId
        const claim = () =>
            call<RoomStateWithMember>(claimMember as Handler, {
                path: `${roomPath}/members/${beaId}/claim`,
                method: 'POST',
                params: { slug, memberId: beaId },
                device: 'laptop-install-id',
            })
        const bea = (await claim()).body
        await claim()

        await call<RoomState>(patchMember as Handler, {
            path: `${roomPath}/members/${beaId}`,
            method: 'PATCH',
            params: { slug, memberId: beaId },
            token: created.memberToken,
            device,
            body: { avatar: null },
        })

        const expenseKey = crypto.randomUUID()
        const expenseBody = {
            clientKey: expenseKey,
            description: 'Dinner',
            amountMinor: '1000',
            currency: 'EUR',
            paidById: created.memberId,
            splitMode: 'EQUAL',
            participantIds: [created.memberId, beaId],
        }
        const addExpenseOnce = () =>
            call<RoomState>(postExpense as Handler, {
                path: `${roomPath}/expenses`,
                method: 'POST',
                params: { slug },
                token: created.memberToken,
                device,
                body: expenseBody,
            })
        const withExpense = (await addExpenseOnce()).body
        await addExpenseOnce()
        const expenseId = withExpense.expenses[0].id

        const editBody = { ...expenseBody, description: 'Late dinner', expectedSplitMode: 'EQUAL' }
        const editExpense = () =>
            call<RoomState>(patchExpense as Handler, {
                path: `${roomPath}/expenses/${expenseId}`,
                method: 'PATCH',
                params: { slug, id: expenseId },
                token: created.memberToken,
                device,
                body: editBody,
            })
        await editExpense()
        await editExpense()

        const reactionBody = { emoji: '🔥', memberId: beaId, memberToken: bea.memberToken }
        const react = (handler: Handler, method: 'POST' | 'DELETE') =>
            call<RoomState>(handler, {
                path: `/api/expenses/${expenseId}/reactions`,
                method,
                params: { id: expenseId },
                device: 'laptop-install-id',
                body: reactionBody,
            })
        await react(addReaction as Handler, 'POST')
        await react(addReaction as Handler, 'POST')
        await react(removeReaction as Handler, 'DELETE')
        await react(removeReaction as Handler, 'DELETE')

        const settlementKey = crypto.randomUUID()
        const settlementBody = {
            clientKey: settlementKey,
            fromId: beaId,
            toId: created.memberId,
            amountMinor: '100',
            method: 'cash',
        }
        const settle = () =>
            call<RoomState>(postSettlement as Handler, {
                path: `${roomPath}/settlements`,
                method: 'POST',
                params: { slug },
                token: bea.memberToken,
                device: 'laptop-install-id',
                body: settlementBody,
            })
        const settled = (await settle()).body
        await settle()
        const settlementId = settled.settlements[0].id
        const removeSettlement = () =>
            call<RoomState>(deleteSettlement as Handler, {
                path: `${roomPath}/settlements/${settlementId}`,
                method: 'DELETE',
                params: { slug, id: settlementId },
                token: bea.memberToken,
                device: 'laptop-install-id',
            })
        await removeSettlement()
        await removeSettlement()

        const removeExpense = () =>
            call<RoomState>(deleteExpense as Handler, {
                path: `${roomPath}/expenses/${expenseId}`,
                method: 'DELETE',
                params: { slug, id: expenseId },
                token: created.memberToken,
                device,
            })
        await removeExpense()
        await removeExpense()
        const restore = () =>
            call<RoomState>(restoreExpense as Handler, {
                path: `${roomPath}/expenses/${expenseId}/restore`,
                method: 'POST',
                params: { slug, id: expenseId },
                token: created.memberToken,
                device,
            })
        await restore()
        await restore()

        const endpoint = 'https://fcm.googleapis.com/fcm/send/audit-history'
        const pushBody = {
            endpoint,
            keys: { p256dh: 'private-p256dh-material', auth: 'private-auth-material' },
            memberId: beaId,
            memberToken: bea.memberToken,
            userAgent: 'Secret Browser Fingerprint',
        }
        const push = (handler: Handler, method: 'POST' | 'DELETE') =>
            call<unknown>(handler, {
                path: `${roomPath}/push-subscriptions`,
                method,
                params: { slug },
                device: 'laptop-install-id',
                body: method === 'POST' ? pushBody : { endpoint, memberId: beaId, memberToken: bea.memberToken },
            })
        await push(postPushSubscription as Handler, 'POST')
        await push(postPushSubscription as Handler, 'POST')
        await push(deletePushSubscription as Handler, 'DELETE')
        await push(deletePushSubscription as Handler, 'DELETE')

        const { body: withCora } = await call<RoomState & { memberId: string }>(postMember as Handler, {
            path: `${roomPath}/members`,
            method: 'POST',
            params: { slug },
            token: created.memberToken,
            device,
            body: { name: 'Cora', intent: 'add' },
        })
        await call<RoomState>(deleteMember as Handler, {
            path: `${roomPath}/members/${withCora.memberId}`,
            method: 'DELETE',
            params: { slug, memberId: withCora.memberId },
            token: created.memberToken,
            device,
        })

        const history = await call<RoomHistoryPage>(getHistory as Handler, {
            path: `${roomPath}/history`,
            params: { slug },
        })
        const counts = history.body.events.reduce<Record<string, number>>((result, event) => {
            result[event.action] = (result[event.action] ?? 0) + 1
            return result
        }, {})
        expect(counts).toMatchObject({
            room_created: 1,
            member_added: 2,
            member_avatar_updated: 1,
            member_removed: 1,
            expense_added: 1,
            expense_edited: 1,
            reaction_added: 1,
            reaction_removed: 1,
            settlement_recorded: 1,
            settlement_deleted: 1,
            expense_deleted: 1,
            expense_restored: 1,
            push_subscribed: 1,
            push_unsubscribed: 1,
        })
        const publicLog = JSON.stringify(history.body)
        for (const secret of [
            created.memberToken,
            bea.memberToken,
            endpoint,
            'private-p256dh-material',
            'private-auth-material',
            'Secret Browser Fingerprint',
            device,
        ]) {
            expect(publicLog).not.toContain(secret)
        }
    })

    it('records a bulk import as one structured room action', async () => {
        const imported = await call<RoomStateWithMember>(postImport as Handler, {
            path: '/api/import',
            method: 'POST',
            device: 'import-device',
            body: {
                roomName: 'Imported trip',
                currency: 'EUR',
                creatorName: 'Ana',
                members: ['Ana'],
                expenses: [
                    {
                        date: '2026-08-03',
                        description: 'Hotel',
                        currencyCode: 'EUR',
                        costMinor: '1000',
                        paidBy: 'Ana',
                        shares: [{ member: 'Ana', amountMinor: '1000' }],
                    },
                ],
            },
        })
        expect(imported.status).toBe(201)
        const history = await call<RoomHistoryPage>(getHistory as Handler, {
            path: `/api/rooms/${imported.body.room.slug}/history`,
            params: { slug: imported.body.room.slug },
        })
        expect(history.body.events).toHaveLength(1)
        expect(history.body.events[0]).toMatchObject({ action: 'room_imported', actorMemberName: 'Ana' })
    })

    it('rejects a cursor above the signed 64-bit range as a clean invalid cursor, not a DB overflow', async () => {
        const { body: created } = await call<RoomStateWithMember>(postRoom as Handler, {
            path: '/api/rooms',
            method: 'POST',
            body: { name: 'Overflow', currency: 'EUR', creatorName: 'Ana' },
        })
        // One above int64 max: the `id` column overflows at the DB if this reaches
        // the query, so the range guard must reject it first.
        await expect(roomHistoryBySlug(created.room.slug, '9223372036854775808')).rejects.toMatchObject({
            status: 400,
            code: 'HISTORY_CURSOR_INVALID',
        })
    })

    it('treats a cursor exactly at the signed 64-bit maximum as an in-range lookup that misses', async () => {
        const { body: created } = await call<RoomStateWithMember>(postRoom as Handler, {
            path: '/api/rooms',
            method: 'POST',
            body: { name: 'Boundary', currency: 'EUR', creatorName: 'Ana' },
        })
        // int64 max is in range, so it reaches the row lookup (bound is `>`, not
        // `>=`) and misses — the not-found path, still the clean 400, never a 500.
        await expect(roomHistoryBySlug(created.room.slug, '9223372036854775807')).rejects.toMatchObject({
            status: 400,
            code: 'HISTORY_CURSOR_INVALID',
        })
    })
})
