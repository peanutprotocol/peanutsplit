/**
 * Resolve the explicit locale carried by a peanut.me guide CTA into the room
 * creator. This is intentionally narrower than general query-string locale
 * routing: only `/new` accepts the handoff, and only canonical shipped locale
 * codes are trusted.
 */

import { isLocale, type Locale } from '@/i18n/locales'

export function localeFromNewRoomHandoff(pathname: string, searchParams: Pick<URLSearchParams, 'get'>): Locale | null {
    if (pathname !== '/new') return null

    const locale = searchParams.get('locale')
    return isLocale(locale) ? locale : null
}
