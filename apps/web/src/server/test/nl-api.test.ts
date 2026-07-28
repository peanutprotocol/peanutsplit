/**
 * The quick-add route, handler-level.
 *
 * Only one boundary is faked: the `fetch` to the model. Everything else — the
 * room, the rate limiters, the schemas, the error envelope — is the real thing,
 * because every gate in this file exists to stop a request reaching that
 * boundary and a mock of the gates would prove nothing.
 *
 * Normalization is `server/nlExpense.test.ts`'s job and is deliberately absent
 * here; what this file proves is that a request has to get past six gates before
 * a single token is bought, and that the route reaches the same draft when it
 * does.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { truncateAll } from '@/server/test/db'
import { ROOM_NL_LIMIT } from '@/server/nlExpense'
import { resetRateLimits } from '@/server/rateLimit'
import * as parseExpenseRoute from '@/app/api/rooms/[slug]/parse-expense/route'
import { GET as modelStatus } from '@/app/api/rooms/[slug]/receipt-parse/route'
import { POST as postRoom } from '@/app/api/rooms/route'
import { MAX_NL_TEXT_CHARS } from '@/lib/quick-add'
import type { ApiError, NlParseResult, RoomStateWithMember } from '@/lib/api-types'

const BASE = 'http://localhost'
const API_KEY = 'test-gemini-key'

const post = async <T>(slug: string, body: unknown, init: { contentLength?: number; ip?: string } = {}) => {
    const request = new Request(`${BASE}/api/rooms/${slug}/parse-expense`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(init.contentLength ? { 'Content-Length': String(init.contentLength) } : {}),
            ...(init.ip ? { 'X-Forwarded-For': init.ip } : {}),
        },
        body: JSON.stringify(body),
    })
    const response = await parseExpenseRoute.POST(request, { params: Promise.resolve({ slug }) })
    return { status: response.status, body: (await response.json()) as T }
}

/**
 * The same POST with a streamed body and NO `content-length` — what
 * `Transfer-Encoding: chunked` produces, and what a declared-length check reads
 * as zero. Chunked on purpose: the ceiling has to hold mid-read.
 */
const postChunked = async (slug: string, payload: string) => {
    const encoder = new TextEncoder()
    const CHUNK = 64 * 1024
    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            for (let at = 0; at < payload.length; at += CHUNK) {
                controller.enqueue(encoder.encode(payload.slice(at, at + CHUNK)))
            }
            controller.close()
        },
    })
    // `duplex` is required by Node for a streaming request body and is not in
    // the DOM's RequestInit.
    const request = new Request(`${BASE}/api/rooms/${slug}/parse-expense`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        duplex: 'half',
    } as RequestInit & { duplex: 'half' })
    const response = await parseExpenseRoute.POST(request, { params: Promise.resolve({ slug }) })
    return { status: response.status, body: (await response.json()) as ApiError }
}

/** What the model would have answered, on the Gemini wire this file runs on. */
const modelAnswer = (payload: unknown) =>
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    })

const newRoom = async (): Promise<string> => {
    const request = new Request(`${BASE}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Ski Trip', currency: 'EUR', creatorName: 'Ana' }),
    })
    const response = await postRoom(request)
    const state = (await response.json()) as RoomStateWithMember
    return state.room.slug
}

beforeEach(async () => {
    await truncateAll()
    // One map holds every bucket, per-IP and per-room alike.
    resetRateLimits()
    process.env.SPLIT_GEMINI_API_KEY = API_KEY
    // Explicitly absent, so a key in the developer's own shell cannot silently
    // move this whole file onto the other transport.
    delete process.env.SPLIT_OPENROUTER_API_KEY
    delete process.env.SPLIT_SCAN_PROXY_URL
})

afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.SPLIT_GEMINI_API_KEY
    delete process.env.SPLIT_OPENROUTER_API_KEY
})

describe('the shared capability probe', () => {
    it('is the ONLY probe — quick add has no GET of its own and rides this answer', async () => {
        expect(await modelStatus().json()).toEqual({ enabled: true })
        delete process.env.SPLIT_GEMINI_API_KEY
        expect(await modelStatus().json()).toEqual({ enabled: false })
        // Whatever the client learns about scanning, it learns about quick add:
        // one key, one boolean, and no second endpoint to drift from it.
        expect(parseExpenseRoute).not.toHaveProperty('GET')
    })
})

describe('POST — the gates in front of the model', () => {
    it('answers 503 with no key, without touching the database', async () => {
        delete process.env.SPLIT_GEMINI_API_KEY
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)

        const { status, body } = await post<ApiError>('does-not-exist', { text: 'taxi 12' })
        expect(status).toBe(503)
        expect(body.error.code).toBe('NL_UNAVAILABLE')
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('answers 413 on more text than one expense could be', async () => {
        const slug = await newRoom()
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)

        const { status, body } = await post<ApiError>(slug, { text: 'a'.repeat(MAX_NL_TEXT_CHARS + 1) })
        expect(status).toBe(413)
        expect(body.error.code).toBe('NL_TEXT_TOO_LONG')
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('answers 413 on a declared content-length past the ceiling, before reading the body', async () => {
        const slug = await newRoom()
        const { status, body } = await post<ApiError>(slug, { text: 'taxi 12' }, { contentLength: 100_000 })
        expect(status).toBe(413)
        expect(body.error.code).toBe('NL_TEXT_TOO_LONG')
    })

    /**
     * The bypass a declared-length check could never catch: chunked, so there is
     * no header at all and the missing value reads as zero. The bulk sits in a
     * field the schema ignores, which is what makes this a body-size test rather
     * than a text-length one — buffered, this payload would have passed every
     * later gate and gone to the model.
     */
    it('answers 413 on an oversized body that declares no length at all', async () => {
        const slug = await newRoom()
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)

        const { status, body } = await postChunked(
            slug,
            JSON.stringify({ text: 'taxi 12', junk: 'x'.repeat(MAX_NL_TEXT_CHARS * 8) })
        )
        expect(status).toBe(413)
        expect(body.error.code).toBe('NL_TEXT_TOO_LONG')
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('rejects an empty line rather than paying for an answer about nothing', async () => {
        const slug = await newRoom()
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)

        const { status, body } = await post<ApiError>(slug, { text: '   ' })
        expect(status).toBe(400)
        expect(body.error.code).toBe('VALIDATION_ERROR')
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('404s an unknown room', async () => {
        vi.stubGlobal('fetch', vi.fn())
        const { status, body } = await post<ApiError>('no-such-room-aaaaaa', { text: 'taxi 12' })
        expect(status).toBe(404)
        expect(body.error.code).toBe('NOT_FOUND')
    })

    it('caps a room at its daily allowance even across IPs', async () => {
        const slug = await newRoom()
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => modelAnswer({ amountMinor: '1200' }))
        )

        // Each call from a different address: this test is about the room's own
        // budget surviving a change of address, which is the whole reason it is
        // keyed on the room.
        for (let i = 0; i < ROOM_NL_LIMIT.capacity; i++) {
            const { status } = await post<NlParseResult>(slug, { text: 'taxi 12' }, { ip: `10.0.0.${i + 1}` })
            expect(status).toBe(200)
        }
        const { status, body } = await post<ApiError>(slug, { text: 'taxi 12' }, { ip: '10.0.1.1' })
        expect(status).toBe(429)
        expect(body.error.code).toBe('NL_ROOM_LIMIT')
    })

    it('caps a single IP at the ordinary write allowance, across rooms', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => modelAnswer({ amountMinor: '1200' }))
        )
        // Three rooms, forty calls each: the per-room ceiling is 60, so nothing
        // below stops this except the per-IP bucket — which is what makes the
        // 121st call the assertion.
        const slugs = [await newRoom(), await newRoom(), await newRoom()]
        for (const slug of slugs) {
            for (let i = 0; i < 40; i++) {
                const { status } = await post<NlParseResult>(slug, { text: 'taxi 12' }, { ip: '10.9.9.9' })
                expect(status).toBe(200)
            }
        }

        const { status, body } = await post<ApiError>(slugs[0], { text: 'taxi 12' }, { ip: '10.9.9.9' })
        expect(status).toBe(429)
        expect(body.error.code).toBe('RATE_LIMITED')
    })
})

describe('POST — the model boundary', () => {
    it('returns a draft with the room resolved into member ids', async () => {
        const slug = await newRoom()
        vi.stubGlobal(
            'fetch',
            vi.fn(async () =>
                modelAnswer({
                    description: 'cena',
                    amountMinor: '4500',
                    currency: 'EUR',
                    date: '2026-07-27',
                    payerName: 'Ana',
                    participantNames: ['Ana', 'Jota'],
                })
            )
        )

        const { status, body } = await post<NlParseResult>(slug, { text: 'cena 45 pagó Ana' })
        expect(status).toBe(200)
        expect(body.draft.description).toBe('cena')
        expect(body.draft.amountMinor).toBe('4500')
        expect(body.draft.currency).toBe('EUR')
        expect(body.draft.date).toBe('2026-07-27')
        // Ana is the room's creator, so the payer resolves; Jota is not in it.
        expect(body.draft.paidById).toEqual(expect.any(String))
        expect(body.draft.participantIds).toEqual([body.draft.paidById])
        expect(body.unmatchedNames).toEqual(['Jota'])
    })

    it('turns an upstream rejection into a 502 the client can translate', async () => {
        const slug = await newRoom()
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('nope', { status: 429 }))
        )

        const { status, body } = await post<ApiError>(slug, { text: 'taxi 12' })
        expect(status).toBe(502)
        expect(body.error.code).toBe('NL_FAILED')
    })

    it('reports "no amount in that" distinctly from "the call failed"', async () => {
        const slug = await newRoom()
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => modelAnswer({ description: 'dinner' }))
        )

        const { status, body } = await post<ApiError>(slug, { text: 'dinner was nice' })
        expect(status).toBe(422)
        expect(body.error.code).toBe('NL_NO_AMOUNT')
    })
})
