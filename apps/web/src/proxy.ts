import { NextResponse, type NextRequest } from 'next/server'
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE_SECONDS } from '@/i18n/locales'
import { LOCALE_HEADER, localeFromPathname } from '@/i18n/paths'
import { cutoverRedirect } from '@/lib/cutover-redirects'
import { localeFromNewRoomHandoff } from '@/lib/locale-handoff'
import { splitContentIndexable } from '@/lib/split-content/indexability'
import { SPLIT_EDGE_MARKER_SHA256 } from '@/lib/split-content/marker-release'
import {
    SPLIT_CONTENT_RENDER_HEADER,
    classifySplitTransport,
    hasSplitMarker,
    inspectSplitTransport,
    sanitizedSplitTransportHeaders,
    splitTransportResponseHeaders,
} from '@/lib/split-content/transport'

function applySplitDiagnostics(response: NextResponse, diagnostics: Headers): NextResponse {
    for (const [name, value] of diagnostics) response.headers.set(name, value)
    return response
}

export function splitTransportResponse(
    request: NextRequest,
    expectedMarkerDigest: string = SPLIT_EDGE_MARKER_SHA256
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

    const diagnostics = inspectSplitTransport(route.kind, request.headers, expectedMarkerDigest)

    // The global prefix also serves the direct Split product and installed PWA. Their public,
    // content-hashed chunks carry no edge marker. Any explicit marker is an edge-origin claim and
    // must validate; this preserves direct PWA assets without letting a forged forward through.
    if (route.kind === 'asset' && !hasSplitMarker(request.headers)) return NextResponse.next()

    const responseHeaders = splitTransportResponseHeaders(diagnostics, splitContentIndexable())
    if (!diagnostics.markerValid) {
        responseHeaders.set('x-robots-tag', 'noindex, nofollow, noarchive')
        return applySplitDiagnostics(new NextResponse(null, { status: 404 }), responseHeaders)
    }

    const forwarded = sanitizedSplitTransportHeaders(request.headers)
    if (route.kind === 'content') {
        forwarded.set(LOCALE_HEADER, route.locale)
        forwarded.set(SPLIT_CONTENT_RENDER_HEADER, '1')
    }
    return applySplitDiagnostics(NextResponse.next({ request: { headers: forwarded } }), responseHeaders)
}

/**
 * Tells the server what language a URL is in. It does not route or rewrite anything.
 * (The domain-cutover redirect runs first, and `/new?locale=…` persists a guide CTA's locale.)
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
    // Renderer transport and the negative namespace firewall run before the legacy host cutover.
    // Otherwise canonical-host content requests bounce to peanutsplit.com before React can render.
    const transport = splitTransportResponse(request)
    if (transport) return transport

    // Domain cutover (2026-08): app paths live on split.peanut.me, marketing stays on
    // peanutsplit.com, and each host bounces the other's half across. The decision
    // table is `lib/cutover-redirects.ts` — pure, unit-tested, inert off-production.
    // The served hostname comes from the forwarded Host header, because behind the
    // standalone container `request.url`'s origin is `0.0.0.0:3000` (the trap
    // `api/share-target` documents); targets are built from `lib/domains.ts` literals,
    // never from the request.
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? ''
    const redirect = cutoverRedirect(host, request.nextUrl.pathname, request.nextUrl.search)
    if (redirect) return NextResponse.redirect(redirect.target, redirect.status)

    const handoffLocale = localeFromNewRoomHandoff(request.nextUrl.pathname, request.nextUrl.searchParams)
    const locale = handoffLocale ?? localeFromPathname(request.nextUrl.pathname)
    if (!locale) return NextResponse.next()

    const headers = new Headers(request.headers)
    headers.set(LOCALE_HEADER, locale)
    const response = NextResponse.next({ request: { headers } })

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
    // Pages only: no API routes, no Next internals, nothing with a file extension (`sw.js`,
    // `robots.txt`, `icon.png`). `/api/*` stays excluded on purpose so `server/locale.ts`'s
    // `creationLocale()` keeps stamping a new room with the creator's cookie language. A valid
    // `/new?locale=…` handoff sets that cookie on the page response before the POST occurs.
    matcher: [
        '/split-static/:path*',
        '/split-sitemap.xml/:path*',
        // Next metadata routes contain dots, so the broad page matcher below excludes them.
        // Include the two discovery files explicitly: on split.peanut.me they are marketing and
        // must 302 to the 200 legacy host instead of becoming a second discovery surface.
        '/sitemap.xml',
        '/robots.txt',
        '/:locale/split/:path*',
        '/split/:path*',
        '/((?!api/|_next/|split-static/|split-sitemap\\.xml|.*\\.).*)',
    ],
}
