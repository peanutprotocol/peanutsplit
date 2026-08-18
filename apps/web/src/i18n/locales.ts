/**
 * The locale set, and nothing else.
 *
 * The request config, tiny server helper, switcher, and audit script all need to agree on this
 * list. Anything that hardcodes a private locale set somewhere else is how a new language ships
 * half-wired.
 *
 * There is deliberately no routing here — no `[locale]` segment, no routing proxy. The locale is a
 * cookie, resolved server-side, so a room link is one URL in every language.
 *
 * **Codes are lowercase BCP 47, and that is the only spelling used in a filename or a path.**
 * This is peanut.me's convention (`content/_system/guidelines/locales.md` §1), adopted here so
 * one person can move between the two content trees without re-learning how a locale is spelled.
 * The territory is part of the code — `es-419` (LATAM Spanish), not a bare `es` — because a
 * regional variant added later has to be a sibling of the one that shipped, not a replacement
 * for it. The ONE place the standard casing appears is `HREFLANG`, below.
 */

export const LOCALES = ['en', 'es-419', 'pt-br', 'pl', 'de', 'fr', 'uk'] as const

export type Locale = (typeof LOCALES)[number]

/**
 * Locales with authored, path-addressed marketing content. Product catalogs can ship without an
 * SEO tree; keeping that distinction explicit prevents the sitemap from advertising a translated
 * hub or comparison page that has no route yet.
 */
export const INDEXED_LOCALES = ['en', 'es-419', 'pt-br'] as const satisfies readonly Locale[]
export type IndexedLocale = (typeof INDEXED_LOCALES)[number]
export const isIndexedLocale = (value: unknown): value is IndexedLocale =>
    INDEXED_LOCALES.includes(value as IndexedLocale)

/**
 * The spelling a locale gets in HTML — `hreflang`, `lang`, `inLanguage`.
 *
 * BCP 47 casing, which is not the casing of the code: `pt-br` is the filename and the URL
 * segment, `pt-BR` is what goes in the markup. Google matches hreflang case-insensitively, so
 * this is about being right rather than about being understood, and it is one map rather than a
 * `.toUpperCase()` on the region because `es-419` has a numeric region that must not be touched.
 */
export const HREFLANG: Record<Locale, string> = {
    en: 'en',
    'es-419': 'es-419',
    'pt-br': 'pt-BR',
    pl: 'pl',
    de: 'de',
    fr: 'fr',
    uk: 'uk',
}

/** Default when neither URL, cookie nor browser preferences resolve to a supported locale. */
export const DEFAULT_LOCALE: Locale = 'en'

/**
 * Read server-side on every request and re-written client-side on every boot. Not `NEXT_LOCALE`
 * (next-intl's routing default) on purpose — nothing here uses next-intl routing, and borrowing
 * its cookie name would imply locale-routing machinery that does not exist.
 */
export const LOCALE_COOKIE = 'ps-locale'

/** One year, shared by the server handoff and the client-side preference writer. */
export const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

export const isLocale = (value: unknown): value is Locale => LOCALES.includes(value as Locale)

/**
 * `useLocale()` and `getLocale()` are typed as bare strings. Everything downstream (the
 * catalog map, `Intl.NumberFormat`) wants the union, and one narrowing helper beats a cast at
 * every call site — a cast would happily pass through a locale we have no catalog for.
 *
 * A value that is not one of ours is read as a language tag before English is assumed. That is
 * what keeps `room.locale` honest: the column holds whatever the creator's page rendered in, and
 * the rows written before the codes carried a territory hold `es` and `pt-BR`. Those are correct
 * language tags for the copy that was written, so they resolve to `es-419` and `pt-br` rather
 * than losing a Spanish room its Spanish unfurl. Unsupported tags still land on English.
 */
export const asLocale = (value: string): Locale =>
    isLocale(value) ? value : (localeFromLanguageTag(value) ?? DEFAULT_LOCALE)

/**
 * Accept the canonical cookie values plus the two values shipped by the previous locale set.
 * The provider writes the canonical value after hydration, so this is a one-read migration rather
 * than a permanent second representation.
 */
export function localeFromStoredPreference(value: string | null | undefined): Locale | null {
    if (isLocale(value)) return value
    const normalised = value?.trim().toLowerCase()
    if (normalised === 'es') return 'es-419'
    if (normalised === 'pt-br') return 'pt-br'
    return null
}

/**
 * Switcher labels are endonyms rather than catalog messages: someone stuck in a language they
 * cannot read finds their way out by looking for a language name they recognise.
 */
export const LOCALE_LABELS: Record<Locale, string> = {
    en: 'English',
    'es-419': 'Español',
    'pt-br': 'Português',
    pl: 'Polski',
    de: 'Deutsch',
    fr: 'Français',
    uk: 'Українська',
}

/**
 * `es-AR`, `es-ES`, `pt`, `pt-PT` and friends all have to land somewhere. Matching on the
 * primary subtag is the whole rule — where we ship one language catalog, a regional tag that
 * isn't ours is still better served by its own language than by English. That includes `es-ES`:
 * Peninsular Spanish reading LATAM copy is a register mismatch, English is a language barrier.
 */
export function localeFromLanguageTag(tag: string): Locale | null {
    const normalised = tag.trim().toLowerCase()
    if (normalised.length === 0) return null
    const primary = normalised.split('-')[0]
    if (primary === 'en') return 'en'
    if (primary === 'es') return 'es-419'
    if (primary === 'pt') return 'pt-br'
    if (primary === 'pl') return 'pl'
    if (primary === 'de') return 'de'
    if (primary === 'fr') return 'fr'
    if (primary === 'uk') return 'uk'
    return null
}

/**
 * `Accept-Language: pt-BR,pt;q=0.9,en;q=0.8` → `pt-BR`. Ordered by q-value, highest first, so a
 * browser that ranks English below Portuguese gets Portuguese rather than whichever tag happened
 * to be written first.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
    if (!header) return null
    const ranked = header
        .split(',')
        .map((part) => {
            const [tag, ...params] = part.split(';')
            const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='))
            // A malformed q (`q=abc`) must not sort as NaN and poison the comparison.
            const parsed = q ? Number.parseFloat(q.slice(2)) : 1
            return { tag: tag.trim(), q: Number.isFinite(parsed) ? parsed : 0 }
        })
        .filter((entry) => entry.q > 0)
        .sort((a, b) => b.q - a.q)

    for (const entry of ranked) {
        const locale = localeFromLanguageTag(entry.tag)
        if (locale) return locale
    }
    return null
}
