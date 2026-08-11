import { createHash } from 'node:crypto'
import { NextRequest } from 'next/server'
import { afterAll, describe, expect, it } from 'vitest'
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE_SECONDS } from '@/i18n/locales'
import { LOCALE_HEADER } from '@/i18n/paths'
import {
    SPLIT_ASSET_PREFIX,
    SPLIT_CONTENT_RENDER_HEADER,
    SPLIT_DIAGNOSTIC_HEADERS,
    SPLIT_EDGE_MARKER_HEADER,
    SPLIT_SITEMAP_PATH,
    type SplitTransportKind,
} from '@/lib/split-content/transport'
import { config, proxy, splitTransportResponse } from './proxy'

const priorIndexable = process.env.SEO_INDEXABLE
const MARKER = 'proxy-test-marker-with-at-least-thirty-two-characters'
const MARKER_DIGEST = createHash('sha256').update(MARKER).digest('hex')

afterAll(() => {
    if (priorIndexable === undefined) delete process.env.SEO_INDEXABLE
    else process.env.SEO_INDEXABLE = priorIndexable
})

function expectSplitDiagnostics(response: Response, kind: SplitTransportKind, markerValid: '0' | '1') {
    expect(response.headers.get(SPLIT_DIAGNOSTIC_HEADERS.markerValid)).toBe(markerValid)
    for (const candidate of ['content', 'asset', 'sitemap'] as const) {
        expect(response.headers.get(SPLIT_DIAGNOSTIC_HEADERS[candidate])).toBe(candidate === kind ? '1' : '0')
    }
    for (const header of Object.values(SPLIT_DIAGNOSTIC_HEADERS)) {
        expect(response.headers.get(header)).toMatch(/^[01]$/)
    }
}

describe('proxy /new locale handoff', () => {
    it('runs the host cutover for dotted robots and sitemap metadata routes', () => {
        expect(config.matcher).toContain('/sitemap.xml')
        expect(config.matcher).toContain('/robots.txt')
    })

    it('sets first-paint locale context and persists it without redirecting or dropping query parameters', () => {
        const request = new NextRequest(
            'http://localhost/new?locale=pt-br&utm_source=peanut.me&utm_campaign=split-content'
        )

        const response = proxy(request)

        expect(response.status).toBe(200)
        expect(response.headers.get('location')).toBeNull()
        expect(response.headers.get(`x-middleware-request-${LOCALE_HEADER}`)).toBe('pt-br')
        expect(response.cookies.get(LOCALE_COOKIE)?.value).toBe('pt-br')
        expect(response.headers.get('set-cookie')).toContain(`Max-Age=${LOCALE_COOKIE_MAX_AGE_SECONDS}`)
        expect(response.headers.get('set-cookie')).toContain('Path=/')
        expect(response.headers.get('set-cookie')).toContain('SameSite=lax')
        expect(request.nextUrl.search).toBe('?locale=pt-br&utm_source=peanut.me&utm_campaign=split-content')
    })

    it('leaves invalid and absent handoffs on the existing cookie-decided path', () => {
        for (const query of ['', '?locale=es', '?locale=fr']) {
            const response = proxy(new NextRequest(`http://localhost/new${query}`))

            expect(response.headers.get(`x-middleware-request-${LOCALE_HEADER}`)).toBeNull()
            expect(response.cookies.get(LOCALE_COOKIE)).toBeUndefined()
        }
    })
})

describe('proxy Split content transport boundary', () => {
    it('keeps the committed verifier disabled even when a caller supplies a plausible raw marker', () => {
        const response = proxy(
            new NextRequest('https://renderer.internal/en/split/guides/synthetic-guide', {
                headers: { [SPLIT_EDGE_MARKER_HEADER]: MARKER },
            })
        )

        expect(response.status).toBe(404)
        expectSplitDiagnostics(response, 'content', '0')
    })

    it('fails missing markers before the canonical-host cutover can redirect a guide', () => {
        const response = splitTransportResponse(
            new NextRequest('https://renderer.internal/en/split/guides/synthetic-guide', {
                headers: { host: 'split.peanut.me', 'x-forwarded-host': 'split.peanut.me' },
            }),
            MARKER_DIGEST
        )!

        expect(response.status).toBe(404)
        expect(response.headers.get('location')).toBeNull()
        expect(response.headers.get('x-robots-tag')).toContain('noindex')
        expectSplitDiagnostics(response, 'content', '0')
    })

    it('accepts a valid marker, strips credentials, sets trusted locale/content state, and bypasses cutover', () => {
        const response = splitTransportResponse(
            new NextRequest('https://renderer.internal/pt-br/split/guides/synthetic-guide', {
                headers: {
                    host: 'split.peanut.me',
                    'x-forwarded-host': 'peanut.me',
                    cookie: 'private=value',
                    authorization: 'Bearer private',
                    [SPLIT_EDGE_MARKER_HEADER]: MARKER,
                    [SPLIT_CONTENT_RENDER_HEADER]: 'caller-controlled',
                },
            }),
            MARKER_DIGEST
        )!

        expect(response.status).toBe(200)
        expect(response.headers.get('location')).toBeNull()
        expect(response.headers.get(SPLIT_DIAGNOSTIC_HEADERS.cookiePresent)).toBe('1')
        expect(response.headers.get(SPLIT_DIAGNOSTIC_HEADERS.authorizationPresent)).toBe('1')
        expectSplitDiagnostics(response, 'content', '1')
        expect(response.headers.get(`x-middleware-request-${LOCALE_HEADER}`)).toBe('pt-br')
        expect(response.headers.get(`x-middleware-request-${SPLIT_CONTENT_RENDER_HEADER}`)).toBe('1')
        expect(response.headers.get('x-middleware-request-cookie')).toBeNull()
        expect(response.headers.get('x-middleware-request-authorization')).toBeNull()
        expect(response.headers.get(`x-middleware-request-${SPLIT_EDGE_MARKER_HEADER}`)).toBeNull()
        expect([...response.headers].flat().join('\n')).not.toContain(MARKER)
    })

    it('reserves missing locales and every unknown Split subtree as true 404', () => {
        for (const pathname of [
            '/split',
            '/en/split',
            '/fr/split/guides/synthetic-guide',
            '/en/split/unknown',
            '/split-sitemap.xml/extra',
        ]) {
            const response = splitTransportResponse(
                new NextRequest(`https://renderer.internal${pathname}`, {
                    headers: { host: 'split.peanut.me', [SPLIT_EDGE_MARKER_HEADER]: MARKER },
                }),
                MARKER_DIGEST
            )!
            expect(response.status, pathname).toBe(404)
            expect(response.headers.get('location'), pathname).toBeNull()
        }
    })

    it('protects the sitemap and method boundary with the same fail-closed contract', () => {
        const missing = splitTransportResponse(
            new NextRequest(`https://renderer.internal${SPLIT_SITEMAP_PATH}`),
            MARKER_DIGEST
        )!
        const valid = splitTransportResponse(
            new NextRequest(`https://renderer.internal${SPLIT_SITEMAP_PATH}`, {
                headers: { [SPLIT_EDGE_MARKER_HEADER]: MARKER },
            }),
            MARKER_DIGEST
        )!
        const post = splitTransportResponse(
            new NextRequest('https://renderer.internal/en/split/guides/synthetic-guide', {
                method: 'POST',
                headers: { [SPLIT_EDGE_MARKER_HEADER]: MARKER },
            }),
            MARKER_DIGEST
        )!

        expect(missing.status).toBe(404)
        expectSplitDiagnostics(missing, 'sitemap', '0')
        expect(valid.status).toBe(200)
        expectSplitDiagnostics(valid, 'sitemap', '1')
        expect(post.status).toBe(405)
        expect(post.headers.get('allow')).toBe('GET, HEAD')
    })

    it('keeps markerless product chunks public but rejects an explicitly invalid asset marker', () => {
        const pathname = `${SPLIT_ASSET_PREFIX}/_next/static/chunks/app.js`
        const direct = splitTransportResponse(new NextRequest(`https://renderer.internal${pathname}`), MARKER_DIGEST)!
        const invalid = splitTransportResponse(
            new NextRequest(`https://renderer.internal${pathname}`, {
                headers: { [SPLIT_EDGE_MARKER_HEADER]: `${MARKER}-wrong` },
            }),
            MARKER_DIGEST
        )!
        const valid = splitTransportResponse(
            new NextRequest(`https://renderer.internal${pathname}`, {
                headers: { [SPLIT_EDGE_MARKER_HEADER]: MARKER },
            }),
            MARKER_DIGEST
        )!

        expect(direct.status).toBe(200)
        expect(direct.headers.get(SPLIT_DIAGNOSTIC_HEADERS.markerValid)).toBeNull()
        expect(invalid.status).toBe(404)
        expectSplitDiagnostics(invalid, 'asset', '0')
        expect(valid.status).toBe(200)
        expectSplitDiagnostics(valid, 'asset', '1')
    })
})
