/**
 * The cutover decision table. Production hosts are pinned here rather than read from
 * `domains.ts`, because in the test build `NEXT_PUBLIC_BASE_URL` is unset and the two
 * hosts collapse into one — which is itself the last case in this file.
 */
import { describe, expect, it } from 'vitest'
import { cutoverRedirect, decideCutoverRedirect } from './cutover-redirects'

const LEGACY = 'peanutsplit.com'
const CANONICAL = 'split.peanut.me'

const decide = (host: string, pathname: string, search = '') =>
    decideCutoverRedirect(host, pathname, search, LEGACY, CANONICAL)

describe('decideCutoverRedirect', () => {
    it('bounces app paths on the legacy host to the canonical host, 301 — permanent since 2026-08-10', () => {
        for (const path of ['/app', '/new', '/import', '/r/ski-trip-R7LxQ3TBJV_uQ2PMhzc8rw']) {
            expect(decide(LEGACY, path)).toEqual({ target: `https://${CANONICAL}${path}`, status: 301 })
        }
    })

    it('accepts legacy www and canonicalises canonical www app pages', () => {
        expect(decide(`www.${LEGACY}`, '/app')).toEqual({ target: `https://${CANONICAL}/app`, status: 301 })
        expect(decide(`www.${CANONICAL}`, '/app')).toEqual({ target: `https://${CANONICAL}/app`, status: 301 })
        expect(decide(`www.${CANONICAL}`, '/r/trip-abc123', '?from=chat')).toEqual({
            target: `https://${CANONICAL}/r/trip-abc123?from=chat`,
            status: 301,
        })
        expect(decide(`www.${CANONICAL}`, '/')).toEqual({ target: `https://${LEGACY}/`, status: 302 })
    })

    it('preserves the query string across the bounce', () => {
        expect(decide(LEGACY, '/r/lisbon-abc123', '?from=group-chat')).toEqual({
            target: `https://${CANONICAL}/r/lisbon-abc123?from=group-chat`,
            status: 301,
        })
        expect(decide(CANONICAL, '/blog', '?utm_source=x')).toEqual({
            target: `https://${LEGACY}/blog?utm_source=x`,
            status: 302,
        })
    })

    it('leaves marketing on the legacy host alone', () => {
        for (const path of ['/', '/blog', '/blog/some-post', '/tools', '/splitwise-alternative', '/es-419/blog']) {
            expect(decide(LEGACY, path)).toBeNull()
        }
    })

    it('bounces marketing (and unknown slugs) on the canonical host back to legacy, 302', () => {
        for (const path of [
            '/',
            '/blog',
            '/blog/some-post',
            '/tools',
            '/splitwise-alternative',
            '/pt-br/blog',
            '/sitemap.xml',
            '/robots.txt',
        ]) {
            expect(decide(CANONICAL, path)).toEqual({ target: `https://${LEGACY}${path}`, status: 302 })
        }
        expect(decide(CANONICAL, '/tricount-alternative')).toEqual({
            target: `https://${LEGACY}/tricount-alternative`,
            status: 302,
        })
    })

    it('serves app paths on the canonical host in place', () => {
        for (const path of ['/app', '/new', '/import', '/r/ski-trip-R7LxQ3TBJV_uQ2PMhzc8rw']) {
            expect(decide(CANONICAL, path)).toBeNull()
        }
    })

    it('never redirects /handoff, /share-target or the probes, on either host', () => {
        for (const host of [LEGACY, `www.${LEGACY}`, CANONICAL, `www.${CANONICAL}`]) {
            for (const path of ['/handoff', '/share-target', '/healthcheck', '/readiness', '/dev-ds/audit']) {
                expect(decide(host, path)).toBeNull()
            }
        }
    })

    it('is inert on every non-production host', () => {
        for (const host of ['localhost', 'localhost:3100', '0.0.0.0:3000', '127.0.0.1', 'preview.example.com', '']) {
            expect(decide(host, '/app')).toBeNull()
            expect(decide(host, '/')).toBeNull()
        }
    })

    it('ignores port and case on the request host', () => {
        expect(decide('PeanutSplit.com:443', '/app')).toEqual({ target: `https://${CANONICAL}/app`, status: 301 })
    })

    it('is inert when the build is not cut over (canonical host === legacy host)', () => {
        expect(decideCutoverRedirect(LEGACY, '/app', '', LEGACY, LEGACY)).toBeNull()
    })

    it('is inert when the derived canonical host is loopback-ish (dev/e2e NEXT_PUBLIC_BASE_URL)', () => {
        for (const canonical of ['localhost', '127.0.0.1', '0.0.0.0']) {
            expect(decideCutoverRedirect(LEGACY, '/app', '', LEGACY, canonical)).toBeNull()
            expect(decideCutoverRedirect(canonical, '/', '', LEGACY, canonical)).toBeNull()
        }
    })
})

describe('cutoverRedirect (bound to this build)', () => {
    it('is fully inert in the test build, where NEXT_PUBLIC_BASE_URL is localhost', () => {
        expect(cutoverRedirect('peanutsplit.com', '/app', '')).toBeNull()
        expect(cutoverRedirect('localhost:3100', '/app', '')).toBeNull()
        expect(cutoverRedirect('localhost:3100', '/', '')).toBeNull()
    })
})
