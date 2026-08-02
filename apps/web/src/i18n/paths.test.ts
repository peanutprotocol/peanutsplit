import { describe, expect, it } from 'vitest'
import {
    hreflangAlternates,
    localeFromPathname,
    localeFromPrefix,
    localePrefix,
    localizedPath,
    PREFIXED_LOCALES,
} from './paths'
import { HREFLANG, LOCALES } from './locales'

describe('locale codes', () => {
    /**
     * The filename/path spelling. Every locale file on disk and every URL segment is named from
     * this list, so a capital letter here is a 404 waiting for whoever types the link by hand.
     */
    it('spells every code in lowercase BCP 47', () => {
        for (const locale of LOCALES) {
            expect(locale).toBe(locale.toLowerCase())
            expect(locale).toMatch(/^[a-z]{2}(?:-[a-z0-9]+)?$/)
        }
    })

    it('gives every locale exactly one hreflang value, and no two share it', () => {
        expect(Object.keys(HREFLANG).sort()).toEqual([...LOCALES].sort())
        expect(new Set(Object.values(HREFLANG)).size).toBe(LOCALES.length)
    })

    /** The map only ever changes case — a value that renamed the locale would be a second list. */
    it('differs from the code by casing alone', () => {
        for (const locale of LOCALES) {
            expect(HREFLANG[locale].toLowerCase()).toBe(locale)
        }
    })
})

describe('locale prefixes', () => {
    it('leaves English bare and prefixes the rest', () => {
        expect(localePrefix('en')).toBe('')
        expect(localePrefix('es-419')).toBe('/es-419')
        expect(localePrefix('pt-br')).toBe('/pt-br')
    })

    it('keeps a locale to exactly one path segment', () => {
        // `es-419`, never `es/419`: `[page]` sits at the root, so a two-segment prefix would
        // occupy the position `/[page]/[something]` needs.
        for (const locale of PREFIXED_LOCALES) {
            expect(localePrefix(locale).split('/').filter(Boolean)).toHaveLength(1)
        }
    })

    it('spells the URL segment exactly as the locale code, lowercase', () => {
        expect(localizedPath('/blog', 'pt-br')).toBe('/pt-br/blog')
        expect(localizedPath('/blog', 'es-419')).toBe('/es-419/blog')
        // Tolerant on the way in, because a hand-typed link gets the casing wrong.
        expect(localeFromPrefix('pt-br')).toBe('pt-br')
        expect(localeFromPrefix('PT-BR')).toBe('pt-br')
        expect(localeFromPrefix('ES-419')).toBe('es-419')
    })

    it('does not treat English as a prefix', () => {
        expect(localeFromPrefix('en')).toBeNull()
        expect(localeFromPrefix('blog')).toBeNull()
        expect(PREFIXED_LOCALES).toEqual(['es-419', 'pt-br'])
    })

    /** The bare `es` that shipped before the codes carried a territory is not a locale now. */
    it('does not answer to the old prefix', () => {
        expect(localeFromPrefix('es')).toBeNull()
        expect(localeFromPrefix('pt')).toBeNull()
    })

    it('never emits a double slash for the root path', () => {
        expect(localizedPath('/', 'en')).toBe('/')
        expect(localizedPath('/', 'es-419')).toBe('/es-419')
    })
})

describe('the language a URL states', () => {
    it('reads the prefix on the translated pages', () => {
        expect(localeFromPathname('/es-419/blog')).toBe('es-419')
        expect(localeFromPathname('/pt-br/blog/split-expenses-across-currencies')).toBe('pt-br')
        expect(localeFromPathname('/es-419/tricount-alternative')).toBe('es-419')
    })

    /** The regression this exists for: an English URL opened with a stale `ps-locale=pt-br`. */
    it('reads every other indexed page as English rather than as unknown', () => {
        expect(localeFromPathname('/tricount-alternative')).toBe('en')
        expect(localeFromPathname('/blog')).toBe('en')
        expect(localeFromPathname('/blog/who-pays-for-the-wine')).toBe('en')
        expect(localeFromPathname('/tools')).toBe('en')
        expect(localeFromPathname('/splitwise-alternative')).toBe('en')
    })

    it('states nothing for the app shell, where the cookie answers', () => {
        expect(localeFromPathname('/')).toBeNull()
        expect(localeFromPathname('/app')).toBeNull()
        expect(localeFromPathname('/new')).toBeNull()
        expect(localeFromPathname('/r/loud-otter-42')).toBeNull()
        expect(localeFromPathname('/r/loud-otter-42/recap')).toBeNull()
        expect(localeFromPathname('/share-target')).toBeNull()
    })
})

describe('hreflang', () => {
    it('lists only the languages a page actually has', () => {
        expect(hreflangAlternates('/blog/x', ['en', 'es-419'])).toEqual({
            en: '/blog/x',
            'es-419': '/es-419/blog/x',
            'x-default': '/blog/x',
        })
    })

    /**
     * The two spellings of a locale, in the one place they are both visible. `pt-br` is the code,
     * the filename and the URL segment; `pt-BR` is the hreflang value. Getting this backwards
     * produces markup that validates and reads wrong, so it is pinned rather than described.
     */
    it('writes the hreflang value in standard BCP 47 casing', () => {
        const languages = hreflangAlternates('/blog/x', ['en', 'pt-br'])!
        expect(Object.keys(languages)).toEqual(['en', 'pt-BR', 'x-default'])
        expect(languages['pt-BR']).toBe('/pt-br/blog/x')
        expect(languages).not.toHaveProperty('pt-br')
    })

    /** `es-419` is already standard casing — the numeric region must survive untouched. */
    it('leaves a numeric region alone', () => {
        const languages = hreflangAlternates('/blog/x', ['en', 'es-419'])!
        expect(languages).toHaveProperty('es-419')
        expect(languages).not.toHaveProperty('es-419'.toUpperCase())
    })

    /**
     * Mutuality: whichever page is being rendered, the set it advertises is the same set. hreflang
     * is only honoured when every variant points at every other one, so a map that varied by the
     * page it sits on would be silently ignored by Google.
     */
    it('advertises the same set from every variant of a page', () => {
        const available = ['en', 'es-419', 'pt-br'] as const
        const sets = available.map(() => hreflangAlternates('/tricount-alternative', [...available]))
        for (const set of sets) expect(set).toEqual(sets[0])
        expect(sets[0]).toEqual({
            en: '/tricount-alternative',
            'es-419': '/es-419/tricount-alternative',
            'pt-BR': '/pt-br/tricount-alternative',
            'x-default': '/tricount-alternative',
        })
    })

    /** A lone self-referential hreflang offers no choice; Google ignores it and we skip it. */
    it('returns nothing when there is no alternative to offer', () => {
        expect(hreflangAlternates('/blog/x', ['en'])).toBeUndefined()
        expect(hreflangAlternates('/blog/x', [])).toBeUndefined()
    })

    it('omits x-default when English is not one of the translations', () => {
        const languages = hreflangAlternates('/blog/x', ['es-419', 'pt-br'])
        expect(languages).toEqual({ 'es-419': '/es-419/blog/x', 'pt-BR': '/pt-br/blog/x' })
        expect(languages).not.toHaveProperty('x-default')
    })

    /** x-default is the English URL, never a locale-prefixed one. */
    it('points x-default at the bare English URL', () => {
        expect(hreflangAlternates('/blog/x', ['en', 'es-419', 'pt-br'])!['x-default']).toBe('/blog/x')
        expect(hreflangAlternates('/', ['en', 'es-419'])!['x-default']).toBe('/')
    })

    it('points every language at a distinct URL', () => {
        const languages = hreflangAlternates('/tricount-alternative', ['en', 'es-419', 'pt-br'])!
        // x-default duplicates English by design; the three language entries must not collide.
        const byLanguage = Object.entries(languages).filter(([lang]) => lang !== 'x-default')
        expect(new Set(byLanguage.map(([, url]) => url)).size).toBe(byLanguage.length)
    })
})
