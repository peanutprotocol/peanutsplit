import { describe, expect, it } from 'vitest'
import { DOODLE_NAMES, isDoodleName } from '@/components/ui/doodles'
import { CURRENCY_CATALOG } from '@/lib/currency-catalog'
import { currencyDoodle } from './currency-doodle'

/** The 12 codes every room in production carries today, with the drawing each one shows today.
 *  Locked verbatim: this change widens the catalog to 162 codes, and no existing room may see its
 *  sign move. */
const LEGACY = {
    USD: 'dollar',
    EUR: 'euro',
    GBP: 'pound',
    ARS: 'peso',
    BRL: 'real',
    MXN: 'peso',
    COP: 'peso',
    CHF: 'franc',
    THB: 'baht',
    JPY: 'yen',
    AUD: 'dollar',
    CAD: 'dollar',
} as const

describe('currencyDoodle', () => {
    it('gives a currency its own drawn sign', () => {
        expect(currencyDoodle('EUR')).toBe('euro')
        expect(currencyDoodle('KRW')).toBe('won')
        expect(currencyDoodle('ILS')).toBe('shekel')
        expect(currencyDoodle('PHP')).toBe('piso')
    })

    it('gives a currency the family mark its sign belongs to', () => {
        // Nobody prints the franc sign; the code beside it says which franc.
        expect(currencyDoodle('CHF')).toBe('franc')
        expect(currencyDoodle('XOF')).toBe('franc')
        expect(currencyDoodle('KES')).toBe('shilling')
        expect(currencyDoodle('AWG')).toBe('guilder')
    })

    it('gives a real but undrawn currency the banknote', () => {
        // AED, BDT and SAR are real currencies whose signs were judged and cut.
        expect(currencyDoodle('AED')).toBe('banknote')
        expect(currencyDoodle('BDT')).toBe('banknote')
        expect(currencyDoodle('SAR')).toBe('banknote')
    })

    it('gives an invented ticker the shrug', () => {
        expect(currencyDoodle('BEER')).toBe('shrug')
        expect(currencyDoodle('DOGE')).toBe('shrug')
        expect(currencyDoodle('ZZZ')).toBe('shrug')
    })

    it('shrugs at a code the map knows but the catalog does not', () => {
        // JEP, GGP and IMP print the pound sign and the rate feed carries them, but they are not
        // ISO 4217 currencies. Borrowing the pound here would let an invented ticker look real.
        expect(currencyDoodle('JEP')).toBe('shrug')
        expect(currencyDoodle('GGP')).toBe('shrug')
        expect(currencyDoodle('IMP')).toBe('shrug')
        expect(currencyDoodle('CNH')).toBe('shrug')
    })

    it('uppercases before it looks anything up', () => {
        expect(currencyDoodle('eur')).toBe('euro')
        expect(currencyDoodle('beer')).toBe('shrug')
    })

    it('returns a real drawing for every code in the catalog', () => {
        const names = new Set<string>(DOODLE_NAMES)
        for (const entry of CURRENCY_CATALOG) {
            const drawn = currencyDoodle(entry.code)
            expect(isDoodleName(drawn), `${entry.code} resolved to ${drawn}`).toBe(true)
            expect(names.has(drawn), `${entry.code} resolved to ${drawn}`).toBe(true)
            expect(drawn).not.toBe('shrug')
        }
    })

    it('keeps the 12 legacy codes on the drawings they ship with', () => {
        for (const [code, drawn] of Object.entries(LEGACY)) {
            expect(currencyDoodle(code), code).toBe(drawn)
        }
    })
})
