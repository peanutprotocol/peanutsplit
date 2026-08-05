/**
 * What the picker is allowed to offer.
 *
 * The catalog's `hasRate` describes the live rate feed, and `SPLIT_FX_MODE=static` is the mode
 * that has no feed: dev, this suite, and the e2e run all price from the twelve-code static table.
 * Advertising the feed's 156 there hands the picker currencies the write path then refuses with a
 * 400 `NO_RATE` — the one failure the whole `hasRate` contract exists to make unreachable. So the
 * check below is the contract itself: every code this route says has a rate can be priced by the
 * table `getRateTable()` actually returns.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { GET } from '@/app/api/currencies/route'
import type { CurrencyInfo } from '@/lib/api-types'
import { getRateTable, rateFrom } from '@/server/fx'
import { STATIC_USD_PER_UNIT } from '@/server/money'

const served = async (): Promise<CurrencyInfo[]> => {
    const res = GET()
    expect(res.status).toBe(200)
    return ((await res.json()) as { currencies: CurrencyInfo[] }).currencies
}

describe('GET /api/currencies', () => {
    // `src/server/test/env.ts` pins the suite to static mode; the live case below unpins it.
    afterEach(() => {
        process.env.SPLIT_FX_MODE = 'static'
    })

    it('offers no rate the static table cannot serve', async () => {
        const table = await getRateTable()
        expect(table.source).toBe('static')
        const currencies = await served()
        for (const c of currencies) {
            if (c.hasRate) expect(rateFrom(table, c.code, 'EUR'), c.code).not.toBeNull()
        }
        expect(currencies.filter((c) => c.hasRate)).toHaveLength(Object.keys(STATIC_USD_PER_UNIT).length)
    })

    it('keeps the whole catalog, and only narrows the boolean', async () => {
        const currencies = await served()
        expect(currencies).toHaveLength(162)
        expect(currencies.find((c) => c.code === 'EUR')?.hasRate).toBe(true)
        // Carried by the feed, absent from the static table — offerable in production, not here.
        expect(currencies.find((c) => c.code === 'INR')?.hasRate).toBe(false)
        expect(currencies.find((c) => c.code === 'INR')?.decimals).toBe(2)
    })

    it('advertises the feed in full once the feed is on', async () => {
        delete process.env.SPLIT_FX_MODE
        const currencies = await served()
        expect(currencies.find((c) => c.code === 'INR')?.hasRate).toBe(true)
        expect(currencies.find((c) => c.code === 'KPW')?.hasRate).toBe(true)
        // A catalog code absent from the current Peanut snapshot stays false in either mode.
        expect(currencies.find((c) => c.code === 'BGN')?.hasRate).toBe(false)
    })
})
