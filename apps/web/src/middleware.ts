import { NextResponse, type NextRequest } from 'next/server'
import { LOCALE_HEADER, localeFromPrefix } from '@/i18n/paths'

/**
 * Tells the server what language a URL is in. It does not route, redirect or rewrite anything.
 *
 * The indexed pages live under `/es/…` and `/pt-br/…`, and every server component on them — the
 * footer, the locale switcher, anything on `useTranslations` — resolves its language through
 * next-intl's request config. That config runs once per request and is resolved by the root
 * layout, which renders *before* the page: by the time a page could call `setRequestLocale`, the
 * locale is already decided. The only place early enough to say "this URL is Spanish" is here.
 *
 * The matcher is the whole reason this is acceptable next to the no-middleware rule in
 * `request.ts`. It runs on locale-prefixed paths and nothing else, so `/r/*`, `/new`, `/api/*`
 * and the app shell never touch it and keep their cookie-decided locale untouched.
 */
export function middleware(request: NextRequest) {
    const [, prefix] = request.nextUrl.pathname.split('/')
    const locale = localeFromPrefix(prefix ?? '')
    if (!locale) return NextResponse.next()

    const headers = new Headers(request.headers)
    headers.set(LOCALE_HEADER, locale)
    return NextResponse.next({ request: { headers } })
}

export const config = {
    matcher: ['/es/:path*', '/pt-br/:path*'],
}
