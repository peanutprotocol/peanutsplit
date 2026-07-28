/**
 * next-intl's per-request configuration, wired WITHOUT its routing middleware.
 *
 * The app has no `[locale]` URL segment: a room link is the product, and a link that carries a
 * language is a link that arrives in the wrong one when it is forwarded. So the locale is a
 * cookie, resolved here, on the server, before anything renders — which is also what keeps the
 * first paint from flashing English at a Spanish reader.
 *
 * The **indexed** pages are the exception. A guide at `/es/blog/…` is a distinct URL that exists
 * so a crawler can find the Spanish version; serving it in whatever language a cookie happens to
 * hold would defeat the point and would render Spanish chrome around an English article. When the
 * URL states a language, the URL wins — and because the whole shell reads its strings through this
 * config, the footer and everything else follow with no prop-drilling.
 *
 * The URL arrives as a header set by `middleware.ts`. `setRequestLocale` cannot do it: this config
 * is resolved by the root layout, which renders before any page could call it. The middleware is
 * matcher-scoped to the locale prefixes, so nothing else on the site is affected.
 *
 * `requestLocale` comes first and is NOT optional to honour. next-intl re-invokes this config with
 * it whenever a caller asks for a specific language — `getTranslations({ locale: 'en' })`. Ignoring
 * it meant an explicit English lookup came back in whatever the cookie held, which served a
 * Spanish `<h1>` at the canonical English URL to anyone carrying a Spanish cookie.
 *
 * Resolution order: explicit request → URL header → `ps-locale` cookie → `Accept-Language` → `en`.
 */

import { cookies, headers } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, localeFromAcceptLanguage, type Locale } from './locales'
import { loadMessages } from './messages'
import { LOCALE_HEADER } from './paths'

async function resolveLocale(requested: string | undefined): Promise<Locale> {
    // A caller naming the language it wants. Always wins — see the note above.
    if (isLocale(requested)) return requested

    const requestHeaders = await headers()

    // Only ever set by the middleware, and only for a locale-prefixed path.
    const fromUrl = requestHeaders.get(LOCALE_HEADER)
    if (isLocale(fromUrl)) return fromUrl

    const stored = (await cookies()).get(LOCALE_COOKIE)?.value
    // A hand-edited or stale cookie ("fr", "es-ES") must not be trusted into a failed import.
    if (isLocale(stored)) return stored

    return localeFromAcceptLanguage(requestHeaders.get('accept-language')) ?? DEFAULT_LOCALE
}

export default getRequestConfig(async ({ requestLocale }) => {
    const locale = await resolveLocale(await requestLocale)
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
