import { describe, expect, it } from 'vitest'
import { FX_CORE, rateFrom, requireRate, type RateTable } from '@/server/fx'
import { ApiError } from '@/server/http'
import { convertMinorAtRate, STATIC_USD_PER_UNIT } from '@/server/money'

const table: RateTable = {
    usdPerUnit: { ...STATIC_USD_PER_UNIT },
    source: 'static',
    fetchedAt: null,
}

describe('rateFrom', () => {
    it('is 1 for the same currency', () => {
        expect(rateFrom(table, 'EUR', 'EUR')).toBe(1)
    })

    /** Identity is checked before any lookup, which is the whole reason a room settling in a
     *  made-up ticker can hold expenses at all. */
    it('is 1 for a made-up ticker against itself, with no rate anywhere in the table', () => {
        expect(rateFrom(table, 'DOGE', 'DOGE')).toBe(1)
        expect(rateFrom({ ...table, usdPerUnit: {} }, 'BEER', 'BEER')).toBe(1)
    })

    it('crosses via USD', () => {
        expect(rateFrom(table, 'EUR', 'USD')).toBeCloseTo(1.08, 12)
        expect(rateFrom(table, 'USD', 'EUR')).toBeCloseTo(1 / 1.08, 12)
        expect(rateFrom(table, 'THB', 'EUR')).toBeCloseTo(0.028 / 1.08, 12)
    })

    it('round-trips an amount back to itself on the static table', () => {
        const eur = 12_345n
        const thb = convertMinorAtRate(eur, 'EUR', 'THB', rateFrom(table, 'EUR', 'THB')!)
        const back = convertMinorAtRate(thb, 'THB', 'EUR', rateFrom(table, 'THB', 'EUR')!)
        // Two roundings, so allow the single minor unit they can cost.
        expect(back - eur >= -1n && back - eur <= 1n).toBe(true)
    })

    /**
     * Null, never 1, and never a throw. A 1 here would net two currencies that have no exchange
     * rate against each other at par — the worst thing this module can do, and it would do it
     * with nothing on any screen to say so.
     */
    it('is null for a pair it cannot price, in both directions', () => {
        expect(rateFrom(table, 'DOGE', 'EUR')).toBeNull()
        expect(rateFrom(table, 'EUR', 'DOGE')).toBeNull()
        expect(rateFrom(table, 'DOGE', 'BEER')).toBeNull()
    })

    it('is null for a real catalog code the table carries no rate for', () => {
        // KPW is in the live catalog but absent from this supplied static table. It is not a
        // special case; it gets the same answer a made-up ticker gets at runtime.
        expect(rateFrom(table, 'KPW', 'EUR')).toBeNull()
        expect(rateFrom(table, 'EUR', 'KPW')).toBeNull()
    })

    it('is null rather than Infinity or NaN when a rate is zero', () => {
        const broken: RateTable = { ...table, usdPerUnit: { ...STATIC_USD_PER_UNIT, ZWL: 0 } }
        expect(rateFrom(broken, 'ZWL', 'EUR')).toBeNull()
        expect(rateFrom(broken, 'EUR', 'ZWL')).toBeNull()
    })

    it('refuses a cross that cannot be stored as a positive Decimal(24,12)', () => {
        const extreme: RateTable = {
            ...table,
            usdPerUnit: { TINY: 1e-9, HUGE: 1e9 },
        }
        expect(rateFrom(extreme, 'HUGE', 'TINY')).toBeNull()
        expect(rateFrom(extreme, 'TINY', 'HUGE')).toBeNull()
    })

    it('prices every ordered pair of the twelve codes that ship a static rate', () => {
        for (const from of FX_CORE) {
            for (const to of FX_CORE) {
                const rate = rateFrom(table, from, to)
                expect(rate).not.toBeNull()
                expect(rate!).toBeGreaterThan(0)
            }
        }
    })
})

describe('requireRate', () => {
    it('returns the rate where rateFrom does', () => {
        expect(requireRate(table, 'EUR', 'USD')).toBeCloseTo(1.08, 12)
        expect(requireRate(table, 'DOGE', 'DOGE')).toBe(1)
    })

    /** A 400 with a code the client can translate. A raw `Error` leaves as a 500, which reads as
     *  "we broke" rather than "that pair has no rate". */
    it('throws a 400 NO_RATE where rateFrom returns null', () => {
        expect(() => requireRate(table, 'DOGE', 'EUR')).toThrow(ApiError)
        try {
            requireRate(table, 'DOGE', 'EUR')
            throw new Error('expected a throw')
        } catch (err) {
            expect(err).toBeInstanceOf(ApiError)
            expect((err as ApiError).status).toBe(400)
            expect((err as ApiError).code).toBe('NO_RATE')
        }
    })
})

describe('FX_CORE', () => {
    it('is the twelve legacy codes, and the static table covers exactly them', () => {
        expect(FX_CORE).toHaveLength(12)
        expect([...FX_CORE].sort()).toEqual(Object.keys(STATIC_USD_PER_UNIT).sort())
    })
})
