import { describe, expect, it } from 'vitest'
import { availableRateQuote, convertMinorForPreview } from './use-rate'

describe('availableRateQuote', () => {
    it('turns a successful no-rate response into no preview', () => {
        expect(
            availableRateQuote({ from: 'EUR', to: 'DOGE', rate: null, source: 'static', indicative: true })
        ).toBeNull()
    })

    it('preserves an available numeric quote', () => {
        const quote = { from: 'USD', to: 'EUR', rate: 0.92, source: 'static', indicative: true } as const
        expect(availableRateQuote(quote)).toEqual(quote)
    })
})

/**
 * Display-only arithmetic, but it still puts a number in front of someone about
 * to commit an expense — so the decimal handling is pinned here rather than
 * trusted. The cases that matter are the asymmetric ones: a 0-decimal currency
 * on either side is where a naive `minor * rate` silently shifts by 100.
 */
describe('convertMinorForPreview', () => {
    it('converts between two 2-decimal currencies', () => {
        // 12 000.00 ARS at 0.000735 → 8.82 EUR
        expect(convertMinorForPreview('1200000', 0.000735, 2, 2)).toBe('882')
    })

    it('handles a 0-decimal source', () => {
        // JPY 4500 at 0.0062 → 27.90 EUR
        expect(convertMinorForPreview('4500', 0.0062, 0, 2)).toBe('2790')
    })

    it('handles a 0-decimal target', () => {
        // EUR 10.00 at 161.3 → JPY 1613
        expect(convertMinorForPreview('1000', 161.3, 2, 0)).toBe('1613')
    })

    it('rounds half-up rather than truncating', () => {
        // 2.50 at parity into a 0-decimal currency is exactly half a unit → 3.
        expect(convertMinorForPreview('250', 1, 2, 0)).toBe('3')
    })

    it('returns null instead of NaN when the probe gave nothing usable', () => {
        expect(convertMinorForPreview('100', 0, 2, 2)).toBeNull()
        expect(convertMinorForPreview('100', Number.NaN, 2, 2)).toBeNull()
        expect(convertMinorForPreview('not a number', 1.1, 2, 2)).toBeNull()
    })
})
