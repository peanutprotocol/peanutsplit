import { NextResponse, type NextRequest } from 'next/server'
import { LOCALE_HEADER, localeFromPathname } from '@/i18n/paths'

/**
 * Tells the server what language a URL is in. It does not route, redirect or rewrite anything.
 *
 * The indexed pages live under `/es-419/…`, `/pt-br/…`, and the English originals they translate. Every
 * server component on them — the footer, the locale switcher, anything on `useTranslations` —
 * resolves its language through next-intl's request config. That config runs once per request and
 * is resolved by the root layout, which renders *before* the page: by the time a page could call
 * `setRequestLocale`, the locale is already decided. The only place early enough to say "this URL
 * is Spanish" — or English — is here.
 *
 * `localeFromPathname` is the whole reason this is acceptable next to the no-middleware rule in
 * `request.ts`. It returns null for the app shell, so `/`, `/new`, `/r/*` and `/share-target` fall
 * through untouched and keep their cookie-decided locale. WHICH pages get a header is that
 * function's call, not the matcher's — one rule, one place.
 */
export function middleware(request: NextRequest) {
    const locale = localeFromPathname(request.nextUrl.pathname)
    if (!locale) return NextResponse.next()

    const headers = new Headers(request.headers)
    headers.set(LOCALE_HEADER, locale)
    return NextResponse.next({ request: { headers } })
}

export const config = {
    // Pages only: no API routes, no Next internals, nothing with a file extension (`sw.js`,
    // `robots.txt`, `icon.png`). `/api/*` stays excluded on purpose so `server/locale.ts`'s
    // `creationLocale()` keeps stamping a new room with the creator's cookie language.
    matcher: ['/((?!api/|_next/|.*\\.).*)'],
}
