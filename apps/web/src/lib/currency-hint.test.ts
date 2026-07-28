import { describe, expect, it } from 'vitest'
import {
    DEFAULT_HINT_CURRENCY,
    MAX_CURRENCY_HINTS,
    currencyFlag,
    currencyForLanguage,
    currencyForTimeZone,
    rankCurrencyCandidates,
    regionFromLanguageTag,
} from './currency-hint'

/** The ranking is the whole product decision, so it is asserted with explicit fixtures rather
 *  than by reading the table back — a test that re-derives the answer from the same map proves
 *  nothing about the precedence rule. */
const codes = (signals: Parameters<typeof rankCurrencyCandidates>[0]) =>
    rankCurrencyCandidates(signals).map((candidate) => candidate.currency)

describe('regionFromLanguageTag', () => {
    it('reads the region subtag', () => {
        expect(regionFromLanguageTag('pt-BR')).toBe('BR')
        expect(regionFromLanguageTag('es_AR')).toBe('AR')
        expect(regionFromLanguageTag('en-gb')).toBe('GB')
    })

    it('skips a script subtag to find the region', () => {
        expect(regionFromLanguageTag('zh-Hans-CN')).toBe('CN')
        expect(regionFromLanguageTag('sr-Latn-RS')).toBe('RS')
    })

    it('returns the UN M49 code as-is', () => {
        expect(regionFromLanguageTag('es-419')).toBe('419')
    })

    it('returns null when there is no region', () => {
        expect(regionFromLanguageTag('pt')).toBeNull()
        expect(regionFromLanguageTag('')).toBeNull()
    })
})

describe('currencyForLanguage', () => {
    it('maps the regions the catalog covers', () => {
        expect(currencyForLanguage('pt-BR')).toBe('BRL')
        expect(currencyForLanguage('es-AR')).toBe('ARS')
        expect(currencyForLanguage('es-MX')).toBe('MXN')
        expect(currencyForLanguage('es-CO')).toBe('COP')
        expect(currencyForLanguage('de-CH')).toBe('CHF')
        expect(currencyForLanguage('fr-CH')).toBe('CHF')
        expect(currencyForLanguage('en-GB')).toBe('GBP')
        expect(currencyForLanguage('en-AU')).toBe('AUD')
        expect(currencyForLanguage('en-CA')).toBe('CAD')
        expect(currencyForLanguage('fr-CA')).toBe('CAD')
        expect(currencyForLanguage('en-US')).toBe('USD')
        expect(currencyForLanguage('ja-JP')).toBe('JPY')
        expect(currencyForLanguage('th-TH')).toBe('THB')
    })

    it('maps eurozone regions to EUR', () => {
        expect(currencyForLanguage('de-DE')).toBe('EUR')
        expect(currencyForLanguage('fr-FR')).toBe('EUR')
        expect(currencyForLanguage('es-ES')).toBe('EUR')
        expect(currencyForLanguage('pt-PT')).toBe('EUR')
        expect(currencyForLanguage('it-IT')).toBe('EUR')
    })

    it('resolves a bare tag only where the language is one country here', () => {
        expect(currencyForLanguage('ja')).toBe('JPY')
        expect(currencyForLanguage('th')).toBe('THB')
    })

    it('refuses to guess between the Spanish- and Portuguese-speaking currencies', () => {
        expect(currencyForLanguage('es')).toBeNull()
        expect(currencyForLanguage('pt')).toBeNull()
        expect(currencyForLanguage('en')).toBeNull()
    })

    it('returns null for a region the catalog has no currency for', () => {
        // Sweden is in the EU but not the eurozone — SEK is not in the catalog, and proposing
        // euros to a Swede is worse than proposing nothing.
        expect(currencyForLanguage('sv-SE')).toBeNull()
        expect(currencyForLanguage('pl-PL')).toBeNull()
        expect(currencyForLanguage('es-419')).toBeNull()
    })
})

describe('currencyForTimeZone', () => {
    it('maps the zones the catalog covers', () => {
        expect(currencyForTimeZone('America/Argentina/Buenos_Aires')).toBe('ARS')
        expect(currencyForTimeZone('America/Argentina/Cordoba')).toBe('ARS')
        expect(currencyForTimeZone('America/Buenos_Aires')).toBe('ARS')
        expect(currencyForTimeZone('America/Sao_Paulo')).toBe('BRL')
        expect(currencyForTimeZone('America/Manaus')).toBe('BRL')
        expect(currencyForTimeZone('America/Mexico_City')).toBe('MXN')
        expect(currencyForTimeZone('America/Tijuana')).toBe('MXN')
        expect(currencyForTimeZone('America/Bogota')).toBe('COP')
        expect(currencyForTimeZone('Europe/Zurich')).toBe('CHF')
        expect(currencyForTimeZone('Europe/London')).toBe('GBP')
        expect(currencyForTimeZone('Asia/Tokyo')).toBe('JPY')
        expect(currencyForTimeZone('Asia/Bangkok')).toBe('THB')
        expect(currencyForTimeZone('Australia/Sydney')).toBe('AUD')
        expect(currencyForTimeZone('Australia/Perth')).toBe('AUD')
        expect(currencyForTimeZone('America/Toronto')).toBe('CAD')
        expect(currencyForTimeZone('America/Vancouver')).toBe('CAD')
        expect(currencyForTimeZone('America/New_York')).toBe('USD')
        expect(currencyForTimeZone('America/Indiana/Indianapolis')).toBe('USD')
        expect(currencyForTimeZone('Pacific/Honolulu')).toBe('USD')
    })

    it('lets an exact zone beat the Europe catch-all', () => {
        expect(currencyForTimeZone('Europe/London')).toBe('GBP')
        expect(currencyForTimeZone('Europe/Zurich')).toBe('CHF')
        expect(currencyForTimeZone('Europe/Madrid')).toBe('EUR')
        expect(currencyForTimeZone('Europe/Warsaw')).toBe('EUR')
    })

    it('returns null for a zone outside the catalog', () => {
        expect(currencyForTimeZone('America/Lima')).toBeNull()
        expect(currencyForTimeZone('Asia/Kolkata')).toBeNull()
        expect(currencyForTimeZone('UTC')).toBeNull()
        expect(currencyForTimeZone('')).toBeNull()
    })
})

describe('rankCurrencyCandidates', () => {
    it('puts the timezone first when the two signals disagree on country', () => {
        // The case this whole module exists for: a Brazilian phone, standing in Lisbon.
        expect(codes({ timeZone: 'Europe/Lisbon', languages: ['pt-BR', 'pt', 'en'] })).toEqual(['EUR', 'BRL'])
    })

    it('reports why each candidate is there', () => {
        expect(rankCurrencyCandidates({ timeZone: 'Europe/Lisbon', languages: ['pt-BR'] })).toEqual([
            { currency: 'EUR', reason: 'timezone' },
            { currency: 'BRL', reason: 'language' },
        ])
    })

    it('collapses to one candidate when both signals agree', () => {
        expect(rankCurrencyCandidates({ timeZone: 'America/Sao_Paulo', languages: ['pt-BR', 'pt'] })).toEqual([
            { currency: 'BRL', reason: 'timezone' },
        ])
    })

    it('falls back to language when the timezone is unknown or missing', () => {
        expect(codes({ timeZone: 'Asia/Kolkata', languages: ['en-AU'] })).toEqual(['AUD'])
        expect(codes({ timeZone: null, languages: ['es-MX', 'en-US'] })).toEqual(['MXN', 'USD'])
        expect(codes({ languages: ['ja'] })).toEqual(['JPY'])
    })

    it('keeps the browser order of the language list', () => {
        expect(codes({ timeZone: 'UTC', languages: ['en-GB', 'fr-CA', 'ja'] })).toEqual(['GBP', 'CAD', 'JPY'])
    })

    it('caps the list at three', () => {
        const ranked = rankCurrencyCandidates({
            timeZone: 'America/Bogota',
            languages: ['es-AR', 'pt-BR', 'en-GB', 'ja'],
        })
        expect(ranked).toHaveLength(MAX_CURRENCY_HINTS)
        expect(ranked.map((candidate) => candidate.currency)).toEqual(['COP', 'ARS', 'BRL'])
    })

    it('never repeats a currency', () => {
        expect(codes({ timeZone: 'Europe/Madrid', languages: ['es-ES', 'fr-FR', 'de-DE'] })).toEqual(['EUR'])
    })

    it('falls back to the default only when nothing resolved at all', () => {
        expect(rankCurrencyCandidates({ timeZone: 'Asia/Kolkata', languages: ['hi-IN', 'es'] })).toEqual([
            { currency: DEFAULT_HINT_CURRENCY, reason: 'default' },
        ])
        expect(rankCurrencyCandidates({})).toEqual([{ currency: DEFAULT_HINT_CURRENCY, reason: 'default' }])
    })

    it('does not pad a real guess out to three', () => {
        expect(codes({ timeZone: 'Asia/Tokyo', languages: ['ja-JP'] })).toEqual(['JPY'])
    })
})

describe('currencyFlag', () => {
    it('has a flag for every catalog currency, and the union flag for the euro', () => {
        expect(currencyFlag('BRL')).toBe('🇧🇷')
        expect(currencyFlag('brl')).toBe('🇧🇷')
        expect(currencyFlag('EUR')).toBe('🇪🇺')
    })

    it('is empty rather than a placeholder box for anything unknown', () => {
        expect(currencyFlag('XYZ')).toBe('')
    })
})
