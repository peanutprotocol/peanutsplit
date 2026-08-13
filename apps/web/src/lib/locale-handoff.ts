/**
 * Resolve the explicit locale carried by a guide CTA into the room creator. A guide states its
 * language in its URL while `/new` reads a cookie, so a reader arriving from a Spanish guide with
 * an English cookie would otherwise create a room in the wrong language. This is intentionally
 * narrower than general query-string locale routing: only `/new` accepts the handoff, and only
 * canonical shipped locale codes are trusted.
 */

import { isLocale, type Locale } from '@/i18n/locales'

export function localeFromNewRoomHandoff(pathname: string, searchParams: Pick<URLSearchParams, 'get'>): Locale | null {
    if (pathname !== '/new') return null

    const locale = searchParams.get('locale')
    return isLocale(locale) ? locale : null
}
