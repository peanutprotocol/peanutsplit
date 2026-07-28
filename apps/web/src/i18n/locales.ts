/**
 * The locale set, and nothing else.
 *
 * SPEC locks it to three (`en`, `es` with es-419 tone, `pt-BR`), and four unrelated places need
 * to agree on that list: the request config, the tiny server helper, the switcher, and the audit
 * script. Anything that hardcodes a locale string somewhere else is how a fourth locale ships
 * half-wired.
 *
 * There is deliberately no routing here — no `[locale]` segment, no middleware. The locale is a
 * cookie, resolved server-side, so a room link is one URL in every language.
 */

export const LOCALES = ['en', 'es', 'pt-BR'] as const

export type Locale = (typeof LOCALES)[number]

/** Also the fallback catalog: a key missing from `es` renders its English text, never a bare key. */
export const DEFAULT_LOCALE: Locale = 'en'

/**
 * Read server-side on every request and re-written client-side on every boot. Not `NEXT_LOCALE`
 * (next-intl's routing default) on purpose — nothing here uses next-intl routing, and borrowing
 * its cookie name would imply middleware that does not exist.
 */
export const LOCALE_COOKIE = 'ps-locale'

export const isLocale = (value: unknown): value is Locale => LOCALES.includes(value as Locale)

/**
 * `useLocale()` and `getLocale()` are typed as bare strings. Everything downstream (the
 * catalog map, `Intl.NumberFormat`) wants the union, and one narrowing helper beats a cast at
 * every call site — a cast would happily pass through a locale we have no catalog for.
 */
export const asLocale = (value: string): Locale => (isLocale(value) ? value : DEFAULT_LOCALE)

/**
 * The switcher's own labels are the one thing that must NOT be translated: someone stuck in a
 * language they can't read finds their way out by looking for a word they recognise.
 */
export const LOCALE_LABELS: Record<Locale, string> = {
    en: 'English',
    es: 'Español',
    'pt-BR': 'Português',
}

/**
 * `es-419`, `es-AR`, `pt`, `pt-PT` and friends all have to land somewhere. Matching on the
 * primary subtag is the whole rule — we ship one Spanish and one Portuguese, so a regional tag
 * that isn't ours is still better served by its own language than by English.
 */
export function localeFromLanguageTag(tag: string): Locale | null {
    const normalised = tag.trim().toLowerCase()
    if (normalised.length === 0) return null
    if (normalised === 'pt-br') return 'pt-BR'
    const primary = normalised.split('-')[0]
    if (primary === 'en') return 'en'
    if (primary === 'es') return 'es'
    if (primary === 'pt') return 'pt-BR'
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
