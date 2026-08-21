import { NextResponse, type NextRequest } from 'next/server'
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE_SECONDS } from '@/i18n/locales'
import { LOCALE_HEADER, localeFromPathname } from '@/i18n/paths'
import { canonicalRedirect } from '@/lib/canonical-redirect'
import { localeFromNewRoomHandoff } from '@/lib/locale-handoff'
import { splitContentIndexable } from '@/lib/split-content/indexability'
import { splitGuideLocale } from '@/lib/split-content/urls'

/**
 * Tells the server what language a URL is in. It does not route or rewrite anything.
 * (The canonical-host redirect runs first, and `/new?locale=…` persists a guide CTA's locale.)
 *
 * The indexed pages live under `/es-419/…`, `/pt-br/…`, and the English originals they translate. Every
 * server component on them — the footer, the locale switcher, anything on `useTranslations` —
 * resolves its language through next-intl's request config. That config runs once per request and
 * is resolved by the root layout, which renders *before* the page: by the time a page could call
 * `setRequestLocale`, the locale is already decided. The only place early enough to say "this URL
 * is Spanish" — or English — is here.
 *
 * `localeFromPathname` is the whole reason this is acceptable next to the no-proxy rule in
 * `request.ts`. It returns null for the app shell, so `/`, `/new`, `/r/*` and `/share-target` keep
 * their cookie-decided locale. The sole handoff is `/new?locale=…`: a guide states its language in
 * its URL and the app shell reads a cookie, so the canonical locale is applied to the first paint
 * and persisted for the room-creation POST. `/app` is the operational home; `/` remains
 * cookie-localized public marketing.
 */
export function proxy(request: NextRequest) {
    // The trailing-slash strip Next no longer applies (`skipTrailingSlashRedirect` in
    // next.config.js). First, where Next's built-in ran, so `/guides/` and friends have
    // already been retired in one hop by the config redirects before reaching here. A
    // doubled slash never matched the built-in either, so it still falls through to 404.
    const { pathname } = request.nextUrl
    if (pathname !== '/' && pathname.endsWith('/') && !pathname.endsWith('//')) {
        return NextResponse.redirect(new URL(pathname.slice(0, -1) + request.nextUrl.search, request.url), 308)
    }

    // Every public alias is compatibility-only. Canonicalise it first, so app, PWA and SEO
    // have one public origin.
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? ''
    const redirect = canonicalRedirect(host, request.nextUrl.pathname, request.nextUrl.search)
    if (redirect) return NextResponse.redirect(redirect.target, redirect.status)

    // Generated guides render like any other public page, but stay out of every index until a
    // human reviews them live and moves the source-controlled release registry. Their locale comes
    // from the ordinary `localeFromPathname` path below — a guide URL states its language.
    const isGuide = splitGuideLocale(request.nextUrl.pathname) !== null

    // API requests are matched only so requests to an alias can be canonicalised above.
    // On the canonical host they must remain untouched: creation locale and request-origin
    // checks belong to the API handlers themselves.
    if (request.nextUrl.pathname.startsWith('/api/')) return NextResponse.next()

    // The locale header is internal state derived here. A caller-supplied value must never
    // survive into the request React sees.
    const forwarded = new Headers(request.headers)
    forwarded.delete(LOCALE_HEADER)
    const handoffLocale = localeFromNewRoomHandoff(request.nextUrl.pathname, request.nextUrl.searchParams)
    const locale = handoffLocale ?? localeFromPathname(request.nextUrl.pathname)
    if (!locale) return NextResponse.next({ request: { headers: forwarded } })

    forwarded.set(LOCALE_HEADER, locale)
    const response = NextResponse.next({ request: { headers: forwarded } })

    if (isGuide && !splitContentIndexable(request.nextUrl.pathname)) {
        response.headers.set('x-robots-tag', 'noindex, nofollow, noarchive')
        response.headers.set('cache-control', 'private, no-store')
    }

    if (handoffLocale) {
        response.cookies.set(LOCALE_COOKIE, handoffLocale, {
            path: '/',
            maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
            sameSite: 'lax',
        })
    }

    return response
}

export const config = {
    // App pages plus the identity-bearing files and API routes. Canonical-host APIs pass
    // through unchanged; matching them only lets the compatibility alias redirect safely.
    matcher: [
        '/api/:path*',
        '/split-static/:path*',
        // Next metadata and worker routes contain dots, so the broad matcher excludes them.
        '/sitemap.xml',
        '/robots.txt',
        '/manifest.webmanifest',
        '/sw.js',
        '/favicon.ico',
        '/icon.png',
        '/icons/:path*',
        '/((?!api/|_next/|split-static/|.*\\.).*)',
        // Dotted paths with a trailing slash (`/sitemap.xml/`) — the broad matcher skips
        // anything with a dot, and the strip above is what redirects these now.
        '/((?!api/|_next/|split-static/).*\\..*)/',
    ],
}
