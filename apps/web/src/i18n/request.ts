/**
 * next-intl's per-request configuration, wired WITHOUT its routing middleware.
 *
 * Split has no `[locale]` URL segment and never will: a room link is the product, and a link
 * that carries a language is a link that arrives in the wrong one when it is forwarded. So the
 * locale is a cookie, resolved here, on the server, before anything renders — which is also what
 * keeps the first paint from flashing English at a Spanish reader.
 *
 * Resolution order: `ps-locale` cookie → `Accept-Language` → `en`.
 */

import { cookies, headers } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, localeFromAcceptLanguage, type Locale } from './locales'
import { loadMessages } from './messages'

async function resolveLocale(): Promise<Locale> {
    const stored = (await cookies()).get(LOCALE_COOKIE)?.value
    // A hand-edited or stale cookie ("fr", "es-ES") must not be trusted into a failed import.
    if (isLocale(stored)) return stored

    const accept = (await headers()).get('accept-language')
    return localeFromAcceptLanguage(accept) ?? DEFAULT_LOCALE
}

export default getRequestConfig(async () => {
    const locale = await resolveLocale()
    return {
        locale,
        // One catalog. next-intl does not preload a fallback and neither do we.
        messages: await loadMessages(locale),
        /**
         * There is deliberately no English fallback catalog here: merging one in would mean
         * loading two catalogs on every non-English request, which is exactly the regression the
         * lazy loader exists to avoid. A key missing from `es` therefore renders as its own key
         * path — which looks fine in dev and ships silently, so `pnpm i18n:audit` is the real
         * gate and runs in CI. This hook only stops one bad key from filling production logs.
         */
        onError: (error) => {
            if (process.env.NODE_ENV === 'development') console.warn('[split] i18n', error.message)
        },
    }
})
