/**
 * The receipt-scan route, handler-level.
 *
 * Only one boundary is faked: the `fetch` to the vision API. Everything else —
 * the room, the rate limiters, the schemas, the error envelope — is the real
 * thing, because every gate in this file exists to stop a request reaching that
 * boundary and a mock of the gates would prove nothing.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { truncateAll } from '@/server/test/db'
import { MAX_IMAGE_BASE64_CHARS, ROOM_SCAN_LIMIT } from '@/server/receipt'
import { resetRateLimits } from '@/server/rateLimit'
import { GET as scanStatus, POST as scanParse } from '@/app/api/rooms/[slug]/receipt-parse/route'
import { GET as getRoom } from '@/app/api/rooms/[slug]/route'
import { POST as postRoom } from '@/app/api/rooms/route'
import type { ApiError, ParsedReceipt, ReceiptParseInput, RoomStateWithMember } from '@/lib/api-types'

const BASE = 'http://localhost'
const API_KEY = 'test-gemini-key'
const priorV2 = process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED

type ReceiptMimeType = ReceiptParseInput['mimeType']

const signedImages = {
    'image/jpeg': Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    ]).toString('base64'),
    'image/png': Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    ]).toString('base64'),
    'image/webp': Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x08, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
    ]).toString('base64'),
} satisfies Record<ReceiptMimeType, string>

/** Exact-length base64 with a JPEG signature, for the ordinary and size-limit paths. */
const image = (chars = 2048) => `${signedImages['image/jpeg'].slice(0, 4)}${'A'.repeat(chars)}`.slice(0, chars)

const post = async <T>(
    slug: string,
    body: unknown,
    init: { contentLength?: number; ip?: string; signal?: AbortSignal } = {}
) => {
    const request = new Request(`${BASE}/api/rooms/${slug}/receipt-parse`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(init.contentLength ? { 'Content-Length': String(init.contentLength) } : {}),
            ...(init.ip ? { 'X-Forwarded-For': init.ip } : {}),
        },
        body: JSON.stringify(body),
        signal: init.signal,
    })
    const response = await scanParse(request, { params: Promise.resolve({ slug }) })
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
    const request = new Request(`${BASE}/api/rooms/${slug}/receipt-parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        duplex: 'half',
    } as RequestInit & { duplex: 'half' })
    const response = await scanParse(request, { params: Promise.resolve({ slug }) })
    return { status: response.status, body: (await response.json()) as ApiError }
}

const readRoom = async (slug: string) => {
    const request = new Request(`${BASE}/api/rooms/${slug}`)
    const response = await getRoom(request, { params: Promise.resolve({ slug }) })
    return { status: response.status, body: (await response.json()) as ApiError }
}

/** What the model would have answered. `parts` is the shape the REST API uses.
 *  This file runs the Gemini-direct transport throughout — the gates in front of
 *  the model are transport-blind, and proving that once is enough. The OpenRouter
 *  wire has its own suite in `server/receiptTransport.test.ts`; the one case
 *  below is here because reaching it goes through every gate above. */
const modelAnswer = (payload: unknown) =>
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    })

/** The same answer, as OpenRouter's OpenAI-shaped chat completion. */
const openRouterAnswer = (payload: unknown) =>
    new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }), {
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
    process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED = '1'
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

afterAll(() => {
    if (priorV2 === undefined) delete process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED
    else process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED = priorV2
})

describe('v2 boundary', () => {
    it('does not expose scanning in v1, even when the model key exists', async () => {
        delete process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED
        try {
            const response = scanStatus()
            expect(response.status).toBe(404)
            expect((await response.json()).error.code).toBe('NOT_FOUND')
        } finally {
            process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED = '1'
        }
    })
})

describe('capability probe', () => {
    it('reports enabled when a key is configured, and caches the answer', async () => {
        const response = scanStatus()
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ enabled: true })
        expect(response.headers.get('Cache-Control')).toContain('max-age=3600')
    })

    it('reports disabled with no key — the UI hides the whole feature on this', async () => {
        delete process.env.SPLIT_GEMINI_API_KEY
        expect(await scanStatus().json()).toEqual({ enabled: false })
    })

    it('reports enabled on the OpenRouter key alone — the client never learns which wire', async () => {
        delete process.env.SPLIT_GEMINI_API_KEY
        process.env.SPLIT_OPENROUTER_API_KEY = 'test-openrouter-key'
        expect(await scanStatus().json()).toEqual({ enabled: true })
    })
})

describe('POST — the gates in front of the model', () => {
    it('answers 503 with no key, without touching the database', async () => {
        delete process.env.SPLIT_GEMINI_API_KEY
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)

        const { status, body } = await post<ApiError>('does-not-exist', {
            imageBase64: image(),
            mimeType: 'image/jpeg',
        })
        expect(status).toBe(503)
        expect(body.error.code).toBe('SCAN_UNAVAILABLE')
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('answers 413 on an oversized image', async () => {
        const slug = await newRoom()
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)

        const { status, body } = await post<ApiError>(slug, {
            imageBase64: image(MAX_IMAGE_BASE64_CHARS + 4),
            mimeType: 'image/jpeg',
        })
        expect(status).toBe(413)
        expect(body.error.code).toBe('SCAN_IMAGE_TOO_LARGE')
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('answers 413 on a declared content-length past the ceiling, before reading the body', async () => {
        const slug = await newRoom()
        const { status, body } = await post<ApiError>(
            slug,
            { imageBase64: image(), mimeType: 'image/jpeg' },
            { contentLength: MAX_IMAGE_BASE64_CHARS * 2 }
        )
        expect(status).toBe(413)
        expect(body.error.code).toBe('SCAN_IMAGE_TOO_LARGE')
    })

    /**
     * The bypass a declared-length check could never catch: chunked, so there is
     * no header at all and the missing value reads as zero. The bulk sits in a
     * field the schema ignores, which is what makes this a body-size test rather
     * than an image-size one — buffered, this payload would have passed every
     * later gate and gone to the model.
     */
    it('answers 413 on an oversized body that declares no length at all', async () => {
        const slug = await newRoom()
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)

        const { status, body } = await postChunked(
            slug,
            JSON.stringify({ imageBase64: image(), mimeType: 'image/jpeg', junk: 'x'.repeat(MAX_IMAGE_BASE64_CHARS) })
        )
        expect(status).toBe(413)
        expect(body.error.code).toBe('SCAN_IMAGE_TOO_LARGE')
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('rejects an image type the model does not take', async () => {
        const slug = await newRoom()
        const { status, body } = await post<ApiError>(slug, { imageBase64: image(), mimeType: 'image/gif' })
        expect(status).toBe(400)
        expect(body.error.code).toBe('VALIDATION_ERROR')
    })

    it('rejects a data: URL left on the front of the base64', async () => {
        const slug = await newRoom()
        const { status, body } = await post<ApiError>(slug, {
            imageBase64: `data:image/jpeg;base64,${image()}`,
            mimeType: 'image/jpeg',
        })
        expect(status).toBe(400)
        expect(body.error.code).toBe('SCAN_BAD_IMAGE')
    })

    it.each(Object.entries(signedImages) as [ReceiptMimeType, string][])(
        'accepts bytes carrying the declared %s signature',
        async (mimeType, imageBase64) => {
            const slug = await newRoom()
            const fetchMock = vi.fn(async () => modelAnswer({ items: [{ label: 'Beer', amountMinor: '500' }] }))
            vi.stubGlobal('fetch', fetchMock)

            const { status } = await post<ParsedReceipt>(slug, { imageBase64, mimeType })

            expect(status).toBe(200)
            expect(fetchMock).toHaveBeenCalledOnce()
        }
    )

    it.each([
        ['image/jpeg', 'image/png'],
        ['image/png', 'image/webp'],
        ['image/webp', 'image/jpeg'],
    ] as const)('rejects %s bytes declared as %s before calling the provider', async (actualType, declaredType) => {
        const slug = await newRoom()
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)

        const { status, body } = await post<ApiError>(slug, {
            imageBase64: signedImages[actualType],
            mimeType: declaredType,
        })

        expect(status).toBe(400)
        expect(body.error.code).toBe('SCAN_BAD_IMAGE')
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('404s an unknown room', async () => {
        vi.stubGlobal('fetch', vi.fn())
        const { status, body } = await post<ApiError>('no-such-room-aaaaaa', {
            imageBase64: image(),
            mimeType: 'image/jpeg',
        })
        expect(status).toBe(404)
        expect(body.error.code).toBe('NOT_FOUND')
    })

    it('shares the room-lookup miss budget and hides real slugs once it is exhausted', async () => {
        const slug = await newRoom()
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)

        // Spend most of the shared 30-miss allowance through the ordinary room
        // endpoint, then finish it here. If scanning kept a private lookup
        // bucket, all of the receipt requests below would still answer 404.
        for (let i = 0; i < 25; i++) {
            expect((await readRoom(`missing-read-${i}`)).status).toBe(404)
        }
        for (let i = 0; i < 5; i++) {
            expect(
                (
                    await post<ApiError>(`missing-scan-${i}`, {
                        imageBase64: image(),
                        mimeType: 'image/jpeg',
                    })
                ).status
            ).toBe(404)
        }

        const exhaustedMiss = await post<ApiError>('missing-scan-5', {
            imageBase64: image(),
            mimeType: 'image/jpeg',
        })
        expect(exhaustedMiss.status).toBe(429)
        expect(exhaustedMiss.body.error.code).toBe('RATE_LIMITED')

        // Refuse an existing slug at the same boundary; otherwise the 429/404
        // distinction would itself reveal whether the guessed room exists.
        const existing = await post<ApiError>(slug, {
            imageBase64: image(),
            mimeType: 'image/jpeg',
        })
        expect(existing.status).toBe(429)
        expect(existing.body.error.code).toBe('RATE_LIMITED')
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('caps a single IP at ten scans an hour', async () => {
        const slug = await newRoom()
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => modelAnswer({ items: [{ label: 'Beer', amountMinor: '500' }] }))
        )

        for (let i = 0; i < 10; i++) {
            const { status } = await post<ParsedReceipt>(slug, { imageBase64: image(), mimeType: 'image/jpeg' })
            expect(status).toBe(200)
        }
        const { status, body } = await post<ApiError>(slug, { imageBase64: image(), mimeType: 'image/jpeg' })
        expect(status).toBe(429)
        expect(body.error.code).toBe('RATE_LIMITED')
    })

    it('caps a room at its daily allowance even across IPs', async () => {
        const slug = await newRoom()
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => modelAnswer({ items: [{ label: 'Beer', amountMinor: '500' }] }))
        )

        // The per-IP allowance is ten, so each scan comes from a different
        // address — this test is about the room's own budget surviving a change
        // of address, which is the whole reason it is keyed on the room.
        for (let i = 0; i < ROOM_SCAN_LIMIT.capacity; i++) {
            const { status } = await post<ParsedReceipt>(
                slug,
                { imageBase64: image(), mimeType: 'image/jpeg' },
                { ip: `10.0.0.${i + 1}` }
            )
            expect(status).toBe(200)
        }
        const { status, body } = await post<ApiError>(
            slug,
            { imageBase64: image(), mimeType: 'image/jpeg' },
            { ip: '10.0.1.1' }
        )
        expect(status).toBe(429)
        expect(body.error.code).toBe('SCAN_ROOM_LIMIT')
    })
})

describe('POST — the model boundary', () => {
    it('returns normalised items and sends the image as inline data with the key in a header', async () => {
        const slug = await newRoom()
        const fetchMock = vi.fn(async () =>
            modelAnswer({
                items: [
                    { label: 'Margherita', amountMinor: '1200', quantity: 2 },
                    { label: 'Water', amountMinor: '350' },
                ],
                total: { amountMinor: '1550' },
                currency: 'EUR',
                merchant: 'Da Nino',
                date: '2026-07-15',
            })
        )
        vi.stubGlobal('fetch', fetchMock)

        const { status, body } = await post<ParsedReceipt>(slug, {
            imageBase64: image(),
            mimeType: 'image/jpeg',
        })

        expect(status).toBe(200)
        expect(body.items).toHaveLength(2)
        expect(body.suggestedTotalMinor).toBe('1550')
        expect(body.receiptTotalMinor).toBe('1550')
        expect(body.currency).toBe('EUR')
        expect(body.merchant).toBe('Da Nino')
        expect(body.date).toBe('2026-07-15')

        // The mock declares no parameters, so its recorded call tuple is typed
        // empty — through `unknown` is the only way to read the arguments back.
        const [url, init] = fetchMock.mock.calls[0] as unknown as [
            string,
            RequestInit & { headers: Record<string, string> },
        ]
        expect(url).toContain('generativelanguage.googleapis.com')
        expect(init.headers['x-goog-api-key']).toBe(API_KEY)
        const sent = JSON.parse(String(init.body))
        expect(sent.contents[0].parts[1].inline_data).toEqual({ mime_type: 'image/jpeg', data: image() })
        expect(sent.generationConfig.responseMimeType).toBe('application/json')
    })

    it('turns an upstream rejection into a 502 the client can translate', async () => {
        const slug = await newRoom()
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('nope', { status: 429 }))
        )

        const { status, body } = await post<ApiError>(slug, { imageBase64: image(), mimeType: 'image/jpeg' })
        expect(status).toBe(502)
        expect(body.error.code).toBe('SCAN_FAILED')
    })

    it('turns a transport failure into a 502 rather than a 500', async () => {
        const slug = await newRoom()
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => {
                throw new Error('connect ECONNREFUSED')
            })
        )

        const { status, body } = await post<ApiError>(slug, { imageBase64: image(), mimeType: 'image/jpeg' })
        expect(status).toBe(502)
        expect(body.error.code).toBe('SCAN_FAILED')
    })

    it('aborts the outbound provider request when the receipt POST is aborted', async () => {
        const slug = await newRoom()
        const requestController = new AbortController()
        const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
            const signal = init?.signal
            return new Promise<Response>((_resolve, reject) => {
                if (!signal) return
                const rejectAbort = () => reject(signal.reason ?? new DOMException('aborted', 'AbortError'))
                if (signal.aborted) rejectAbort()
                else signal.addEventListener('abort', rejectAbort, { once: true })
            })
        })
        vi.stubGlobal('fetch', fetchMock)

        const pending = post<ApiError>(
            slug,
            { imageBase64: image(), mimeType: 'image/jpeg' },
            { signal: requestController.signal }
        )
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
        const providerSignal = (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.signal

        requestController.abort()
        const { status, body } = await pending

        expect(providerSignal?.aborted).toBe(true)
        expect(status).toBe(502)
        expect(body.error.code).toBe('SCAN_FAILED')
    })

    it('returns the same body over OpenRouter, having passed every gate above', async () => {
        // The route's only knowledge of a transport is `modelEnabled()`. This is
        // the proof that the preferred wire reaches the same JSON envelope
        // through the real rate limiters, the real room and the real schemas.
        process.env.SPLIT_OPENROUTER_API_KEY = 'test-openrouter-key'
        const slug = await newRoom()
        const fetchMock = vi.fn(async () =>
            openRouterAnswer({ items: [{ label: 'Beer', amountMinor: '500' }], currency: 'EUR' })
        )
        vi.stubGlobal('fetch', fetchMock)

        const { status, body } = await post<ParsedReceipt>(slug, { imageBase64: image(), mimeType: 'image/jpeg' })
        expect(status).toBe(200)
        expect(body.items).toEqual([{ label: 'Beer', amountMinor: '500', quantity: null }])
        expect(body.suggestedTotalMinor).toBe('500')
        expect(body.currency).toBe('EUR')

        const [url] = fetchMock.mock.calls[0] as unknown as [string]
        expect(url).toContain('openrouter.ai')
    })

    it('reports "nothing readable" distinctly from "the call failed"', async () => {
        const slug = await newRoom()
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => modelAnswer({ items: [] }))
        )

        const { status, body } = await post<ApiError>(slug, { imageBase64: image(), mimeType: 'image/jpeg' })
        expect(status).toBe(422)
        expect(body.error.code).toBe('SCAN_NO_ITEMS')
    })
})
