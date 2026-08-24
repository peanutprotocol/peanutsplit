import { beforeEach, describe, expect, it } from 'vitest'
import { GET as getHistoryExport } from '@/app/api/rooms/[slug]/history/export/route'
import { DELETE as deleteExpense, PATCH as patchExpense } from '@/app/api/rooms/[slug]/expenses/[id]/route'
import { POST as postExpense } from '@/app/api/rooms/[slug]/expenses/route'
import { POST as postRoom } from '@/app/api/rooms/route'
import type { RoomHistoryExport } from '@/server/history-export'
import { resetRateLimits } from '@/server/rateLimit'
import { prisma, truncateAll } from '@/server/test/db'
import type { RoomState, RoomStateWithMember } from '@/lib/api-types'

const BASE = 'http://localhost'
type Params = Record<string, string>
type Handler = (request: Request, ctx: { params: Promise<Params> }) => Promise<Response>
const percentEncodeEveryByte = (value: string): string =>
    [...new TextEncoder().encode(value)].map((byte) => `%${byte.toString(16).padStart(2, '0')}`).join('')

async function call(
    handler: Handler,
    options: {
        path: string
        method?: string
        body?: unknown
        params?: Params
        token?: string
        device?: string
    }
): Promise<Response> {
    const request = new Request(`${BASE}${options.path}`, {
        method: options.method ?? 'GET',
        headers: {
            'Content-Type': 'application/json',
            ...(options.token ? { 'X-Member-Token': options.token } : {}),
            ...(options.device ? { Cookie: `device-id=${options.device}` } : {}),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
    return handler(request, { params: Promise.resolve(options.params ?? {}) })
}

async function json<T>(response: Response): Promise<T> {
    return (await response.json()) as T
}

beforeEach(async () => {
    await truncateAll()
    resetRateLimits()
})

describe('GET /api/rooms/[slug]/history/export', () => {
    it('downloads all events oldest-first, including edits and deletes, without capabilities or fingerprints', async () => {
        const createResponse = await call(postRoom as Handler, {
            path: '/api/rooms',
            method: 'POST',
            device: 'raw-phone-install-id',
            body: { name: 'Ski & Spa', currency: 'EUR', creatorName: 'Ana' },
        })
        const created = await json<RoomStateWithMember>(createResponse)
        const slug = created.room.slug
        const encodedUpperSlug = percentEncodeEveryByte(slug.toUpperCase())
        const roomPath = `/api/rooms/${slug}`
        const expenseBody = {
            clientKey: crypto.randomUUID(),
            description: 'Dinner',
            amountMinor: '1000',
            currency: 'EUR',
            paidById: created.memberId,
            splitMode: 'EQUAL',
            participantIds: [created.memberId],
        }

        const addResponse = await call(postExpense as Handler, {
            path: `${roomPath}/expenses`,
            method: 'POST',
            params: { slug },
            token: created.memberToken,
            device: 'raw-phone-install-id',
            body: expenseBody,
        })
        expect(addResponse.status).toBe(201)
        const expenseId = (await json<RoomState>(addResponse)).expenses[0].id

        const editResponse = await call(patchExpense as Handler, {
            path: `${roomPath}/expenses/${expenseId}`,
            method: 'PATCH',
            params: { slug, id: expenseId },
            token: created.memberToken,
            device: 'raw-phone-install-id',
            body: { ...expenseBody, description: 'Late dinner', expectedSplitMode: 'EQUAL' },
        })
        expect(editResponse.status).toBe(200)

        const deleteResponse = await call(deleteExpense as Handler, {
            path: `${roomPath}/expenses/${expenseId}`,
            method: 'DELETE',
            params: { slug, id: expenseId },
            token: created.memberToken,
            device: 'raw-phone-install-id',
        })
        expect(deleteResponse.status).toBe(200)

        // More than the interactive history page's 50-row boundary. One extra
        // payload is intentionally hostile to prove the export's recursive scrub.
        await prisma.roomAuditEvent.createMany({
            data: Array.from({ length: 55 }, (_, index) => ({
                roomId: created.room.id,
                action: 'room_settings_updated',
                subjectType: 'room',
                subjectId: created.room.id,
                detail: { index },
            })),
        })
        await prisma.roomAuditEvent.create({
            data: {
                roomId: created.room.id,
                action: 'room_settings_updated',
                subjectType: 'room',
                subjectId: created.room.id,
                actorDeviceHash: 'private-device-hash',
                deviceOrdinal: 27,
                before: {
                    nested: [{ roomUrl: `https://split.test/r/${slug}`, encodedRoomUrl: encodedUpperSlug }],
                    [`fact-${encodedUpperSlug}`]: 'safe fact',
                },
                after: {
                    room: {
                        slug,
                        name: 'Ski & Spa',
                        analyticsKey: created.room.analyticsKey ?? 'private-analytics-pseudonym',
                    },
                },
                detail: {
                    memberToken: created.memberToken,
                    secret: 'private-secret',
                    pushEndpoint: 'https://push.test/subscription-proof',
                    tokenRotated: true,
                },
            },
        })

        const response = await call(getHistoryExport as Handler, {
            path: `${roomPath}/history/export`,
            params: { slug },
        })
        expect(response.status).toBe(200)
        expect(response.headers.get('cache-control')).toBe('private, no-store')
        expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
        expect(response.headers.get('content-disposition')).toBe('attachment; filename="ski-spa-history.json"')
        expect(response.headers.get('content-disposition')).not.toContain(slug)

        const bodyText = await response.text()
        const body = JSON.parse(bodyText) as RoomHistoryExport
        expect(body.schema).toBe('peanut-split-room-history')
        expect(body.version).toBe(1)
        expect(body.eventCount).toBe(60)
        expect(body.redactions).toEqual({
            roomLink: 'removed',
            privateFields: 'removed',
            deviceFingerprint: 'not_exported',
        })
        expect(body.historyCoverage).toMatchObject({
            basis: 'room_created',
            earlierEvents: 'none',
            cutoffEventId: null,
        })
        expect(body.events).toHaveLength(60)
        const ids = body.events.map((event) => BigInt(event.id))
        expect(ids.every((id, index) => index === 0 || ids[index - 1] < id)).toBe(true)

        const edited = body.events.find((event) => event.action === 'expense_edited')
        expect(edited).toMatchObject({
            deviceLabel: 'A',
            before: { description: 'Dinner' },
            after: { description: 'Late dinner' },
        })
        const deleted = body.events.find((event) => event.action === 'expense_deleted')
        expect(deleted).toMatchObject({
            deviceLabel: 'A',
            before: { description: 'Late dinner', deletedAt: null },
        })
        expect((deleted?.after as { deletedAt?: string }).deletedAt).toEqual(expect.any(String))
        expect(body.events.at(-1)).toMatchObject({
            deviceLabel: 'AA',
            detail: { tokenRotated: true },
        })

        for (const secret of [
            slug,
            created.memberToken,
            'raw-phone-install-id',
            'private-device-hash',
            'private-secret',
            'subscription-proof',
            'actorDeviceHash',
            encodedUpperSlug,
        ]) {
            expect(bodyText.toLowerCase()).not.toContain(secret.toLowerCase())
        }
        expect(bodyText).not.toContain('"slug"')
        expect(bodyText).not.toContain('"memberToken"')
        expect(bodyText).not.toContain('"secret"')
        expect(bodyText).not.toContain('"analyticsKey"')
        expect(bodyText).not.toContain('"pushEndpoint"')
    })

    it('exports the explicit history_started marker and says earlier legacy actions are unavailable', async () => {
        const legacySlug = 'legacy-room-LiveCapability_987'
        const legacy = await prisma.room.create({
            data: { slug: legacySlug, name: 'Old flat', currency: 'GBP' },
        })
        const cutoffAt = new Date('2026-08-03T15:00:00.000Z')
        const cutoff = await prisma.roomAuditEvent.create({
            data: {
                roomId: legacy.id,
                action: 'history_started',
                subjectType: 'room',
                subjectId: legacy.id,
                createdAt: cutoffAt,
                detail: {
                    reason: 'History was introduced after this room was created. Earlier actions are unavailable.',
                },
            },
        })
        await prisma.roomAuditEvent.create({
            data: {
                roomId: legacy.id,
                action: 'room_settings_updated',
                subjectType: 'room',
                subjectId: legacy.id,
                after: { name: 'Old flat, refreshed' },
            },
        })

        const response = await call(getHistoryExport as Handler, {
            path: `/api/rooms/${legacySlug}/history/export`,
            params: { slug: legacySlug },
        })
        const bodyText = await response.text()
        const body = JSON.parse(bodyText) as RoomHistoryExport

        expect(response.status).toBe(200)
        expect(body.events.map((event) => event.action)).toEqual(['history_started', 'room_settings_updated'])
        expect(body.historyCoverage).toEqual({
            beginsAt: cutoffAt.toISOString(),
            basis: 'history_started',
            earlierEvents: 'unavailable',
            cutoffEventId: cutoff.id.toString(),
        })
        expect(body.events[0].detail).toEqual({
            reason: 'History was introduced after this room was created. Earlier actions are unavailable.',
        })
        expect(bodyText).not.toContain(legacySlug)
    })

    it('returns the ordinary private room-not-found envelope for an unknown capability', async () => {
        const missingSlug = 'missing-room-capability'
        const response = await call(getHistoryExport as Handler, {
            path: `/api/rooms/${missingSlug}/history/export`,
            params: { slug: missingSlug },
        })

        expect(response.status).toBe(404)
        expect(response.headers.get('cache-control')).toBe('private, no-store')
        expect(response.headers.get('content-disposition')).toBeNull()
        await expect(response.json()).resolves.toEqual({
            error: { code: 'NOT_FOUND', message: 'room not found' },
        })
    })
})
