import { describe, expect, it } from 'vitest'
import { FX_CORE, rateFrom, requireRate, type RateTable } from '@/server/fx'
import { ApiError } from '@/server/http'
import { convertMinorAtRate, STATIC_USD_PER_UNIT } from '@/server/money'

const tableFor = (base: string, basePerUnit?: Record<string, number>): RateTable => {
    const usdPerBase = STATIC_USD_PER_UNIT[base]
    const materialized =
        basePerUnit ??
        Object.fromEntries(
            Object.entries(STATIC_USD_PER_UNIT).map(([quote, usdPerQuote]) => [quote, usdPerQuote / usdPerBase])
        )
    return { base, basePerUnit: materialized, source: 'static', fetchedAt: null }
}

const eurTable = tableFor('EUR')

describe('rateFrom', () => {
    it('is 1 for the same currency', () => {
        expect(rateFrom(eurTable, 'EUR', 'EUR')).toBe(1)
    })

    /** Identity is checked before any lookup, which lets a room settling in a
     * made-up ticker hold expenses in that same ticker. */
    it('is 1 for a made-up ticker against itself, with no rate in the table', () => {
        expect(rateFrom(eurTable, 'DOGE', 'DOGE')).toBe(1)
        expect(rateFrom(tableFor('BEER', {}), 'BEER', 'BEER')).toBe(1)
    })

    it('uses the direct row selected for the table base', () => {
        expect(rateFrom(eurTable, 'USD', 'EUR')).toBeCloseTo(1 / 1.08, 12)
        expect(rateFrom(eurTable, 'THB', 'EUR')).toBeCloseTo(0.028 / 1.08, 12)
    })

    it('refuses to cross one base table into a different destination', () => {
        expect(rateFrom(eurTable, 'EUR', 'USD')).toBeNull()
        expect(rateFrom(eurTable, 'EUR', 'THB')).toBeNull()
    })

    it('round-trips through two independently materialized destination tables', () => {
        const eur = 12_345n
        const thbTable = tableFor('THB')
        const thb = convertMinorAtRate(eur, 'EUR', 'THB', rateFrom(thbTable, 'EUR', 'THB')!)
        const back = convertMinorAtRate(thb, 'THB', 'EUR', rateFrom(eurTable, 'THB', 'EUR')!)
        expect(back - eur >= -1n && back - eur <= 1n).toBe(true)
    })

    it('is null for a pair it cannot price', () => {
        expect(rateFrom(eurTable, 'DOGE', 'EUR')).toBeNull()
        expect(rateFrom(eurTable, 'EUR', 'DOGE')).toBeNull()
        expect(rateFrom(tableFor('BEER', {}), 'DOGE', 'BEER')).toBeNull()
    })

    it('is null for a real catalog code the table carries no direct rate for', () => {
        expect(rateFrom(eurTable, 'KPW', 'EUR')).toBeNull()
    })

    it('is null rather than Infinity or NaN for an invalid direct row', () => {
        const broken = tableFor('EUR', { ZWL: 0 })
        expect(rateFrom(broken, 'ZWL', 'EUR')).toBeNull()
    })

    it('refuses a direct rate that cannot fit Decimal(24,12)', () => {
        expect(rateFrom(tableFor('TINY', { HUGE: 1e12 }), 'HUGE', 'TINY')).toBeNull()
        expect(rateFrom(tableFor('HUGE', { TINY: 1e-13 }), 'TINY', 'HUGE')).toBeNull()
    })

    it('prices every core source into every materialized core destination', () => {
        for (const to of FX_CORE) {
            const table = tableFor(to)
            for (const from of FX_CORE) {
                const rate = rateFrom(table, from, to)
                expect(rate).not.toBeNull()
                expect(rate!).toBeGreaterThan(0)
            }
        }
    })
})

describe('requireRate', () => {
    it('returns a direct table rate and identity', () => {
        expect(requireRate(eurTable, 'USD', 'EUR')).toBeCloseTo(1 / 1.08, 12)
        expect(requireRate(eurTable, 'DOGE', 'DOGE')).toBe(1)
    })

    it('throws a 400 NO_RATE when the table cannot answer that destination', () => {
        expect(() => requireRate(eurTable, 'DOGE', 'EUR')).toThrow(ApiError)
        try {
            requireRate(eurTable, 'EUR', 'USD')
            throw new Error('expected a throw')
        } catch (error) {
            expect(error).toBeInstanceOf(ApiError)
            expect((error as ApiError).status).toBe(400)
            expect((error as ApiError).code).toBe('NO_RATE')
        }
    })
})

describe('FX_CORE', () => {
    it('is the twelve legacy codes covered by the pinned USD source table', () => {
        expect(FX_CORE).toHaveLength(12)
        expect([...FX_CORE].sort()).toEqual(Object.keys(STATIC_USD_PER_UNIT).sort())
    })
})
