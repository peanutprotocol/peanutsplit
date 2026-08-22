import { DEFAULT_LOCALE, isIndexedLocale } from '@/i18n/locales'
import { localeFromPathname, localePrefix } from '@/i18n/paths'

/**
 * The shared-cache rule for the indexable marketing pages, set by the proxy.
 *
 * These pages are a function of the URL alone: the locale is in the path, nothing reads a cookie,
 * and Next already varies on the RSC headers. `force-dynamic` and next-intl's `headers()` read
 * make Next answer `private, no-store` for them, which leaves every crawler fetch a full render.
 * Ten minutes shared, an hour of stale-while-revalidate, and `max-age=0` so a browser still
 * revalidates against the ETag after a content push.
 */
export const MARKETING_CACHE_CONTROL = 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600'

const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*'

/**
 * The blog hub and its articles, the calculators hub, and a root-level page (comparison, capture,
 * calculator) with its country pages. Mirrors `(marketing)` in `src/app`.
 */
const MARKETING_SURFACES = new RegExp(`^(?:/blog(?:/${SLUG})?|/tools|/${SLUG}(?:/${SLUG})?)$`)

/**
 * Root segments that sit at a marketing-shaped URL but are not a pure function of it: `/import`
 * reads the locale cookie and `Accept-Language` for the importer it wraps, `/dev-ds` is a noindex
 * design-system surface, and a guide is release-gated per request.
 */
const PER_REQUEST_SEGMENTS = new Set(['import', 'dev-ds', 'guides'])

export function marketingCacheable(pathname: string): boolean {
    const locale = localeFromPathname(pathname)
    if (!locale || !isIndexedLocale(locale)) return false
    const path = locale === DEFAULT_LOCALE ? pathname : pathname.slice(localePrefix(locale).length)
    if (!MARKETING_SURFACES.test(path)) return false
    const [, first = ''] = path.split('/')
    return !PER_REQUEST_SEGMENTS.has(first)
}
