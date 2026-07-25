import { describe, expect, it } from 'vitest'
import { rateFrom, type RateTable } from '@/server/fx'
import { CURRENCIES, convertMinorAtRate } from '@/server/money'

const table: RateTable = {
    usdPerUnit: Object.fromEntries(CURRENCIES.map((c) => [c.code, c.usdPerUnit])),
    source: 'static',
    fetchedAt: null,
}

describe('rateFrom', () => {
    it('is 1 for the same currency', () => {
        expect(rateFrom(table, 'EUR', 'EUR')).toBe(1)
    })

    it('crosses via USD', () => {
        expect(rateFrom(table, 'EUR', 'USD')).toBeCloseTo(1.08, 12)
        expect(rateFrom(table, 'USD', 'EUR')).toBeCloseTo(1 / 1.08, 12)
        expect(rateFrom(table, 'THB', 'EUR')).toBeCloseTo(0.028 / 1.08, 12)
    })

    it('round-trips an amount back to itself on the static table', () => {
        const eur = 12_345n
        const thb = convertMinorAtRate(eur, 'EUR', 'THB', rateFrom(table, 'EUR', 'THB'))
        const back = convertMinorAtRate(thb, 'THB', 'EUR', rateFrom(table, 'THB', 'EUR'))
        // Two roundings, so allow the single minor unit they can cost.
        expect(back - eur >= -1n && back - eur <= 1n).toBe(true)
    })

    it('rejects a currency it has no rate for', () => {
        expect(() => rateFrom(table, 'EUR', 'XYZ')).toThrow()
    })
})
