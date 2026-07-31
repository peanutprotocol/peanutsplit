import { DEFAULT_LOCALE, LOCALES, type Locale } from './locales'

/**
 * URL locale prefixes — for indexed pages only.
 *
 * Split resolves locale from a cookie and has no `[locale]` segment, deliberately: a room link is
 * the product, and a link carrying a language arrives in the wrong one when it is forwarded (see
 * `request.ts`). That reasoning holds for `/r/*` and the app. It does not hold for pages we want
 * in a search index, because a search engine needs one URL per language — a single URL that
 * serves three languages off a cookie gets crawled once, in whichever language the crawler
 * happened to be served, and the other two are invisible. That is why the marketing pages were
 * English-only until now.
 *
 * So the rule is split by purpose, not by preference:
 *   - rooms, `/new`, the app shell → one URL, cookie decides. Unchanged.
 *   - guides and comparison pages → one URL per locale, path decides.
 *
 * English keeps the bare paths it already ranks on (`/blog`, `/tricount-alternative`). Moving it
 * to `/en/…` would retire live URLs to buy nothing.
 */

/**
 * Lowercase, because a path segment is compared byte-for-byte and `pt-BR` in a URL is a
 * capitalisation someone will get wrong in a link. The locale keeps its BCP 47 casing everywhere
 * else — this map is the only place the two spellings meet.
 */
const PREFIX_BY_LOCALE: Record<Locale, string> = {
    en: '',
    es: 'es',
    'pt-BR': 'pt-br',
}

const LOCALE_BY_PREFIX = new Map<string, Locale>(
    LOCALES.filter((locale) => locale !== DEFAULT_LOCALE).map((locale) => [PREFIX_BY_LOCALE[locale], locale])
)

/**
 * How `middleware.ts` tells `request.ts` what language a URL is in. It lives here rather than in
 * the middleware so the server config does not have to import an edge-runtime module to read one
 * string. Not a public contract — nothing outside those two files should reference it.
 */
export const LOCALE_HEADER = 'x-split-locale'

/** Locales that live under a path prefix — everything except the default. */
export const PREFIXED_LOCALES = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE)

/** `es` → `/es`, `en` → `` (English is unprefixed). */
export function localePrefix(locale: Locale): string {
    const prefix = PREFIX_BY_LOCALE[locale]
    return prefix ? `/${prefix}` : ''
}

/** `'pt-br'` → `'pt-BR'`. Returns null for anything that is not a locale prefix. */
export function localeFromPrefix(prefix: string): Locale | null {
    return LOCALE_BY_PREFIX.get(prefix.toLowerCase()) ?? null
}

/**
 * The app shell, by first path segment — the pages that answer at ONE URL in every language. `/`
 * is the fourth of them and falls out of the empty-segment check below, for the same reason
 * `localizedPath` refuses to prefix it: the landing is the app's front door, not one side of a
 * translation set.
 *
 * Written as what the cookie still owns rather than as what the URL pins, because the indexed
 * side is dynamic — `/[page]` and `/blog/[slug]` grow with every markdown file — while this set
 * is the top level of `src/app/` minus the route handlers.
 */
const COOKIE_LOCALE_SEGMENTS = new Set(['new', 'r', 'share-target'])

/**
 * The language a URL states, or null when it states none and the cookie decides.
 *
 * Unprefixed is English, not "unknown". `/tricount-alternative` is the canonical ENGLISH URL of
 * that page as firmly as `/es/tricount-alternative` is the Spanish one, so it has to render
 * English chrome and declare `lang="en"` even for a reader carrying a `ps-locale=pt-BR` cookie
 * picked up from a Portuguese guide. Letting the cookie answer there wrapped English articles in
 * Portuguese furniture and told screen readers and crawlers the wrong language.
 */
export function localeFromPathname(pathname: string): Locale | null {
    const [, first = ''] = pathname.split('/')
    if (first === '' || COOKIE_LOCALE_SEGMENTS.has(first)) return null
    return localeFromPrefix(first) ?? DEFAULT_LOCALE
}

/**
 * Prefix a root-relative path for a locale. `/blog/x` + `es` → `/es/blog/x`, and the same path
 * in `en` comes back untouched.
 *
 * Only ever point this at a path that HAS a locale-prefixed route — the guides hub, the articles,
 * the comparison pages. The app shell (`/`, `/new`, `/r/*`) answers at one URL by design, so
 * prefixing one of those produces a URL nothing serves: `/es` and `/es/new` both shipped as live
 * 404s, linked from every Spanish page's breadcrumb and the Spanish hub's only CTA.
 */
export function localizedPath(path: string, locale: Locale): string {
    if (locale === DEFAULT_LOCALE) return path
    return `${localePrefix(locale)}${path === '/' ? '' : path}`
}

/**
 * hreflang map for one page, given the locales it actually exists in.
 *
 * Only real translations are listed. Advertising `/es/blog/x` for a page that has no Spanish
 * file would either 404 the crawler or — worse, if we fell back to English — put the same English
 * text at two URLs and let Google pick which to drop. A partially translated site is normal; a
 * partially translated site that lies about it is a ranking problem.
 *
 * `x-default` points at English, which is the page a reader with no matching language should get.
 */
export function hreflangAlternates(path: string, available: Locale[]): Record<string, string> | undefined {
    // One language is not a set of alternates — emitting a lone self-referential hreflang is
    // noise, and Google ignores a map that does not offer a choice.
    if (available.length < 2) return undefined

    const languages: Record<string, string> = {}
    for (const locale of available) {
        // The locale IS the hreflang value: both are BCP 47, and Google matches
        // them case-insensitively. Only the URL prefix has its own spelling.
        languages[locale] = localizedPath(path, locale)
    }
    if (available.includes(DEFAULT_LOCALE)) {
        languages['x-default'] = localizedPath(path, DEFAULT_LOCALE)
    }
    return languages
}
