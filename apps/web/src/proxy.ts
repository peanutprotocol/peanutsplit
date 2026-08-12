import { NextResponse, type NextRequest } from 'next/server'
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE_SECONDS } from '@/i18n/locales'
import { LOCALE_HEADER, localeFromPathname } from '@/i18n/paths'
import { canonicalRedirect } from '@/lib/canonical-redirect'
import { localeFromNewRoomHandoff } from '@/lib/locale-handoff'
import { splitContentHasIndexablePath, splitContentIndexable } from '@/lib/split-content/indexability'
import { splitContentManifestSha256 } from '@/lib/split-content/manifest-attestation'
import { SPLIT_EDGE_MARKER_SHA256 } from '@/lib/split-content/marker-release'
import {
    SPLIT_CONTENT_INDEX_RENDER_HEADER,
    SPLIT_CONTENT_RENDER_HEADER,
    classifySplitTransport,
    hasSplitMarker,
    inspectSplitTransport,
    sanitizedSplitTransportHeaders,
    scrubSplitControlHeaders,
    splitTransportResponseHeaders,
} from '@/lib/split-content/transport'

function applySplitDiagnostics(response: NextResponse, diagnostics: Headers): NextResponse {
    for (const [name, value] of diagnostics) response.headers.set(name, value)
    return response
}

// A deployment's generated artifact is immutable. Hash it once from the same raw bytes the loader
// consumes; a missing artifact leaves every edge-origin claim fail-closed.
const DEPLOYED_SPLIT_CONTENT_MANIFEST_SHA256 = splitContentManifestSha256()

export function splitTransportResponse(
    request: NextRequest,
    expectedMarkerDigest: string = SPLIT_EDGE_MARKER_SHA256,
    expectedManifestDigest: string | null = DEPLOYED_SPLIT_CONTENT_MANIFEST_SHA256
): NextResponse | null {
    const route = classifySplitTransport(request.nextUrl.pathname)
    if (route.action === 'pass') return null
    if (route.action === 'not-found') {
        return new NextResponse(null, {
            status: 404,
            headers: { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow, noarchive' },
        })
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new NextResponse(null, {
            status: 405,
            headers: {
                allow: 'GET, HEAD',
                'cache-control': 'private, no-store',
                'x-robots-tag': 'noindex, nofollow, noarchive',
            },
        })
    }

    // The global prefix also serves the direct Split product and installed PWA. Their public,
    // content-hashed chunks carry no edge marker. Any explicit marker is an edge-origin claim and
    // must validate; this preserves direct PWA assets without letting a forged forward through.
    if (route.kind === 'asset' && !hasSplitMarker(request.headers)) {
        return NextResponse.next({ request: { headers: scrubSplitControlHeaders(request.headers) } })
    }

    const diagnostics = inspectSplitTransport(route.kind, request.headers, expectedMarkerDigest, expectedManifestDigest)
    const indexable =
        route.kind === 'content'
            ? splitContentIndexable(request.nextUrl.pathname, diagnostics.indexReleased)
            : route.kind === 'sitemap'
              ? splitContentHasIndexablePath(diagnostics.indexReleased)
              : false
    const responseHeaders = splitTransportResponseHeaders(diagnostics, indexable)
    if (!diagnostics.releaseValid) {
        responseHeaders.set('x-robots-tag', 'noindex, nofollow, noarchive')
        return applySplitDiagnostics(new NextResponse(null, { status: 404 }), responseHeaders)
    }

    const forwarded = sanitizedSplitTransportHeaders(request.headers)
    forwarded.set(SPLIT_CONTENT_INDEX_RENDER_HEADER, diagnostics.indexReleased ? '1' : '0')
    if (route.kind === 'content') {
        forwarded.set(LOCALE_HEADER, route.locale)
        forwarded.set(SPLIT_CONTENT_RENDER_HEADER, '1')
    }
    return applySplitDiagnostics(NextResponse.next({ request: { headers: forwarded } }), responseHeaders)
}

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
 * their cookie-decided locale. The sole handoff is `/new?locale=…`: a peanut.me guide cannot
 * share this host's cookie, so its canonical locale is applied to the first paint and persisted
 * for the room-creation POST. `/app` is the operational home; `/` remains cookie-localized public
 * marketing.
 */
export function proxy(request: NextRequest) {
    // Every public alias is compatibility-only. Canonicalise it before the dark content
    // transport can render anything, so app, PWA and SEO have one public origin.
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? ''
    const redirect = canonicalRedirect(host, request.nextUrl.pathname, request.nextUrl.search)
    if (redirect) return NextResponse.redirect(redirect.target, redirect.status)

    // The generated-content renderer remains fail-closed until its deferred publishing
    // project is deliberately retargeted to peanutsplit.com.
    const transport = splitTransportResponse(request)
    if (transport) return transport

    // API requests are matched only so requests to an alias can be canonicalised above.
    // On the canonical host they must remain untouched: creation locale and request-origin
    // checks belong to the API handlers themselves.
    if (request.nextUrl.pathname.startsWith('/api/')) return NextResponse.next()

    // External release controls are meaningful only inside the authenticated transport branch
    // above. Scrub them from every other request before React sees any caller-controlled value.
    const forwarded = scrubSplitControlHeaders(request.headers)
    const handoffLocale = localeFromNewRoomHandoff(request.nextUrl.pathname, request.nextUrl.searchParams)
    const locale = handoffLocale ?? localeFromPathname(request.nextUrl.pathname)
    if (!locale) return NextResponse.next({ request: { headers: forwarded } })

    forwarded.set(LOCALE_HEADER, locale)
    const response = NextResponse.next({ request: { headers: forwarded } })

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
        '/split-sitemap.xml/:path*',
        // Next metadata and worker routes contain dots, so the broad matcher excludes them.
        '/sitemap.xml',
        '/robots.txt',
        '/manifest.webmanifest',
        '/sw.js',
        '/favicon.ico',
        '/icon.png',
        '/icons/:path*',
        '/:locale/split/:path*',
        '/split/:path*',
        '/((?!api/|_next/|split-static/|split-sitemap\\.xml|.*\\.).*)',
    ],
}
