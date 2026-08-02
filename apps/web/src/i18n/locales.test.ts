import { describe, expect, it } from 'vitest'
import { localeFromAcceptLanguage, localeFromLanguageTag, localeFromStoredPreference } from './locales'

describe('localeFromLanguageTag', () => {
    it('maps supported language families to the shipped catalog', () => {
        expect(localeFromLanguageTag('en-GB')).toBe('en')
        expect(localeFromLanguageTag('es-MX')).toBe('es-419')
        expect(localeFromLanguageTag('pt-BR')).toBe('pt-br')
        expect(localeFromLanguageTag('pt-PT')).toBe('pt-br')
    })

    it('does not invent support for another language', () => {
        expect(localeFromLanguageTag('fr-FR')).toBeNull()
        expect(localeFromLanguageTag('')).toBeNull()
    })
})

describe('localeFromAcceptLanguage', () => {
    it('uses the highest-ranked supported language', () => {
        expect(localeFromAcceptLanguage('fr-FR,es-MX;q=0.8,en;q=0.5')).toBe('es-419')
        expect(localeFromAcceptLanguage('en;q=0.4,pt-BR;q=0.9')).toBe('pt-br')
    })

    it('ignores disabled and malformed choices', () => {
        expect(localeFromAcceptLanguage('es;q=0,en;q=0.7')).toBe('en')
        expect(localeFromAcceptLanguage('es;q=nope')).toBeNull()
        expect(localeFromAcceptLanguage(null)).toBeNull()
    })
})

describe('localeFromStoredPreference', () => {
    it('keeps canonical values and migrates deployed legacy values', () => {
        expect(localeFromStoredPreference('en')).toBe('en')
        expect(localeFromStoredPreference('es-419')).toBe('es-419')
        expect(localeFromStoredPreference('pt-br')).toBe('pt-br')
        expect(localeFromStoredPreference('es')).toBe('es-419')
        expect(localeFromStoredPreference('pt-BR')).toBe('pt-br')
    })

    it('rejects arbitrary cookie values', () => {
        expect(localeFromStoredPreference('es-ES')).toBeNull()
        expect(localeFromStoredPreference('fr')).toBeNull()
        expect(localeFromStoredPreference(undefined)).toBeNull()
    })
})
