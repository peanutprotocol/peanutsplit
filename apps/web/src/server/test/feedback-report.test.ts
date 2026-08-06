import { beforeEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import * as feedbackRoute from '@/app/api/rooms/[slug]/feedback/route'
import { POST as postFeedback } from '@/app/api/rooms/[slug]/feedback/route'
import { POST as postExpense } from '@/app/api/rooms/[slug]/expenses/route'
import { GET as getRoom } from '@/app/api/rooms/[slug]/route'
import { POST as postRoom } from '@/app/api/rooms/route'
import { MAX_FEEDBACK_REQUEST_BYTES, MAX_FEEDBACK_SCREENSHOT_EDGE } from '@/lib/feedback-contract'
import type { ApiError, RoomState, RoomStateWithMember } from '@/lib/api-types'
import { prisma, truncateAll } from '@/server/test/db'
import { resetRateLimits } from '@/server/rateLimit'

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
        headers?: Record<string, string>
    }
): Promise<{ status: number; body: T; headers: Headers }> {
    const request = new Request(`${BASE}${options.path}`, {
        method: options.method ?? 'GET',
        headers: {
            'Content-Type': 'application/json',
            ...(options.token ? { 'X-Member-Token': options.token } : {}),
            ...options.headers,
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
    const response = await handler(request, { params: Promise.resolve(options.params ?? {}) })
    return { status: response.status, body: (await response.json()) as T, headers: response.headers }
}

const createRoom = () =>
    call<RoomStateWithMember>(postRoom as Handler, {
        path: '/api/rooms',
        method: 'POST',
        body: { name: 'Private support room', currency: 'ARS', creatorName: 'Ana' },
    })

const consent = {
    confirmed: true as const,
    diagnostics: false,
    roomSnapshot: false,
    screenshot: false,
}

const diagnostics = {
    browser: { userAgent: 'Example Browser 1', language: 'es-AR', platform: 'Phone', cookieEnabled: true },
    viewport: {
        width: 390,
        height: 844,
        screenWidth: 390,
        screenHeight: 844,
        devicePixelRatio: 3,
        maxTouchPoints: 5,
    },
    timeZone: 'America/Argentina/Buenos_Aires',
    pwa: { standalone: true, displayMode: 'standalone' as const },
    network: { online: true, effectiveType: '4g' as const, downlinkMbps: 10, rttMs: 30, saveData: false },
}

beforeEach(async () => {
    await truncateAll()
    resetRateLimits()
})

describe('POST /api/rooms/:slug/feedback', () => {
    it('persists only required text when every optional attachment is off', async () => {
        const { body: created } = await createRoom()
        const auditCount = await prisma.roomAuditEvent.count({ where: { roomId: created.room.id } })
        const path = `/api/rooms/${created.room.slug}/feedback`
        const message = `The issue appears at /r/${created.room.slug} and bare ${created.room.slug}.`

        const response = await call<{ reportId: string }>(postFeedback as Handler, {
            path,
            method: 'POST',
            params: { slug: created.room.slug },
            token: created.memberToken,
            body: { message, consent },
        })

        expect(response.status).toBe(201)
        expect(response.headers.get('cache-control')).toBe('private, no-store')
        const row = await prisma.feedbackReport.findUniqueOrThrow({ where: { id: response.body.reportId } })
        expect(row).toMatchObject({
            roomId: created.room.id,
            message: 'The issue appears at /r/[slug] and bare [room].',
            diagnostics: null,
            roomSnapshot: null,
            screenshot: null,
        })
        // A private support write is not a room-visible activity event.
        expect(await prisma.roomAuditEvent.count({ where: { roomId: created.room.id } })).toBe(auditCount)
    })

    it('captures consented diagnostics, bounded ledger context and a validated screenshot', async () => {
        const { body: created } = await createRoom()
        await call<RoomState>(postExpense as Handler, {
            path: `/api/rooms/${created.room.slug}/expenses`,
            method: 'POST',
            params: { slug: created.room.slug },
            token: created.memberToken,
            body: {
                description: 'Dinner with private note',
                amountMinor: '12345678',
                currency: 'ARS',
                paidById: created.memberId,
                splitMode: 'EQUAL',
                participantIds: [created.memberId],
            },
        })

        const jpeg = await sharp({
            create: { width: 390, height: 844, channels: 3, background: '#ffffff' },
        })
            .jpeg()
            .toBuffer()
        const response = await call<{ reportId: string }>(postFeedback as Handler, {
            path: `/api/rooms/${created.room.slug}/feedback`,
            method: 'POST',
            params: { slug: created.room.slug },
            token: created.memberToken,
            body: {
                message: 'The dinner row renders at the wrong size.',
                consent: { ...consent, diagnostics: true, roomSnapshot: true, screenshot: true },
                diagnostics,
                screenshot: {
                    imageBase64: jpeg.toString('base64'),
                    mimeType: 'image/jpeg',
                    byteLength: jpeg.byteLength,
                    width: 390,
                    height: 844,
                },
            },
        })

        expect(response.status).toBe(201)
        const row = await prisma.feedbackReport.findUniqueOrThrow({ where: { id: response.body.reportId } })
        expect(row.diagnostics).toEqual(diagnostics)
        expect(row.screenshotMimeType).toBe('image/jpeg')
        expect(row.screenshotByteLength).toBe(jpeg.byteLength)
        expect(row.screenshotWidth).toBe(390)
        expect(row.screenshotHeight).toBe(844)
        expect(Buffer.from(row.screenshot ?? []).equals(jpeg)).toBe(true)

        const snapshot = row.roomSnapshot as Record<string, unknown>
        expect(snapshot).toMatchObject({
            version: 1,
            room: { name: 'Private support room', currency: 'ARS' },
            counts: { members: 1, expenses: 1, settlements: 0 },
            truncated: { members: false, expenses: false, settlements: false },
        })
        const stored = JSON.stringify(row)
        expect(stored).not.toContain(created.room.slug)
        expect(stored).not.toContain(created.memberToken)
        expect(stored).not.toContain('actorDeviceHash')
        expect(stored).not.toContain('receiptUrl')
        expect(stored).toContain('Dinner with private note')
        expect(stored).toContain('12345678')
    })

    it('prunes expired private data and report deletion cannot cascade into room data', async () => {
        const { body: created } = await createRoom()
        const expense = await prisma.expense.create({
            data: {
                roomId: created.room.id,
                description: 'Ledger row that must survive report deletion',
                amountMinor: 5000n,
                currency: 'ARS',
                baseAmountMinor: 5000n,
                fxRate: '1',
                paidById: created.memberId,
                createdById: created.memberId,
                splitMode: 'EQUAL',
                shares: { create: { memberId: created.memberId, amountMinor: 5000n } },
            },
        })
        const stale = await prisma.feedbackReport.create({
            data: {
                roomId: created.room.id,
                message: 'Expired screenshot placeholder',
                screenshot: Uint8Array.from([0xff, 0xd8, 0xff]),
                screenshotMimeType: 'image/jpeg',
                screenshotByteLength: 3,
                screenshotWidth: 1,
                screenshotHeight: 1,
                createdAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000),
            },
        })

        const response = await call<{ reportId: string }>(postFeedback as Handler, {
            path: `/api/rooms/${created.room.slug}/feedback`,
            method: 'POST',
            params: { slug: created.room.slug },
            body: { message: 'A fresh report triggers the retention sweep.', consent },
        })
        expect(response.status).toBe(201)
        expect(await prisma.feedbackReport.findUnique({ where: { id: stale.id } })).toBeNull()

        await prisma.feedbackReport.delete({ where: { id: response.body.reportId } })
        expect(await prisma.room.findUnique({ where: { id: created.room.id } })).not.toBeNull()
        expect(await prisma.member.findUnique({ where: { id: created.memberId } })).not.toBeNull()
        expect(await prisma.expense.findUnique({ where: { id: expense.id } })).not.toBeNull()
    })

    it('has a database backstop for screenshot MIME, byte count and the pixel edge cap', async () => {
        const { body: created } = await createRoom()
        const write = (message: string, overrides: Record<string, unknown>) =>
            prisma.feedbackReport.create({
                data: {
                    roomId: created.room.id,
                    message,
                    screenshot: Uint8Array.from([0xff, 0xd8, 0xff]),
                    screenshotMimeType: 'image/jpeg',
                    screenshotByteLength: 3,
                    screenshotWidth: 1,
                    screenshotHeight: 1,
                    ...overrides,
                },
            })

        await expect(write('Direct invalid write', { screenshotByteLength: 2 })).rejects.toThrow()
        // The backstop tracks the app limit, not the 20000 it was born with.
        await expect(
            write('Direct oversized write', { screenshotWidth: MAX_FEEDBACK_SCREENSHOT_EDGE + 1 })
        ).rejects.toThrow()
        await expect(
            write('Direct oversized write', { screenshotHeight: MAX_FEEDBACK_SCREENSHOT_EDGE + 1 })
        ).rejects.toThrow()
        expect(await prisma.feedbackReport.count()).toBe(0)

        // …and stops exactly there, so a full-width screenshot still stores.
        await write('Direct write at the edge', {
            screenshotWidth: MAX_FEEDBACK_SCREENSHOT_EDGE,
            screenshotHeight: MAX_FEEDBACK_SCREENSHOT_EDGE,
        })
        expect(await prisma.feedbackReport.count()).toBe(1)
    })

    it('rejects unconsented attachments and forged screenshot metadata without storing a row', async () => {
        const { body: created } = await createRoom()
        const path = `/api/rooms/${created.room.slug}/feedback`

        const unconsented = await call<ApiError>(postFeedback as Handler, {
            path,
            method: 'POST',
            params: { slug: created.room.slug },
            body: { message: 'This includes details without permission.', consent, diagnostics },
        })
        expect(unconsented.status).toBe(400)

        const jpeg = Buffer.from([0xff, 0xd8, 0xff, ...new Array(13).fill(0)])
        const forged = await call<ApiError>(postFeedback as Handler, {
            path,
            method: 'POST',
            params: { slug: created.room.slug },
            body: {
                message: 'This screenshot claims the wrong byte count.',
                consent: { ...consent, screenshot: true },
                screenshot: {
                    imageBase64: jpeg.toString('base64'),
                    mimeType: 'image/jpeg',
                    byteLength: jpeg.byteLength - 1,
                    width: 390,
                    height: 844,
                },
            },
        })
        expect(forged.status).toBe(400)
        expect(await prisma.feedbackReport.count()).toBe(0)

        const realJpeg = await sharp({
            create: { width: 2, height: 3, channels: 3, background: '#ffffff' },
        })
            .jpeg()
            .toBuffer()
        const forgedDimensions = await call<ApiError>(postFeedback as Handler, {
            path,
            method: 'POST',
            params: { slug: created.room.slug },
            body: {
                message: 'This screenshot claims dimensions it does not have.',
                consent: { ...consent, screenshot: true },
                screenshot: {
                    imageBase64: realJpeg.toString('base64'),
                    mimeType: 'image/jpeg',
                    byteLength: realJpeg.byteLength,
                    width: 3,
                    height: 2,
                },
            },
        })
        expect(forgedDimensions.status).toBe(400)
        expect(forgedDimensions.body.error.code).toBe('VALIDATION_ERROR')
        expect(await prisma.feedbackReport.count()).toBe(0)
    })

    it('refuses screenshot bytes that do not decode, over-run the pixel cap, or stop halfway', async () => {
        const { body: created } = await createRoom()
        const path = `/api/rooms/${created.room.slug}/feedback`
        const post = (message: string, screenshot: Record<string, unknown>) =>
            call<ApiError>(postFeedback as Handler, {
                path,
                method: 'POST',
                params: { slug: created.room.slug },
                body: { message, consent: { ...consent, screenshot: true }, screenshot },
            })

        // A JPEG signature with nothing usable behind it, and an honest byte
        // count — so this is the first case that survives as far as the decoder.
        const headerOnly = Buffer.from([0xff, 0xd8, 0xff, ...new Array(13).fill(0)])
        const undecodable = await post('These screenshot bytes are not really an image.', {
            imageBase64: headerOnly.toString('base64'),
            mimeType: 'image/jpeg',
            byteLength: headerOnly.byteLength,
            width: 390,
            height: 844,
        })
        expect(undecodable.status).toBe(400)
        expect(undecodable.body.error.code).toBe('VALIDATION_ERROR')

        // The schema caps a *claimed* edge at 1600, so the only way to post a
        // 2000px image is to understate it. libvips' pixel limit is what
        // notices, because nothing before it has looked at the real bitmap.
        const oversized = await sharp({
            create: { width: 2000, height: 2000, channels: 3, background: '#ffffff' },
        })
            .jpeg()
            .toBuffer()
        const tooManyPixels = await post('This screenshot understates how big it really is.', {
            imageBase64: oversized.toString('base64'),
            mimeType: 'image/jpeg',
            byteLength: oversized.byteLength,
            width: MAX_FEEDBACK_SCREENSHOT_EDGE,
            height: MAX_FEEDBACK_SCREENSHOT_EDGE,
        })
        expect(tooManyPixels.status).toBe(400)
        expect(tooManyPixels.body.error.code).toBe('VALIDATION_ERROR')

        // Half a real JPEG, zero-padded back to its original length. Byte count,
        // MIME signature and header dimensions all agree; only a full pixel
        // decode can tell that the scan data runs out.
        const whole = await sharp({
            create: { width: 320, height: 240, channels: 3, background: '#336699' },
        })
            .jpeg()
            .toBuffer()
        const kept = Math.floor(whole.byteLength / 2)
        const halfJpeg = Buffer.concat([whole.subarray(0, kept), Buffer.alloc(whole.byteLength - kept)])
        expect(halfJpeg.byteLength).toBe(whole.byteLength)
        const truncated = await post('This screenshot stops halfway through its pixels.', {
            imageBase64: halfJpeg.toString('base64'),
            mimeType: 'image/jpeg',
            byteLength: halfJpeg.byteLength,
            width: 320,
            height: 240,
        })
        expect(truncated.status).toBe(400)
        expect(truncated.body.error.code).toBe('VALIDATION_ERROR')

        expect(await prisma.feedbackReport.count()).toBe(0)
    })

    it('enforces the route body cap before room lookup', async () => {
        const request = new Request(`${BASE}/api/rooms/not-a-room/feedback`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'content-length': String(MAX_FEEDBACK_REQUEST_BYTES + 1),
            },
            body: '{}',
        })
        const response = await postFeedback(request, { params: Promise.resolve({ slug: 'not-a-room' }) })
        expect(response.status).toBe(413)
        await expect(response.json()).resolves.toMatchObject({ error: { code: 'REQUEST_TOO_LARGE' } })
        expect(await prisma.feedbackReport.count()).toBe(0)
    })

    it('rate-limits durable private writes separately from ordinary room traffic', async () => {
        const { body: created } = await createRoom()
        const path = `/api/rooms/${created.room.slug}/feedback`
        const send = (index: number) =>
            call<{ reportId: string } & ApiError>(postFeedback as Handler, {
                path,
                method: 'POST',
                params: { slug: created.room.slug },
                body: { message: `Problem report number ${index} has enough detail.`, consent },
            })

        for (let index = 1; index <= 5; index++) expect((await send(index)).status).toBe(201)
        const limited = await send(6)
        expect(limited.status).toBe(429)
        expect(limited.body.error.code).toBe('RATE_LIMITED')
        expect(await prisma.feedbackReport.count()).toBe(5)
    })

    it('has no room-readable report endpoint and never adds report data to RoomState', async () => {
        expect(feedbackRoute).not.toHaveProperty('GET')
        const { body: created } = await createRoom()
        const secret = 'Only private support should see this sentence.'
        await call(postFeedback as Handler, {
            path: `/api/rooms/${created.room.slug}/feedback`,
            method: 'POST',
            params: { slug: created.room.slug },
            body: { message: secret, consent },
        })

        const room = await call<RoomState>(getRoom as Handler, {
            path: `/api/rooms/${created.room.slug}`,
            params: { slug: created.room.slug },
        })
        expect(JSON.stringify(room.body)).not.toContain(secret)
        expect(room.body).not.toHaveProperty('feedbackReports')
    })
})

describe('private report logging boundary', () => {
    it('does not write an unexpected private payload into console logs', async () => {
        const secret = 'private-report-payload-marker'
        const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const { respondSensitive } = await import('@/server/http')
        const response = await respondSensitive(async () => {
            throw new Error(secret)
        })
        expect(response.status).toBe(500)
        expect(log).not.toHaveBeenCalled()
        expect(await response.text()).not.toContain(secret)
        log.mockRestore()
    })

    it('signals a broken decoder instead of blaming the reporter for it', async () => {
        vi.resetModules()
        vi.doMock('sharp', () => ({
            default: () => {
                throw new TypeError('sharp native binding is missing')
            },
        }))
        const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        try {
            const { decodeFeedbackScreenshot } = await import('@/server/feedback')
            const bytes = Buffer.from([0xff, 0xd8, 0xff, ...new Array(13).fill(0)])
            // A 400 here would be indistinguishable from ordinary user error,
            // so a broken image pipeline would sit in production unnoticed.
            await expect(
                decodeFeedbackScreenshot({
                    imageBase64: bytes.toString('base64'),
                    mimeType: 'image/jpeg',
                    byteLength: bytes.byteLength,
                    width: 390,
                    height: 844,
                })
            ).rejects.toBeInstanceOf(TypeError)
            // The name only: the surrounding request body is private prose.
            expect(log).toHaveBeenCalledWith('[split] feedback screenshot decode failed', 'TypeError')
        } finally {
            log.mockRestore()
            vi.doUnmock('sharp')
            vi.resetModules()
        }
    })
})
