import { NextResponse, type NextRequest } from 'next/server'
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE_SECONDS } from '@/i18n/locales'
import { LOCALE_HEADER, localeFromPathname } from '@/i18n/paths'
import { cutoverRedirect } from '@/lib/cutover-redirects'
import { localeFromNewRoomHandoff } from '@/lib/locale-handoff'

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
    matcher: ['/((?!api/|_next/|.*\\.).*)'],
}
