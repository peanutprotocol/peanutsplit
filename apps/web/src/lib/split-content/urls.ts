import { localeFromPrefix, localizedPath } from '@/i18n/paths'
import { DEFAULT_LOCALE, type Locale } from '@/i18n/locales'

/**
 * Split is standalone: app, PWA and generated content all answer on `peanutsplit.com`. There is no
 * env seam between a product origin and a content origin, because there is no second host to point
 * either half at. So these builders return paths, and the one place that needs an absolute URL —
 * page metadata — gets it from `absoluteUrl` in `@/lib/seo`.
 */

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** `/guides/<slug>` in English, `/<locale>/guides/<slug>` otherwise. */
const GUIDE_PATH = /^(?:\/([a-z0-9-]+))?\/guides\/([a-z0-9]+(?:-[a-z0-9]+)*)$/

export function guidePath(locale: Locale, slug: string): string {
    if (!SLUG.test(slug)) throw new Error(`invalid Split content slug: ${slug}`)
    return localizedPath(`/guides/${slug}`, locale)
}

/**
 * The inverse of `guidePath`: the locale a guide URL states, or null when the path is not one.
 * The proxy uses it to decide which requests carry the content response headers.
 */
export function splitGuideLocale(pathname: string): Locale | null {
    const match = GUIDE_PATH.exec(pathname)
    if (!match) return null
    const prefix = match[1]
    if (prefix === undefined) return DEFAULT_LOCALE
    return localeFromPrefix(prefix)
}

export function splitHubPath(locale: Locale): string {
    return `/${locale}/split`
}

export function splitToolsHubPath(): string {
    return '/en/split/tools'
}

export function splitCalculatorPath(slug: string): string {
    if (!SLUG.test(slug)) throw new Error(`invalid Split calculator slug: ${slug}`)
    return `${splitToolsHubPath()}/${slug}`
}
