import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE_SECONDS } from '@/i18n/locales'
import { LOCALE_HEADER } from '@/i18n/paths'
import { SPLIT_ASSET_PREFIX } from '@/lib/domains'
import { MARKETING_CACHE_CONTROL } from '@/lib/marketing-cache'
import { splitGuidePaths } from '@/lib/split-content/artifact'
import { SPLIT_CONTENT_INDEX_RELEASED_PATHS } from '@/lib/split-content/index-release'
import { config, proxy } from './proxy'

describe('proxy /new locale handoff', () => {
    it('matches identity-bearing files and APIs for alias canonicalisation', () => {
        expect(config.matcher).toContain('/sitemap.xml')
        expect(config.matcher).toContain('/robots.txt')
        expect(config.matcher).toContain('/manifest.webmanifest')
        expect(config.matcher).toContain('/sw.js')
        expect(config.matcher).toContain('/favicon.ico')
        expect(config.matcher).toContain('/icon.png')
        expect(config.matcher).toContain('/icons/:path*')
        expect(config.matcher).toContain('/api/:path*')
        expect(config.matcher).toContain(`${SPLIT_ASSET_PREFIX}/:path*`)
    })

    it('strips one trailing slash in one hop, keeping the query, before any other handling', () => {
        const response = proxy(new NextRequest('http://localhost/blog/?utm_source=chat'))

        expect(response.status).toBe(308)
        expect(response.headers.get('location')).toBe('http://localhost/blog?utm_source=chat')
    })

    it('leaves the root and doubled slashes alone, like the built-in strip it replaces', () => {
        for (const path of ['/', '/blog', '/blog//']) {
            const response = proxy(new NextRequest(`http://localhost${path}`))
            expect(response.headers.get('location'), path).toBeNull()
        }
    })

    it('matches dotted trailing-slash paths so the strip covers them too', () => {
        expect(config.matcher).toContain('/((?!api/|_next/|split-static/).*\\..*)/')
    })

    it('no longer owns a /split namespace or a renderer-only sitemap route', () => {
        expect(config.matcher).not.toContain('/split/:path*')
        expect(config.matcher).not.toContain('/:locale/split/:path*')
        expect(config.matcher).not.toContain('/split-sitemap.xml/:path*')
        expect(config.matcher.join('\n')).not.toContain('split-sitemap')
    })

    it('redirects the former host before any app or content handling', () => {
        for (const path of ['/app', '/r/trip-abc123', '/guides/synthetic-guide']) {
            const response = proxy(
                new NextRequest(`https://renderer.internal${path}?from=chat`, {
                    headers: { 'x-forwarded-host': 'split.peanut.me' },
                })
            )
            expect(response.status, path).toBe(308)
            expect(response.headers.get('location'), path).toBe(`https://peanutsplit.com${path}?from=chat`)
        }
    })

    it('passes canonical APIs through without rewriting request headers', () => {
        const response = proxy(
            new NextRequest('https://renderer.internal/api/rooms', {
                headers: { 'x-forwarded-host': 'peanutsplit.com', cookie: 'ps-locale=pt-br' },
            })
        )

        expect(response.status).toBe(200)
        expect(response.headers.get('location')).toBeNull()
        expect(response.headers.get(`x-middleware-request-${LOCALE_HEADER}`)).toBeNull()
    })

    it('sets first-paint locale context and persists it without redirecting or dropping query parameters', () => {
        const request = new NextRequest(
            'http://localhost/new?locale=pt-br&utm_source=peanutsplit.com&utm_campaign=split-content'
        )

        const response = proxy(request)

        expect(response.status).toBe(200)
        expect(response.headers.get('location')).toBeNull()
        expect(response.headers.get(`x-middleware-request-${LOCALE_HEADER}`)).toBe('pt-br')
        expect(response.cookies.get(LOCALE_COOKIE)?.value).toBe('pt-br')
        expect(response.headers.get('set-cookie')).toContain(`Max-Age=${LOCALE_COOKIE_MAX_AGE_SECONDS}`)
        expect(response.headers.get('set-cookie')).toContain('Path=/')
        expect(response.headers.get('set-cookie')).toContain('SameSite=lax')
        expect(request.nextUrl.search).toBe('?locale=pt-br&utm_source=peanutsplit.com&utm_campaign=split-content')
    })

    it('leaves invalid and absent handoffs on the existing cookie-decided path', () => {
        for (const query of ['', '?locale=es', '?locale=uk-UA']) {
            const response = proxy(new NextRequest(`http://localhost/new${query}`))

            expect(response.headers.get(`x-middleware-request-${LOCALE_HEADER}`)).toBeNull()
            expect(response.cookies.get(LOCALE_COOKIE)).toBeUndefined()
        }
    })
})

describe('proxy marketing page cache rule', () => {
    it('shares the indexable marketing pages for ten minutes with an hour of stale-while-revalidate', () => {
        expect(MARKETING_CACHE_CONTROL).toBe('public, max-age=0, s-maxage=600, stale-while-revalidate=3600')

        for (const pathname of [
            '/blog',
            '/es-419/blog/split-expenses-across-currencies',
            '/tools',
            '/tricount-alternative',
        ]) {
            const response = proxy(new NextRequest(`https://renderer.internal${pathname}`))

            expect(response.status, pathname).toBe(200)
            expect(response.headers.get('cache-control'), pathname).toBe(MARKETING_CACHE_CONTROL)
        }
    })

    it("leaves the cookie-localized landing and shell on Next's no-store", () => {
        for (const pathname of ['/', '/app', '/new', '/r/trip-abc123', '/import']) {
            const response = proxy(new NextRequest(`https://renderer.internal${pathname}`))

            expect(response.status, pathname).toBe(200)
            expect(response.headers.get('cache-control'), pathname).toBeNull()
        }
    })

    it('keeps the handoff on /new uncached even though it states a locale', () => {
        const response = proxy(new NextRequest('https://renderer.internal/new?locale=pt-br'))
        expect(response.headers.get('cache-control')).toBeNull()
    })
})

describe('proxy Split guide responses', () => {
    it('renders a guide while the index kill switch keeps it out of every index and cache', () => {
        for (const pathname of ['/guides/synthetic-guide', '/es-419/guides/synthetic-guide']) {
            const response = proxy(new NextRequest(`https://renderer.internal${pathname}`))

            expect(response.status, pathname).toBe(200)
            expect(response.headers.get('location'), pathname).toBeNull()
            expect(response.headers.get('x-robots-tag'), pathname).toBe('noindex, nofollow, noarchive')
            expect(response.headers.get('cache-control'), pathname).toBe('private, no-store')
        }
    })

    it('states each guide locale from the path, English included', () => {
        const cases = [
            ['/guides/synthetic-guide', 'en'],
            ['/es-419/guides/synthetic-guide', 'es-419'],
            ['/pt-br/guides/synthetic-guide', 'pt-br'],
        ] as const

        for (const [pathname, locale] of cases) {
            const response = proxy(new NextRequest(`https://renderer.internal${pathname}`))
            expect(response.headers.get(`x-middleware-request-${LOCALE_HEADER}`), pathname).toBe(locale)
        }
    })

    it('drops a caller-supplied locale header on every route rather than trusting it', () => {
        for (const pathname of ['/app', '/guides/synthetic-guide']) {
            const response = proxy(
                new NextRequest(`https://renderer.internal${pathname}`, {
                    headers: { [LOCALE_HEADER]: 'pt-br', cookie: 'product-cookie=value' },
                })
            )

            // `/app` is cookie-localized, so nothing may set the header there at all.
            const forwarded = response.headers.get(`x-middleware-request-${LOCALE_HEADER}`)
            expect(forwarded, pathname).toBe(pathname === '/app' ? null : 'en')
            expect(response.headers.get('x-middleware-request-cookie'), pathname).toBe('product-cookie=value')
        }
    })

    it('no longer 404s the retired /split namespace in the proxy', () => {
        for (const pathname of ['/split', '/split/anything', '/en/split/guides/synthetic-guide']) {
            const response = proxy(new NextRequest(`https://renderer.internal${pathname}`))
            expect(response.status, pathname).toBe(200)
            expect(response.headers.get('x-robots-tag'), pathname).toBeNull()
        }
    })
})

/**
 * The cases above run on `/guides/synthetic-guide`, which is a fixture slug and can never be in the
 * release registry — so they only ever prove the parked half. These run the sixteen paths the
 * installed artifact really serves, on a box that has claimed to be the indexed deployment.
 *
 * That is what makes a typo in the nine-path list visible: a mistyped entry releases nothing, so
 * the real path keeps its noindex while the registry says it is out, and the split below stops
 * matching.
 */
describe('proxy released and parked guide headers on the indexed deployment', () => {
    const released: readonly string[] = SPLIT_CONTENT_INDEX_RELEASED_PATHS
    const guidePaths = splitGuidePaths()
    const parked = guidePaths.filter((publicPath) => !released.includes(publicPath))

    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it('splits the installed cohort into the nine released and the seven parked', () => {
        expect(guidePaths).toHaveLength(16)
        // Named one by one, so a typo in the registry fails on the path that does not exist rather
        // than on an arithmetic mismatch.
        for (const publicPath of released) expect(guidePaths, publicPath).toContain(publicPath)
        expect(released).toHaveLength(9)
        expect(parked).toHaveLength(7)
    })

    it('answers every released path without a noindex tag and without the private cache rule', () => {
        vi.stubEnv('SEO_INDEXABLE', 'true')

        for (const pathname of released) {
            const response = proxy(new NextRequest(`https://renderer.internal${pathname}`))

            expect(response.status, pathname).toBe(200)
            expect(response.headers.get('location'), pathname).toBeNull()
            expect(response.headers.get('x-robots-tag'), pathname).toBeNull()
            expect(response.headers.get('cache-control'), pathname).toBeNull()
        }
    })

    it('keeps every parked path noindex even once the deployment is the indexed one', () => {
        vi.stubEnv('SEO_INDEXABLE', 'true')

        for (const pathname of parked) {
            const response = proxy(new NextRequest(`https://renderer.internal${pathname}`))

            expect(response.status, pathname).toBe(200)
            expect(response.headers.get('x-robots-tag'), pathname).toBe('noindex, nofollow, noarchive')
            expect(response.headers.get('cache-control'), pathname).toBe('private, no-store')
        }
    })

    it('keeps the whole cohort dark while the deployment has not claimed the flag', () => {
        for (const runtimeValue of [undefined, 'false']) {
            vi.stubEnv('SEO_INDEXABLE', runtimeValue)

            for (const pathname of guidePaths) {
                const response = proxy(new NextRequest(`https://renderer.internal${pathname}`))
                expect(response.headers.get('x-robots-tag'), `${runtimeValue} ${pathname}`).toBe(
                    'noindex, nofollow, noarchive'
                )
            }
        }
    })
})
