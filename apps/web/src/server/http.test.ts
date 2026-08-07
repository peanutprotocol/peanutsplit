import { describe, expect, it } from 'vitest'
import {
    ApiError,
    DEFAULT_JSON_BODY_BYTES,
    PRIVATE_JSON_CACHE_CONTROL,
    badRequest,
    json,
    readJson,
    readJsonCapped,
    respond,
} from './http'

const request = (body: BodyInit, headers: Record<string, string> = {}) =>
    new Request('https://example.test/api', {
        method: 'POST',
        body,
        headers: { 'content-type': 'application/json', ...headers },
        duplex: 'half',
    } as RequestInit & { duplex: 'half' })

describe('JSON response caching', () => {
    it('defaults API JSON to private no-store', () => {
        expect(json({ room: 'private' }).headers.get('Cache-Control')).toBe(PRIVATE_JSON_CACHE_CONTROL)
    })

    it('lets an explicitly public endpoint override the private default', () => {
        expect(
            json({ public: true }, 200, { 'Cache-Control': 'public, max-age=60' }).headers.get('Cache-Control')
        ).toBe('public, max-age=60')
    })
})

describe('typed error details', () => {
    it('preserves bounded machine-readable context without changing ordinary envelopes', async () => {
        const response = await respond(() => {
            throw badRequest('PLN cannot be converted', 'IMPORT_CURRENCY_CONVERSION_UNSUPPORTED', {
                currencies: ['PLN'],
                targetCurrency: 'EUR',
            })
        })

        await expect(response.json()).resolves.toEqual({
            error: {
                code: 'IMPORT_CURRENCY_CONVERSION_UNSUPPORTED',
                message: 'PLN cannot be converted',
                details: { currencies: ['PLN'], targetCurrency: 'EUR' },
            },
        })
    })
})

describe('readJson', () => {
    it('parses an ordinary JSON request', async () => {
        await expect(readJson(request('{"name":"Peanut"}'))).resolves.toEqual({ name: 'Peanut' })
    })

    it('returns the existing malformed-JSON envelope', async () => {
        const response = await respond(() => readJson(request('{')))

        expect(response.status).toBe(400)
        await expect(response.json()).resolves.toEqual({
            error: { code: 'MALFORMED_JSON', message: 'request body must be JSON' },
        })
    })

    it('rejects a declared oversized body without reading it', async () => {
        const response = await respond(() =>
            readJson(request('{}', { 'content-length': String(DEFAULT_JSON_BODY_BYTES + 1) }))
        )

        expect(response.status).toBe(413)
        await expect(response.json()).resolves.toEqual({
            error: { code: 'REQUEST_TOO_LARGE', message: 'request body is too large' },
        })
    })

    it('counts an undeclared streaming body instead of trusting headers', async () => {
        const response = await respond(() => readJson(request(`"${'x'.repeat(DEFAULT_JSON_BODY_BYTES)}"`)))

        expect(response.status).toBe(413)
        await expect(response.json()).resolves.toEqual({
            error: { code: 'REQUEST_TOO_LARGE', message: 'request body is too large' },
        })
    })
})

describe('readJsonCapped', () => {
    it('preserves a caller ceiling above the default for imports and receipts', async () => {
        const value = 'x'.repeat(DEFAULT_JSON_BODY_BYTES)
        const largerCeiling = DEFAULT_JSON_BODY_BYTES * 2

        await expect(
            readJsonCapped(
                request(JSON.stringify({ value })),
                largerCeiling,
                badRequest('that import is too big', 'IMPORT_TOO_LARGE')
            )
        ).resolves.toEqual({ value })
    })

    it('preserves the caller-specific oversized error', async () => {
        const tooBig = new ApiError(413, 'SCAN_IMAGE_TOO_LARGE', 'that image is too large')
        const response = await respond(() => readJsonCapped(request('{}', { 'content-length': '11' }), 10, tooBig))

        expect(response.status).toBe(413)
        await expect(response.json()).resolves.toEqual({
            error: { code: 'SCAN_IMAGE_TOO_LARGE', message: 'that image is too large' },
        })
    })
})
