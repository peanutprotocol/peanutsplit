import { describe, expect, it } from 'vitest'
import {
    hreflangAlternates,
    localeFromPathname,
    localeFromPrefix,
    localePrefix,
    localizedPath,
    PREFIXED_LOCALES,
} from './paths'

describe('locale prefixes', () => {
    it('leaves English bare and prefixes the rest', () => {
        expect(localePrefix('en')).toBe('')
        expect(localePrefix('es')).toBe('/es')
        expect(localePrefix('pt-BR')).toBe('/pt-br')
    })

    it('lowercases pt-BR in the URL but keeps the locale code intact', () => {
        // The path segment is compared byte-for-byte; the locale keeps its BCP 47 casing.
        expect(localizedPath('/blog', 'pt-BR')).toBe('/pt-br/blog')
        expect(localeFromPrefix('pt-br')).toBe('pt-BR')
        expect(localeFromPrefix('PT-BR')).toBe('pt-BR')
    })

    it('does not treat English as a prefix', () => {
        expect(localeFromPrefix('en')).toBeNull()
        expect(localeFromPrefix('blog')).toBeNull()
        expect(PREFIXED_LOCALES).toEqual(['es', 'pt-BR'])
    })

    it('never emits a double slash for the root path', () => {
        expect(localizedPath('/', 'en')).toBe('/')
        expect(localizedPath('/', 'es')).toBe('/es')
    })
})

describe('the language a URL states', () => {
    it('reads the prefix on the translated pages', () => {
        expect(localeFromPathname('/es/blog')).toBe('es')
        expect(localeFromPathname('/pt-br/blog/split-expenses-across-currencies')).toBe('pt-BR')
        expect(localeFromPathname('/es/tricount-alternative')).toBe('es')
    })

    /** The regression this exists for: an English URL opened with a stale `ps-locale=pt-BR`. */
    it('reads every other indexed page as English rather than as unknown', () => {
        expect(localeFromPathname('/tricount-alternative')).toBe('en')
        expect(localeFromPathname('/blog')).toBe('en')
        expect(localeFromPathname('/blog/who-pays-for-the-wine')).toBe('en')
        expect(localeFromPathname('/tools')).toBe('en')
        expect(localeFromPathname('/splitwise-alternative')).toBe('en')
    })

    it('states nothing for the app shell, where the cookie answers', () => {
        expect(localeFromPathname('/')).toBeNull()
        expect(localeFromPathname('/new')).toBeNull()
        expect(localeFromPathname('/r/loud-otter-42')).toBeNull()
        expect(localeFromPathname('/r/loud-otter-42/recap')).toBeNull()
        expect(localeFromPathname('/share-target')).toBeNull()
    })
})

describe('hreflang', () => {
    it('lists only the languages a page actually has', () => {
        expect(hreflangAlternates('/blog/x', ['en', 'es'])).toEqual({
            en: '/blog/x',
            es: '/es/blog/x',
            'x-default': '/blog/x',
        })
    })

    /** A lone self-referential hreflang offers no choice; Google ignores it and we skip it. */
    it('returns nothing when there is no alternative to offer', () => {
        expect(hreflangAlternates('/blog/x', ['en'])).toBeUndefined()
        expect(hreflangAlternates('/blog/x', [])).toBeUndefined()
    })

    it('omits x-default when English is not one of the translations', () => {
        const languages = hreflangAlternates('/blog/x', ['es', 'pt-BR'])
        expect(languages).toEqual({ es: '/es/blog/x', 'pt-BR': '/pt-br/blog/x' })
        expect(languages).not.toHaveProperty('x-default')
    })

    it('points every language at a distinct URL', () => {
        const languages = hreflangAlternates('/tricount-alternative', ['en', 'es', 'pt-BR'])!
        // x-default duplicates English by design; the three language entries must not collide.
        const byLanguage = Object.entries(languages).filter(([lang]) => lang !== 'x-default')
        expect(new Set(byLanguage.map(([, url]) => url)).size).toBe(byLanguage.length)
    })
})
