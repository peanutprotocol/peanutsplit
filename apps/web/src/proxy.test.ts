import { createHash } from 'node:crypto'
import { NextRequest } from 'next/server'
import { afterAll, describe, expect, it } from 'vitest'
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE_SECONDS } from '@/i18n/locales'
import { LOCALE_HEADER } from '@/i18n/paths'
import {
    SPLIT_ASSET_PREFIX,
    SPLIT_CONTENT_INDEX_RENDER_HEADER,
    SPLIT_CONTENT_RENDER_HEADER,
    SPLIT_DIAGNOSTIC_HEADERS,
    SPLIT_EDGE_INDEX_RELEASED_HEADER,
    SPLIT_EDGE_MARKER_HEADER,
    SPLIT_MANIFEST_SHA256_HEADER,
    SPLIT_SITEMAP_PATH,
    type SplitTransportKind,
} from '@/lib/split-content/transport'
import { config, proxy, splitTransportResponse } from './proxy'

const priorIndexable = process.env.SEO_INDEXABLE
const MARKER = 'proxy-test-marker-with-at-least-thirty-two-characters'
const MARKER_DIGEST = createHash('sha256').update(MARKER).digest('hex')
const MANIFEST_DIGEST = createHash('sha256').update('proxy exact manifest bytes').digest('hex')

function releaseHeaders(indexReleased: '0' | '1' = '0'): Record<string, string> {
    return {
        [SPLIT_EDGE_MARKER_HEADER]: MARKER,
        [SPLIT_MANIFEST_SHA256_HEADER]: MANIFEST_DIGEST,
        [SPLIT_EDGE_INDEX_RELEASED_HEADER]: indexReleased,
    }
}

afterAll(() => {
    if (priorIndexable === undefined) delete process.env.SEO_INDEXABLE
    else process.env.SEO_INDEXABLE = priorIndexable
})

function expectSplitDiagnostics(
    response: Response,
    kind: SplitTransportKind,
    markerValid: '0' | '1',
    releaseValid: '0' | '1' = markerValid
) {
    expect(response.headers.get(SPLIT_DIAGNOSTIC_HEADERS.markerValid)).toBe(markerValid)
    expect(response.headers.get(SPLIT_DIAGNOSTIC_HEADERS.releaseValid)).toBe(releaseValid)
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
                    ...releaseHeaders(),
                    [SPLIT_CONTENT_RENDER_HEADER]: 'caller-controlled',
                    [SPLIT_CONTENT_INDEX_RENDER_HEADER]: 'caller-controlled',
                },
            }),
            MARKER_DIGEST,
            MANIFEST_DIGEST
        )!

        expect(response.status).toBe(200)
        expect(response.headers.get('location')).toBeNull()
        expect(response.headers.get(SPLIT_DIAGNOSTIC_HEADERS.cookiePresent)).toBe('1')
        expect(response.headers.get(SPLIT_DIAGNOSTIC_HEADERS.authorizationPresent)).toBe('1')
        expectSplitDiagnostics(response, 'content', '1')
        expect(response.headers.get(`x-middleware-request-${LOCALE_HEADER}`)).toBe('pt-br')
        expect(response.headers.get(`x-middleware-request-${SPLIT_CONTENT_RENDER_HEADER}`)).toBe('1')
        expect(response.headers.get(`x-middleware-request-${SPLIT_CONTENT_INDEX_RENDER_HEADER}`)).toBe('0')
        expect(response.headers.get('x-middleware-request-cookie')).toBeNull()
        expect(response.headers.get('x-middleware-request-authorization')).toBeNull()
        expect(response.headers.get(`x-middleware-request-${SPLIT_EDGE_MARKER_HEADER}`)).toBeNull()
        expect(response.headers.get(`x-middleware-request-${SPLIT_MANIFEST_SHA256_HEADER}`)).toBeNull()
        expect(response.headers.get(`x-middleware-request-${SPLIT_EDGE_INDEX_RELEASED_HEADER}`)).toBeNull()
        expect([...response.headers].flat().join('\n')).not.toContain(MARKER)
        expect([...response.headers].flat().join('\n')).not.toContain(MANIFEST_DIGEST)
    })

    it('fails every owned marked route closed when the manifest or index attestation is missing or malformed', () => {
        const routes: Array<[SplitTransportKind, string]> = [
            ['content', '/en/split/guides/synthetic-guide'],
            ['asset', `${SPLIT_ASSET_PREFIX}/_next/static/chunks/app.js`],
            ['sitemap', SPLIT_SITEMAP_PATH],
        ]
        const invalidHeaders = [
            { ...releaseHeaders(), [SPLIT_MANIFEST_SHA256_HEADER]: '' },
            {
                ...releaseHeaders(),
                [SPLIT_MANIFEST_SHA256_HEADER]: createHash('sha256').update('wrong manifest').digest('hex'),
            },
            { ...releaseHeaders(), [SPLIT_MANIFEST_SHA256_HEADER]: MANIFEST_DIGEST.toUpperCase() },
            { ...releaseHeaders(), [SPLIT_EDGE_INDEX_RELEASED_HEADER]: '' },
            { ...releaseHeaders(), [SPLIT_EDGE_INDEX_RELEASED_HEADER]: 'true' },
            { ...releaseHeaders(), [SPLIT_EDGE_INDEX_RELEASED_HEADER]: '1,0' },
        ]

        for (const [kind, pathname] of routes) {
            for (const headers of invalidHeaders) {
                const response = splitTransportResponse(
                    new NextRequest(`https://renderer.internal${pathname}`, { headers }),
                    MARKER_DIGEST,
                    MANIFEST_DIGEST
                )!
                expect(response.status, `${kind} ${JSON.stringify(headers)}`).toBe(404)
                expectSplitDiagnostics(response, kind, '1', '0')
                expect(response.headers.get('x-robots-tag')).toContain('noindex')
                const serialized = [...response.headers].flat().join('\n')
                expect(serialized).not.toContain(MARKER)
                expect(serialized).not.toContain(MANIFEST_DIGEST)
            }
        }
    })

    it('fails closed without throwing when the deployed manifest digest is missing or invalid', () => {
        for (const expectedManifestDigest of [
            null,
            '',
            'not-a-digest',
            MANIFEST_DIGEST.toUpperCase(),
            '0'.repeat(64),
        ]) {
            const response = splitTransportResponse(
                new NextRequest('https://renderer.internal/en/split/guides/synthetic-guide', {
                    headers: releaseHeaders(),
                }),
                MARKER_DIGEST,
                expectedManifestDigest
            )!

            expect(response.status, String(expectedManifestDigest)).toBe(404)
            expectSplitDiagnostics(response, 'content', '1', '0')
            expect(response.headers.get(SPLIT_DIAGNOSTIC_HEADERS.manifestValid)).toBe('0')
            expect(response.headers.get('x-robots-tag')).toContain('noindex')
        }
    })

    it('forwards an exact edge index bit only as trusted internal state while the source gate stays dark', () => {
        const response = splitTransportResponse(
            new NextRequest('https://renderer.internal/en/split/guides/synthetic-guide', {
                headers: releaseHeaders('1'),
            }),
            MARKER_DIGEST,
            MANIFEST_DIGEST
        )!

        expect(response.status).toBe(200)
        expectSplitDiagnostics(response, 'content', '1')
        expect(response.headers.get(SPLIT_DIAGNOSTIC_HEADERS.indexReleased)).toBe('1')
        expect(response.headers.get(`x-middleware-request-${SPLIT_CONTENT_INDEX_RENDER_HEADER}`)).toBe('1')
        expect(response.headers.get(`x-middleware-request-${SPLIT_EDGE_INDEX_RELEASED_HEADER}`)).toBeNull()
        expect(response.headers.get('x-robots-tag')).toContain('noindex')
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
                    headers: { host: 'split.peanut.me', ...releaseHeaders() },
                }),
                MARKER_DIGEST,
                MANIFEST_DIGEST
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
                headers: releaseHeaders(),
            }),
            MARKER_DIGEST,
            MANIFEST_DIGEST
        )!
        const post = splitTransportResponse(
            new NextRequest('https://renderer.internal/en/split/guides/synthetic-guide', {
                method: 'POST',
                headers: releaseHeaders(),
            }),
            MARKER_DIGEST,
            MANIFEST_DIGEST
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
        const direct = splitTransportResponse(
            new NextRequest(`https://renderer.internal${pathname}`, {
                headers: {
                    cookie: 'product-cookie=value',
                    authorization: 'Bearer product-token',
                    [SPLIT_MANIFEST_SHA256_HEADER]: 'caller-controlled',
                    [SPLIT_EDGE_INDEX_RELEASED_HEADER]: '1',
                    [SPLIT_CONTENT_INDEX_RENDER_HEADER]: '1',
                },
            }),
            MARKER_DIGEST,
            MANIFEST_DIGEST
        )!
        const invalid = splitTransportResponse(
            new NextRequest(`https://renderer.internal${pathname}`, {
                headers: { ...releaseHeaders(), [SPLIT_EDGE_MARKER_HEADER]: `${MARKER}-wrong` },
            }),
            MARKER_DIGEST,
            MANIFEST_DIGEST
        )!
        const valid = splitTransportResponse(
            new NextRequest(`https://renderer.internal${pathname}`, {
                headers: releaseHeaders(),
            }),
            MARKER_DIGEST,
            MANIFEST_DIGEST
        )!

        expect(direct.status).toBe(200)
        expect(direct.headers.get(SPLIT_DIAGNOSTIC_HEADERS.markerValid)).toBeNull()
        expect(direct.headers.get('x-middleware-request-cookie')).toBe('product-cookie=value')
        expect(direct.headers.get('x-middleware-request-authorization')).toBe('Bearer product-token')
        expect(direct.headers.get(`x-middleware-request-${SPLIT_MANIFEST_SHA256_HEADER}`)).toBeNull()
        expect(direct.headers.get(`x-middleware-request-${SPLIT_EDGE_INDEX_RELEASED_HEADER}`)).toBeNull()
        expect(direct.headers.get(`x-middleware-request-${SPLIT_CONTENT_INDEX_RENDER_HEADER}`)).toBeNull()
        expect(invalid.status).toBe(404)
        expectSplitDiagnostics(invalid, 'asset', '0')
        expect(valid.status).toBe(200)
        expectSplitDiagnostics(valid, 'asset', '1')
    })

    it('globally scrubs caller release and internal controls from unrelated React routes', () => {
        const response = proxy(
            new NextRequest('https://renderer.internal/app', {
                headers: {
                    cookie: 'product-cookie=value',
                    authorization: 'Bearer product-token',
                    ...releaseHeaders('1'),
                    [SPLIT_CONTENT_RENDER_HEADER]: '1',
                    [SPLIT_CONTENT_INDEX_RENDER_HEADER]: '1',
                    [SPLIT_DIAGNOSTIC_HEADERS.releaseValid]: '1',
                },
            })
        )

        expect(response.status).toBe(200)
        expect(response.headers.get('x-middleware-request-cookie')).toBe('product-cookie=value')
        expect(response.headers.get('x-middleware-request-authorization')).toBe('Bearer product-token')
        for (const header of [
            SPLIT_EDGE_MARKER_HEADER,
            SPLIT_MANIFEST_SHA256_HEADER,
            SPLIT_EDGE_INDEX_RELEASED_HEADER,
            SPLIT_CONTENT_RENDER_HEADER,
            SPLIT_CONTENT_INDEX_RENDER_HEADER,
            ...Object.values(SPLIT_DIAGNOSTIC_HEADERS),
        ]) {
            expect(response.headers.get(`x-middleware-request-${header}`), header).toBeNull()
        }
    })
})
