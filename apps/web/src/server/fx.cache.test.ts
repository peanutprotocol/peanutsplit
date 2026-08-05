/**
 * `getRateTable`'s cache branch, against the real `peanut_split_test` database with the upstream
 * feed stubbed.
 *
 * This branch had no test and is the one most likely to be silently wrong at 162 codes: six
 * catalog codes are never in the feed, so a freshness test written against the whole catalog is
 * false forever — every request re-fetches, and one upstream blip drops all 150 new currencies to
 * the twelve-rate static table with nothing logged anywhere.
 *
 * Each test re-imports the module so `lastFailedFetchAt` and the single-flight promise start
 * empty. `@/server/db` caches its client on `globalThis`, so re-importing costs no connection.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/server/test/db'
import { FX_CORE, type RateTable } from '@/server/fx'
import { isCatalogCode, STATIC_USD_PER_UNIT } from '@/server/money'

const { egressFetchSpy } = vi.hoisted(() => ({ egressFetchSpy: vi.fn() }))

vi.mock('@/server/egress', () => ({ egressFetch: egressFetchSpy }))

const freshFx = async () => {
    vi.resetModules()
    return await import('@/server/fx')
}

const nowIso = () => new Date().toISOString()

/** `unitsPerBase` on the wire is quote units per USD; the module stores the inverse. */
const completeRates = (rates: Record<string, unknown>): Record<string, unknown> => {
    const complete = { ...rates }
    for (let index = 0; Object.keys(complete).length < 150; index++) {
        const code = `Q${String.fromCharCode(65 + Math.floor(index / 26))}${String.fromCharCode(65 + (index % 26))}`
        if (!isCatalogCode(code) && !(code in complete)) complete[code] = '1'
    }
    return complete
}

const feedBody = (rates: Record<string, unknown>) => ({
    base: 'USD',
    basis: 'display_sell',
    indicative: true,
    generatedAt: nowIso(),
    rates: Object.entries(completeRates(rates))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([code, unitsPerBase]) => ({
            code,
            unitsPerBase,
            source: code === 'USD' ? 'identity' : 'reference',
            effectiveAt: code === 'USD' ? null : nowIso(),
        })),
})

const feed = (rates: Record<string, unknown>) => new Response(JSON.stringify(feedBody(rates)), { status: 200 })

const payload = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })

const perUsd = Object.fromEntries(
    Object.entries(STATIC_USD_PER_UNIT).map(([code, usd]) => [code, (1 / usd).toString()])
)

const seed = async (rows: { quote: string; usdPerUnit: number; fetchedAt?: Date }[]) => {
    await prisma.fxRate.deleteMany()
    await prisma.fxRate.createMany({
        data: rows.map((row) => ({
            base: 'USD',
            quote: row.quote,
            rate: row.usdPerUnit,
            fetchedAt: row.fetchedAt ?? new Date(),
        })),
    })
}

const coreRows = (fetchedAt?: Date) =>
    FX_CORE.map((quote) => ({ quote, usdPerUnit: STATIC_USD_PER_UNIT[quote], fetchedAt }))

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(async () => {
    process.env.SPLIT_FX_MODE = ''
    delete process.env.SPLIT_FX_PROXY_URL
    fetchSpy = vi.fn(async () => feed(perUsd))
    vi.stubGlobal('fetch', fetchSpy)
    egressFetchSpy.mockReset()
    egressFetchSpy.mockImplementation(
        async (_proxyUrl: string | undefined, url: string, init: RequestInit) => await fetch(url, init)
    )
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await prisma.fxRate.deleteMany()
})

afterEach(async () => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.resetModules()
    process.env.SPLIT_FX_MODE = 'static'
    delete process.env.SPLIT_FX_PROXY_URL
    await prisma.fxRate.deleteMany()
})

describe('rate feed transport', () => {
    it('delegates its dedicated proxy URL to a bodyless egress GET', async () => {
        process.env.SPLIT_FX_PROXY_URL = 'http://split-egress.test:3128'
        const { getRateTable } = await freshFx()

        expect((await getRateTable()).source).toBe('live')
        expect(egressFetchSpy).toHaveBeenCalledTimes(1)
        expect(egressFetchSpy).toHaveBeenCalledWith(
            'http://split-egress.test:3128',
            'https://api.peanut.me/fx/rates?base=USD',
            expect.objectContaining({
                method: 'GET',
                headers: { Accept: 'application/json' },
                signal: expect.any(AbortSignal),
            })
        )
        expect(egressFetchSpy.mock.calls[0]?.[2]).not.toHaveProperty('body')
    })
})

describe('freshness is judged against FX_CORE, not the catalog', () => {
    it('calls a cache with every core code fresh — even though some catalog codes are missing', async () => {
        // CUC, BGN and other catalog codes are not in the provider snapshot. Judging
        // completeness against all 162 makes `fresh` false forever.
        await seed(coreRows())
        const { getRateTable } = await freshFx()

        const table = await getRateTable()
        expect(table.source).toBe('cache')
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('refetches when one core code is missing from the cache', async () => {
        await seed(coreRows().filter((row) => row.quote !== 'CHF'))
        const { getRateTable } = await freshFx()

        const table = await getRateTable()
        expect(fetchSpy).toHaveBeenCalledTimes(1)
        expect(table.source).toBe('live')
    })

    it('is not aged by a non-core row nobody has refreshed in a year, and does not serve it either', async () => {
        const ancient = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
        await seed([...coreRows(), { quote: 'INR', usdPerUnit: 0.012, fetchedAt: ancient }])
        const { getRateTable } = await freshFx()

        const table = await getRateTable()
        expect(table.source).toBe('cache')
        expect(fetchSpy).not.toHaveBeenCalled()
        // The two halves are separate rules and both matter. The old row does not drag the whole
        // table into being refetched on every request — and it is not an answer either. "The only
        // rate for INR there is" is not a reason to price money at a year-old number.
        expect(table.usdPerUnit).not.toHaveProperty('INR')
    })

    it('serves a non-core row that is merely old, up to the ceiling', async () => {
        const sixDays = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
        await seed([...coreRows(), { quote: 'INR', usdPerUnit: 0.012, fetchedAt: sixDays }])
        const { getRateTable } = await freshFx()

        const table = await getRateTable()
        expect(table.source).toBe('cache')
        expect(table.usdPerUnit.INR).toBeCloseTo(0.012, 12)
    })

    it('refetches once the core rows are older than the TTL', async () => {
        const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000)
        await seed(coreRows(yesterday))
        const { getRateTable } = await freshFx()

        expect((await getRateTable()).source).toBe('live')
        expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it('drops a cached row for a code that has left the catalog', async () => {
        await seed([...coreRows(), { quote: 'CNH', usdPerUnit: 0.14 }])
        const { getRateTable } = await freshFx()

        const table = await getRateTable()
        expect(table.source).toBe('cache')
        expect(table.usdPerUnit).not.toHaveProperty('CNH')
    })
})

describe('what counts as a usable payload', () => {
    it('rejects a thin successful payload before it can erase broad cached coverage', async () => {
        const thin = feedBody(perUsd)
        thin.rates = thin.rates.slice(0, 149)
        fetchSpy.mockResolvedValue(payload(thin))
        const { getRateTable } = await freshFx()

        expect((await getRateTable()).source).toBe('static')
        expect(console.warn).toHaveBeenCalledWith('[fx] rate feed refresh failed (rate feed payload unusable)')
    })

    it('accepts a payload missing only non-core codes, and leaves them out of the table', async () => {
        const partial = { ...perUsd, INR: '88' }
        delete (partial as Record<string, unknown>).SEK
        fetchSpy.mockResolvedValue(feed(partial))
        const { getRateTable } = await freshFx()

        const table = await getRateTable()
        expect(table.source).toBe('live')
        expect(table.usdPerUnit.INR).toBeCloseTo(1 / 88, 12)
        expect(table.usdPerUnit).not.toHaveProperty('SEK')
    })

    it('rejects a payload missing one core code, whole', async () => {
        const truncated = { ...perUsd }
        delete (truncated as Record<string, unknown>).THB
        fetchSpy.mockResolvedValue(feed(truncated))
        const { getRateTable } = await freshFx()

        // Nothing cached and the payload refused → the static table, not a half-live one.
        expect((await getRateTable()).source).toBe('static')
        expect(console.warn).toHaveBeenCalledWith('[fx] rate feed refresh failed (rate feed missing core currencies)')
    })

    it('drops a code the catalog does not know, so a made-up ticker cannot pick up a real rate', async () => {
        // The feed carries CNH, IMP, JEP and five other non-ISO codes.
        fetchSpy.mockResolvedValue(feed({ ...perUsd, CNH: '7.1', JEP: '0.79', KID: '1.5' }))
        const { getRateTable } = await freshFx()

        const table = await getRateTable()
        expect(table.source).toBe('live')
        for (const code of ['CNH', 'JEP', 'KID']) expect(table.usdPerUnit).not.toHaveProperty(code)
    })

    it.each([
        ['a numeric rather than decimal-string rate', { ...perUsd, PLN: 4.1 }],
        ['zero', { ...perUsd, PLN: '0' }],
        ['a negative rate', { ...perUsd, PLN: '-4.1' }],
        ['exponent notation', { ...perUsd, PLN: '4.1e0' }],
        ['more than eighteen fractional digits', { ...perUsd, PLN: '4.1234567890123456789' }],
    ])('rejects the whole provider payload when one row has %s', async (_label, rates) => {
        fetchSpy.mockResolvedValue(feed(rates))
        const { getRateTable } = await freshFx()

        expect((await getRateTable()).source).toBe('static')
        expect(console.warn).toHaveBeenCalledWith('[fx] rate feed refresh failed (rate feed payload unusable)')
    })

    it.each([
        ['the wrong base', { ...feedBody(perUsd), base: 'EUR' }],
        ['the wrong basis', { ...feedBody(perUsd), basis: 'midmarket' }],
        ['a non-indicative flag', { ...feedBody(perUsd), indicative: false }],
        ['a malformed generated timestamp', { ...feedBody(perUsd), generatedAt: 'today' }],
        [
            'a generated timestamp too far in the future',
            { ...feedBody(perUsd), generatedAt: new Date(Date.now() + 6 * 60 * 1000).toISOString() },
        ],
    ])('rejects %s', async (_label, body) => {
        fetchSpy.mockResolvedValue(payload(body))
        const { getRateTable } = await freshFx()

        expect((await getRateTable()).source).toBe('static')
        expect(console.warn).toHaveBeenCalledWith('[fx] rate feed refresh failed (rate feed payload unusable)')
    })

    it('rejects a generated snapshot older than the 24-hour upstream window', async () => {
        fetchSpy.mockResolvedValue(
            payload({ ...feedBody(perUsd), generatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() })
        )
        const { getRateTable } = await freshFx()

        expect((await getRateTable()).source).toBe('static')
    })

    it('rejects duplicate, unsorted and malformed rows instead of picking an arbitrary value', async () => {
        const duplicate = feedBody(perUsd)
        duplicate.rates.push({ ...duplicate.rates[0] })
        fetchSpy.mockResolvedValueOnce(payload(duplicate))
        const first = await freshFx()
        expect((await first.getRateTable()).source).toBe('static')

        vi.resetModules()
        const unsorted = feedBody(perUsd)
        unsorted.rates = [...unsorted.rates].reverse()
        fetchSpy.mockResolvedValueOnce(payload(unsorted))
        const second = await import('@/server/fx')
        expect((await second.getRateTable()).source).toBe('static')

        vi.resetModules()
        const malformed = feedBody(perUsd)
        malformed.rates[0] = { ...malformed.rates[0], effectiveAt: 'not-an-instant' }
        fetchSpy.mockResolvedValueOnce(payload(malformed))
        const third = await import('@/server/fx')
        expect((await third.getRateTable()).source).toBe('static')
    })

    it.each([
        ['an unknown source', 'EUR', { source: 'oracle' }],
        ['identity on a non-USD row', 'EUR', { source: 'identity' }],
        ['a non-identity USD row', 'USD', { source: 'reference' }],
        ['a non-unit USD value', 'USD', { unitsPerBase: '1.01' }],
        ['an effective timestamp on identity', 'USD', { effectiveAt: nowIso() }],
        ['a missing effective timestamp', 'EUR', { effectiveAt: null }],
        [
            'an old effective timestamp',
            'EUR',
            { effectiveAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString() },
        ],
        ['a future effective timestamp', 'EUR', { effectiveAt: new Date(Date.now() + 6 * 60 * 1000).toISOString() }],
        ['a rate below the producer bound', 'EUR', { unitsPerBase: '0.0000000001' }],
        ['a rate above the producer bound', 'EUR', { unitsPerBase: '10000000000' }],
    ])('rejects %s', async (_label, code, replacement) => {
        const body = feedBody(perUsd)
        const index = body.rates.findIndex((row) => row.code === code)
        body.rates[index] = { ...body.rates[index], ...replacement }
        fetchSpy.mockResolvedValue(payload(body))
        const { getRateTable } = await freshFx()

        expect((await getRateTable()).source).toBe('static')
        expect(console.warn).toHaveBeenCalledWith('[fx] rate feed refresh failed (rate feed payload unusable)')
    })

    it('rejects more than 512 rows before attempting to build a table', async () => {
        const rows = Array.from({ length: 513 }, (_, index) => ({
            code: `${String.fromCharCode(65 + Math.floor(index / 26 / 26))}${String.fromCharCode(
                65 + (Math.floor(index / 26) % 26)
            )}${String.fromCharCode(65 + (index % 26))}`,
            unitsPerBase: '1',
            source: 'reference',
            effectiveAt: nowIso(),
        }))
        fetchSpy.mockResolvedValue(payload({ ...feedBody(perUsd), rates: rows }))
        const { getRateTable } = await freshFx()

        expect((await getRateTable()).source).toBe('static')
    })

    it('stops reading a chunked response once its raw JSON crosses 256 KiB', async () => {
        fetchSpy.mockResolvedValue(payload({ ...feedBody(perUsd), padding: 'x'.repeat(256 * 1024) }))
        const { getRateTable } = await freshFx()

        expect((await getRateTable()).source).toBe('static')
        expect(console.warn).toHaveBeenCalledWith('[fx] rate feed refresh failed (rate feed payload unusable)')
    })

    it('falls back to a complete cache when the fetch fails, rather than to the static table', async () => {
        const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000)
        await seed([...coreRows(yesterday), { quote: 'INR', usdPerUnit: 0.012, fetchedAt: yesterday }])
        fetchSpy.mockRejectedValue(new Error('upstream down'))
        const { getRateTable } = await freshFx()

        const table = await getRateTable()
        expect(table.source).toBe('cache')
        expect(table.usdPerUnit.INR).toBeCloseTo(0.012, 12)
    })
})

/**
 * The failure this closes: nothing deleted an `FxRate` row, so a code the feed stopped carrying
 * kept pricing expenses from whatever it was last worth, while the one request that crossed the
 * TTL took the live branch and returned a 400 on the same input.
 */
describe('a code the feed stops carrying', () => {
    it('is never priced from a row past the ceiling, however fresh the core is', async () => {
        const eightDays = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
        await seed([...coreRows(), { quote: 'SEK', usdPerUnit: 0.095, fetchedAt: eightDays }])
        const { getRateTable, rateFrom } = await freshFx()

        const table = await getRateTable()
        expect(table.source).toBe('cache')
        expect(fetchSpy).not.toHaveBeenCalled()
        // Null, not a rate. The room refuses the expense rather than netting it at a week-old number.
        expect(rateFrom(table, 'SEK', 'EUR')).toBeNull()
    })

    it('gives the same answer on both sides of a TTL tick, instead of alternating', async () => {
        const ageCore = (ms: number) =>
            prisma.fxRate.updateMany({
                where: { quote: { in: [...FX_CORE] } },
                data: { fetchedAt: new Date(Date.now() - ms) },
            })
        const HOUR = 60 * 60 * 1000
        // The feed carried SEK yesterday and does not carry it today.
        await seed([...coreRows(new Date(Date.now() - 23 * HOUR)), { quote: 'SEK', usdPerUnit: 0.095 }])
        const { getRateTable, rateFrom } = await freshFx()

        // Inside the TTL: the cached SEK rate is less than a day old, so it is an honest answer.
        const inside = await getRateTable()
        expect(inside.source).toBe('cache')
        expect(rateFrom(inside, 'SEK', 'EUR')).not.toBeNull()

        // Crossing it: the live payload has no SEK, so the pair has no rate.
        await ageCore(25 * HOUR)
        const crossing = await getRateTable()
        expect(crossing.source).toBe('live')
        expect(rateFrom(crossing, 'SEK', 'EUR')).toBeNull()

        // And after it. This is the assertion that matters: the refresh used to leave SEK's row
        // in place, so the very next request served the old rate again and the answer alternated
        // for as long as the feed stayed silent.
        const after = await getRateTable()
        expect(after.source).toBe('cache')
        expect(rateFrom(after, 'SEK', 'EUR')).toBeNull()
        expect(await prisma.fxRate.findFirst({ where: { quote: 'SEK' } })).toBeNull()
    })
})

describe('the write', () => {
    it('lands every rate in one transaction', async () => {
        fetchSpy.mockResolvedValue(feed({ ...perUsd, INR: '88', KWD: '0.306' }))
        const { getRateTable } = await freshFx()

        await getRateTable()
        const rows = await prisma.fxRate.findMany({ where: { base: 'USD' } })
        expect(rows).toHaveLength(FX_CORE.length + 2)
        expect(rows.every((row) => row.id.length > 0)).toBe(true)
        const inr = rows.find((row) => row.quote === 'INR')!
        expect(Number(inr.rate)).toBeCloseTo(1 / 88, 9)
    })

    it('updates the row it already has rather than inserting a second one', async () => {
        await seed(coreRows(new Date(Date.now() - 25 * 60 * 60 * 1000)))
        fetchSpy.mockResolvedValue(feed({ ...perUsd, EUR: '2' }))
        const { getRateTable } = await freshFx()

        await getRateTable()
        const eur = await prisma.fxRate.findMany({ where: { base: 'USD', quote: 'EUR' } })
        expect(eur).toHaveLength(1)
        expect(Number(eur[0].rate)).toBeCloseTo(0.5, 9)
    })
})

describe('single flight', () => {
    it('serves concurrent cold requests from one fetch and one write', async () => {
        const { getRateTable } = await freshFx()

        const tables = await Promise.all([getRateTable(), getRateTable(), getRateTable(), getRateTable()])
        expect(fetchSpy).toHaveBeenCalledTimes(1)
        expect(tables.every((table: RateTable) => table.source === 'live')).toBe(true)
    })

    it('does not pin later requests to a refresh that failed', async () => {
        fetchSpy.mockRejectedValueOnce(new Error('upstream down'))
        const { getRateTable } = await freshFx()

        expect((await getRateTable()).source).toBe('static')
        // The backoff, not the guard, is what stops the second call — but the guard must have
        // released, or every later request would replay the same settled promise forever.
        await seed(coreRows())
        expect((await getRateTable()).source).toBe('cache')
    })
})
