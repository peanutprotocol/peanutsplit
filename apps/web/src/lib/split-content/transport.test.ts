import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
    SPLIT_ASSET_PREFIX,
    SPLIT_CONTENT_RENDER_HEADER,
    SPLIT_DIAGNOSTIC_HEADERS,
    SPLIT_EDGE_MARKER_HEADER,
    SPLIT_SITEMAP_PATH,
    classifySplitTransport,
    hasValidSplitMarker,
    inspectSplitTransport,
    isSplitContentRender,
    sanitizedSplitTransportHeaders,
    splitTransportResponseHeaders,
} from './transport'

const MARKER = 'split-content-test-marker-at-least-thirty-two-characters'
const MARKER_DIGEST = createHash('sha256').update(MARKER).digest('hex')

describe('Split renderer transport contract', () => {
    it('classifies exact locale guides, assets, sitemap, negative namespace, and unrelated routes', () => {
        expect(classifySplitTransport('/en/split/guides/synthetic-guide')).toEqual({
            action: 'forward',
            kind: 'content',
            locale: 'en',
        })
        expect(classifySplitTransport(`${SPLIT_ASSET_PREFIX}/_next/static/chunk.js`)).toEqual({
            action: 'forward',
            kind: 'asset',
        })
        expect(classifySplitTransport(SPLIT_SITEMAP_PATH)).toEqual({ action: 'forward', kind: 'sitemap' })

        for (const pathname of [
            '/split',
            '/en/split',
            '/fr/split/guides/synthetic-guide',
            '/en/split/guides/Unknown',
            '/en/split/guides/synthetic-guide/extra',
            '/split-sitemap.xml/extra',
        ]) {
            expect(classifySplitTransport(pathname), pathname).toEqual({ action: 'not-found' })
        }
        expect(classifySplitTransport('/app')).toEqual({ action: 'pass' })
        expect(classifySplitTransport('/split-staticish/chunk.js')).toEqual({ action: 'pass' })
    })

    it('hashes a 32+ character raw marker and compares only its public digest', () => {
        const headers = new Headers({ [SPLIT_EDGE_MARKER_HEADER]: MARKER })
        expect(hasValidSplitMarker(headers, undefined)).toBe(false)
        expect(hasValidSplitMarker(headers, 'short')).toBe(false)
        expect(hasValidSplitMarker(headers, '0'.repeat(64))).toBe(false)
        expect(hasValidSplitMarker(headers, createHash('sha256').update(`${MARKER}-wrong`).digest('hex'))).toBe(false)
        expect(hasValidSplitMarker(headers, MARKER_DIGEST.toUpperCase())).toBe(false)
        expect(hasValidSplitMarker(headers, MARKER_DIGEST)).toBe(true)

        const short = new Headers({ [SPLIT_EDGE_MARKER_HEADER]: 'short' })
        expect(hasValidSplitMarker(short, createHash('sha256').update('short').digest('hex'))).toBe(false)
    })

    it('strips credentials, secret, internal routing state, and caller diagnostics before React', () => {
        const headers = new Headers({
            cookie: 'private=value',
            authorization: 'Bearer private',
            host: 'renderer.internal',
            'x-forwarded-host': 'peanut.me',
            [SPLIT_EDGE_MARKER_HEADER]: MARKER,
            [SPLIT_CONTENT_RENDER_HEADER]: 'caller-controlled',
            [SPLIT_DIAGNOSTIC_HEADERS.markerValid]: 'caller-controlled',
        })
        const sanitized = sanitizedSplitTransportHeaders(headers)

        expect(sanitized.get('cookie')).toBeNull()
        expect(sanitized.get('authorization')).toBeNull()
        expect(sanitized.get(SPLIT_EDGE_MARKER_HEADER)).toBeNull()
        expect(sanitized.get(SPLIT_CONTENT_RENDER_HEADER)).toBeNull()
        for (const header of Object.values(SPLIT_DIAGNOSTIC_HEADERS)) expect(sanitized.get(header)).toBeNull()
        expect(sanitized.get('host')).toBe('renderer.internal')
        expect(sanitized.get('x-forwarded-host')).toBe('peanut.me')
    })

    it('emits only boolean diagnostics and keeps noindex fail-closed', () => {
        const request = new Headers({
            host: 'renderer.internal',
            'x-forwarded-host': 'peanut.me',
            cookie: 'sensitive-cookie',
            authorization: 'sensitive-auth',
            [SPLIT_EDGE_MARKER_HEADER]: MARKER,
        })
        const diagnostics = inspectSplitTransport('content', request, MARKER_DIGEST)
        const blocked = splitTransportResponseHeaders(diagnostics, false)
        const indexable = splitTransportResponseHeaders(diagnostics, true)

        for (const header of Object.values(SPLIT_DIAGNOSTIC_HEADERS)) {
            expect(blocked.get(header)).toMatch(/^[01]$/)
        }
        expect(blocked.get(SPLIT_DIAGNOSTIC_HEADERS.content)).toBe('1')
        expect(blocked.get('x-robots-tag')).toContain('noindex')
        expect(indexable.get('x-robots-tag')).toBeNull()
        const rendered = [...blocked].flat().join('\n')
        expect(rendered).not.toContain(MARKER)
        expect(rendered).not.toContain('sensitive-cookie')
        expect(rendered).not.toContain('sensitive-auth')
        expect(rendered).not.toContain('peanut.me')
    })

    it('trusts only the one internal content bit after sanitation', () => {
        expect(isSplitContentRender(new Headers())).toBe(false)
        expect(isSplitContentRender(new Headers({ [SPLIT_CONTENT_RENDER_HEADER]: '0' }))).toBe(false)
        expect(isSplitContentRender(new Headers({ [SPLIT_CONTENT_RENDER_HEADER]: '1' }))).toBe(true)
    })
})
