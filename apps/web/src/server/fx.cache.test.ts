/** Base-specific live/cache behavior against the real test database. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/server/test/db'
import { FX_CORE, type RateTable } from '@/server/fx'
import { isCatalogCode, STATIC_USD_PER_UNIT } from '@/server/money'

const freshFx = async () => {
    vi.resetModules()
    return await import('@/server/fx')
}

const nowIso = () => new Date().toISOString()

const staticDirect = (base: string): Record<string, number> => {
    const usdPerBase = STATIC_USD_PER_UNIT[base]
    return Object.fromEntries(
        Object.entries(STATIC_USD_PER_UNIT).map(([quote, usdPerQuote]) => [quote, usdPerQuote / usdPerBase])
    )
}

const completeRates = (rates: Record<string, unknown>): Record<string, unknown> => {
    const complete = { ...rates }
    for (let index = 0; Object.keys(complete).length < 150; index++) {
        const code = `Q${String.fromCharCode(65 + Math.floor(index / 26))}${String.fromCharCode(65 + (index % 26))}`
        if (!isCatalogCode(code) && !(code in complete)) complete[code] = 1
    }
    return complete
}

/** Input values are direct base-units per quote; wire values are the inverse. */
const feedBody = (base: string, directRates: Record<string, unknown>) => ({
    base,
    basis: 'display_sell',
    indicative: true,
    generatedAt: nowIso(),
    rates: Object.entries(completeRates(directRates))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([code, direct]) => ({
            code,
            unitsPerBase: typeof direct === 'number' ? (1 / direct).toString() : direct,
            selection: code === base ? 'identity' : 'reference_pair',
            baseSource: code === base ? 'identity' : base === 'USD' ? 'identity' : 'reference',
            quoteSource: code === base ? 'identity' : code === 'USD' ? 'identity' : 'reference',
            effectiveAt: code === base ? null : nowIso(),
        })),
})

const payload = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
const feed = (base: string, rates: Record<string, unknown>) => payload(feedBody(base, rates))

const seed = async (base: string, rows: { quote: string; basePerUnit: number; fetchedAt?: Date }[]): Promise<void> => {
    await prisma.fxRate.createMany({
        data: rows.map((row) => ({
            base,
            quote: row.quote,
            rate: row.basePerUnit,
            fetchedAt: row.fetchedAt ?? new Date(),
        })),
    })
}

const coreRows = (base: string, fetchedAt?: Date) =>
    Object.entries(staticDirect(base)).map(([quote, basePerUnit]) => ({ quote, basePerUnit, fetchedAt }))

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(async () => {
    process.env.SPLIT_FX_MODE = ''
    fetchSpy = vi.fn(async (input: string | URL | Request) => {
        const base = new URL(String(input)).searchParams.get('base') ?? 'EUR'
        return feed(base, staticDirect(base))
    })
    vi.stubGlobal('fetch', fetchSpy)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await prisma.fxRate.deleteMany()
})

afterEach(async () => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.resetModules()
    process.env.SPLIT_FX_MODE = 'static'
    await prisma.fxRate.deleteMany()
})

describe('direct fixed-host transport', () => {
    it('uses a bodyless credential-free GET and refuses redirects or implicit caching', async () => {
        const { getRateTable } = await freshFx()

        expect((await getRateTable('eur')).source).toBe('live')
        expect(fetchSpy).toHaveBeenCalledTimes(1)
        expect(fetchSpy).toHaveBeenCalledWith(
            'https://api.peanut.me/fx/rates?base=EUR',
            expect.objectContaining({
                method: 'GET',
                headers: { Accept: 'application/json' },
                signal: expect.any(AbortSignal),
                redirect: 'error',
                credentials: 'omit',
                cache: 'no-store',
            })
        )
        const init = fetchSpy.mock.calls[0]?.[1]
        expect(init).not.toHaveProperty('body')
        expect(init?.headers).not.toHaveProperty('Authorization')
        expect(init?.headers).not.toHaveProperty('Cookie')
    })

    it('never puts an invented ticker into an outbound URL', async () => {
        const { getRateTable } = await freshFx()
        const table = await getRateTable('BEER')

        expect(fetchSpy).not.toHaveBeenCalled()
        expect(table).toMatchObject({ base: 'BEER', source: 'static', basePerUnit: { BEER: 1 } })
    })
})

describe('the cache is isolated by destination base', () => {
    it('uses a complete fresh cache for the requested base', async () => {
        await seed('EUR', coreRows('EUR'))
        const { getRateTable } = await freshFx()

        const table = await getRateTable('EUR')
        expect(table).toMatchObject({ base: 'EUR', source: 'cache' })
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('does not treat a complete USD table as an EUR table', async () => {
        await seed('USD', coreRows('USD'))
        const { getRateTable } = await freshFx()

        expect((await getRateTable('EUR')).source).toBe('live')
        expect(fetchSpy).toHaveBeenCalledWith('https://api.peanut.me/fx/rates?base=EUR', expect.any(Object))
    })

    it('refetches when one required row is missing', async () => {
        await seed(
            'EUR',
            coreRows('EUR').filter((row) => row.quote !== 'CHF')
        )
        const { getRateTable } = await freshFx()

        expect((await getRateTable('EUR')).source).toBe('live')
    })

    it('does not age the table with an old non-core row and does not serve that row', async () => {
        const ancient = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
        await seed('EUR', [...coreRows('EUR'), { quote: 'INR', basePerUnit: 0.011, fetchedAt: ancient }])
        const { getRateTable } = await freshFx()

        const table = await getRateTable('EUR')
        expect(table.source).toBe('cache')
        expect(table.basePerUnit).not.toHaveProperty('INR')
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('serves a non-core row only within the seven-day ceiling', async () => {
        const sixDays = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
        await seed('EUR', [...coreRows('EUR'), { quote: 'INR', basePerUnit: 0.011, fetchedAt: sixDays }])
        const { getRateTable } = await freshFx()

        expect((await getRateTable('EUR')).basePerUnit.INR).toBeCloseTo(0.011, 12)
    })

    it('refreshes when required rows cross the 24-hour TTL', async () => {
        const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000)
        await seed('EUR', coreRows('EUR', yesterday))
        const { getRateTable } = await freshFx()

        expect((await getRateTable('EUR')).source).toBe('live')
    })
})

describe('base-specific payload validation', () => {
    it('uses the selected direct PLN→EUR row without crossing other rows', async () => {
        const direct: Record<string, number> = { ...staticDirect('EUR'), PLN: 0.231481481481 }
        // Deliberately unrelated USD row: local crossing would produce a different answer.
        direct.USD = 0.5
        fetchSpy.mockResolvedValue(feed('EUR', direct))
        const { getRateTable, rateFrom } = await freshFx()

        const table = await getRateTable('EUR')
        expect(rateFrom(table, 'PLN', 'EUR')).toBeCloseTo(0.231481481481, 12)
        expect(rateFrom(table, 'PLN', 'USD')).toBeNull()
    })

    it('accepts provider-pair provenance, including Bridge↔Manteca', async () => {
        const body = feedBody('EUR', { ...staticDirect('EUR'), BRL: 0.17 })
        const index = body.rates.findIndex((row) => row.code === 'BRL')
        body.rates[index] = {
            ...body.rates[index],
            selection: 'provider_pair',
            baseSource: 'bridge',
            quoteSource: 'manteca',
        }
        fetchSpy.mockResolvedValue(payload(body))
        const { getRateTable } = await freshFx()

        expect((await getRateTable('EUR')).source).toBe('live')
    })

    it('allows identity provenance only on the actual USD leg of a non-identity pair', async () => {
        const valid = feedBody('USD', staticDirect('USD'))
        fetchSpy.mockResolvedValueOnce(payload(valid))
        const first = await freshFx()
        expect((await first.getRateTable('USD')).source).toBe('live')

        vi.resetModules()
        const invalid = feedBody('EUR', staticDirect('EUR'))
        const chf = invalid.rates.findIndex((row) => row.code === 'CHF')
        invalid.rates[chf] = { ...invalid.rates[chf], baseSource: 'identity' }
        fetchSpy.mockResolvedValueOnce(payload(invalid))
        const second = await import('@/server/fx')
        expect((await second.getRateTable('EUR')).source).toBe('static')
    })

    it.each([
        ['the wrong selected base', (body: ReturnType<typeof feedBody>) => ({ ...body, base: 'GBP' })],
        ['the wrong basis', (body: ReturnType<typeof feedBody>) => ({ ...body, basis: 'midmarket' })],
        ['a non-indicative flag', (body: ReturnType<typeof feedBody>) => ({ ...body, indicative: false })],
        ['a malformed generated timestamp', (body: ReturnType<typeof feedBody>) => ({ ...body, generatedAt: 'today' })],
        [
            'a future generated timestamp',
            (body: ReturnType<typeof feedBody>) => ({
                ...body,
                generatedAt: new Date(Date.now() + 6 * 60 * 1000).toISOString(),
            }),
        ],
        [
            'a generated snapshot older than the ingest window',
            (body: ReturnType<typeof feedBody>) => ({
                ...body,
                generatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
            }),
        ],
    ])('rejects %s', async (_label, mutate) => {
        fetchSpy.mockResolvedValue(payload(mutate(feedBody('EUR', staticDirect('EUR')))))
        const { getRateTable } = await freshFx()

        expect((await getRateTable('EUR')).source).toBe('static')
    })

    it.each([
        ['the removed mixed selection', 'CHF', { selection: 'mixed' }],
        ['provider/reference mixing', 'BRL', { selection: 'provider_pair', baseSource: 'bridge' }],
        ['identity on a non-base row', 'CHF', { selection: 'identity' }],
        ['a non-unit identity value', 'EUR', { unitsPerBase: '1.01' }],
        ['an effective timestamp on identity', 'EUR', { effectiveAt: nowIso() }],
        ['a missing pair timestamp', 'CHF', { effectiveAt: null }],
        ['an old pair timestamp', 'CHF', { effectiveAt: new Date(Date.now() - 31 * 86400_000).toISOString() }],
        ['a future pair timestamp', 'CHF', { effectiveAt: new Date(Date.now() + 6 * 60_000).toISOString() }],
        ['an unknown leg source', 'CHF', { quoteSource: 'oracle' }],
    ])('rejects %s', async (_label, code, replacement) => {
        const body = feedBody('EUR', staticDirect('EUR'))
        const index = body.rates.findIndex((row) => row.code === code)
        body.rates[index] = { ...body.rates[index], ...replacement }
        fetchSpy.mockResolvedValue(payload(body))
        const { getRateTable } = await freshFx()

        expect((await getRateTable('EUR')).source).toBe('static')
        expect(console.warn).toHaveBeenCalledWith('[fx] EUR rate feed refresh failed (rate feed payload unusable)')
    })

    it.each([
        ['a numeric rather than decimal-string rate', 4.1],
        ['zero', '0'],
        ['a negative rate', '-4.1'],
        ['exponent notation', '4.1e0'],
        ['more than eighteen fractional digits', '4.1234567890123456789'],
        ['a value above the wire bound', '10000000000000000000'],
    ])('rejects %s', async (_label, unitsPerBase) => {
        const body = feedBody('EUR', staticDirect('EUR'))
        const index = body.rates.findIndex((row) => row.code === 'CHF')
        body.rates[index] = { ...body.rates[index], unitsPerBase }
        fetchSpy.mockResolvedValue(payload(body))
        const { getRateTable } = await freshFx()

        expect((await getRateTable('EUR')).source).toBe('static')
    })

    it('rejects duplicate and unsorted rows instead of choosing one', async () => {
        const duplicate = feedBody('EUR', staticDirect('EUR'))
        duplicate.rates.push({ ...duplicate.rates[0] })
        fetchSpy.mockResolvedValueOnce(payload(duplicate))
        const first = await freshFx()
        expect((await first.getRateTable('EUR')).source).toBe('static')

        vi.resetModules()
        const unsorted = feedBody('EUR', staticDirect('EUR'))
        unsorted.rates.reverse()
        fetchSpy.mockResolvedValueOnce(payload(unsorted))
        const second = await import('@/server/fx')
        expect((await second.getRateTable('EUR')).source).toBe('static')
    })

    it('rejects more than 512 rows before building a table', async () => {
        const body = feedBody('EUR', staticDirect('EUR'))
        body.rates = Array.from({ length: 513 }, (_, index) => ({
            ...body.rates[0],
            code: `${String.fromCharCode(65 + Math.floor(index / 26 / 26))}${String.fromCharCode(
                65 + (Math.floor(index / 26) % 26)
            )}${String.fromCharCode(65 + (index % 26))}`,
        }))
        fetchSpy.mockResolvedValue(payload(body))
        const { getRateTable } = await freshFx()

        expect((await getRateTable('EUR')).source).toBe('static')
    })

    it('rejects a thin response before it can erase broad coverage', async () => {
        const body = feedBody('EUR', staticDirect('EUR'))
        body.rates = body.rates.slice(0, 149)
        fetchSpy.mockResolvedValue(payload(body))
        const { getRateTable } = await freshFx()

        expect((await getRateTable('EUR')).source).toBe('static')
    })

    it('rejects a response missing one core currency', async () => {
        const rates = { ...staticDirect('EUR') }
        delete rates.THB
        fetchSpy.mockResolvedValue(feed('EUR', rates))
        const { getRateTable } = await freshFx()

        expect((await getRateTable('EUR')).source).toBe('static')
        expect(console.warn).toHaveBeenCalledWith(
            '[fx] EUR rate feed refresh failed (rate feed missing core currencies)'
        )
    })

    it('validates unknown rows before filtering them from Split storage', async () => {
        const body = feedBody('EUR', { ...staticDirect('EUR'), QZZ: 1 })
        const index = body.rates.findIndex((row) => row.code === 'QZZ')
        body.rates[index] = { ...body.rates[index], selection: 'mixed' }
        fetchSpy.mockResolvedValue(payload(body))
        const { getRateTable } = await freshFx()

        expect((await getRateTable('EUR')).source).toBe('static')
    })

    it('omits a catalog cross the DB cannot persist, rather than deriving another route', async () => {
        fetchSpy.mockResolvedValue(feed('EUR', { ...staticDirect('EUR'), INR: 1e-13 }))
        const { getRateTable, rateFrom } = await freshFx()

        const table = await getRateTable('EUR')
        expect(table.source).toBe('live')
        expect(rateFrom(table, 'INR', 'EUR')).toBeNull()
    })

    it('stops reading a chunked response after 256 KiB', async () => {
        fetchSpy.mockResolvedValue(
            payload({ ...feedBody('EUR', staticDirect('EUR')), padding: 'x'.repeat(256 * 1024) })
        )
        const { getRateTable } = await freshFx()

        expect((await getRateTable('EUR')).source).toBe('static')
    })

    it('rejects an oversized declared body before reading it', async () => {
        fetchSpy.mockResolvedValue(
            new Response(JSON.stringify(feedBody('EUR', staticDirect('EUR'))), {
                status: 200,
                headers: { 'Content-Length': String(256 * 1024 + 1) },
            })
        )
        const { getRateTable } = await freshFx()

        expect((await getRateTable('EUR')).source).toBe('static')
    })

    it('uses a complete last-known table when refresh fails', async () => {
        const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000)
        await seed('EUR', [...coreRows('EUR', yesterday), { quote: 'INR', basePerUnit: 0.011, fetchedAt: yesterday }])
        fetchSpy.mockRejectedValue(new Error('upstream down'))
        const { getRateTable } = await freshFx()

        const table = await getRateTable('EUR')
        expect(table.source).toBe('cache')
        expect(table.basePerUnit.INR).toBeCloseTo(0.011, 12)
    })

    it('does not serve a complete cache after its seven-day ceiling', async () => {
        const eightDays = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
        await seed('EUR', coreRows('EUR', eightDays))
        fetchSpy.mockRejectedValue(new Error('upstream down'))
        const { getRateTable } = await freshFx()

        expect((await getRateTable('EUR')).source).toBe('static')
    })
})

describe('mirrored writes stay within one base', () => {
    it('writes direct rates under the requested base and preserves another base', async () => {
        await seed('USD', coreRows('USD'))
        fetchSpy.mockResolvedValue(feed('EUR', { ...staticDirect('EUR'), INR: 0.011, KWD: 3.1 }))
        const { getRateTable } = await freshFx()

        await getRateTable('EUR')
        const eurRows = await prisma.fxRate.findMany({ where: { base: 'EUR' } })
        expect(eurRows).toHaveLength(FX_CORE.length + 2)
        expect(Number(eurRows.find((row) => row.quote === 'INR')!.rate)).toBeCloseTo(0.011, 12)
        expect(await prisma.fxRate.count({ where: { base: 'USD' } })).toBe(FX_CORE.length)
    })

    it('deletes a dropped quote only from the refreshed base', async () => {
        const stale = new Date(Date.now() - 25 * 60 * 60 * 1000)
        await seed('EUR', [...coreRows('EUR', stale), { quote: 'SEK', basePerUnit: 0.09, fetchedAt: stale }])
        await seed('GBP', [...coreRows('GBP'), { quote: 'SEK', basePerUnit: 0.08 }])
        const { getRateTable } = await freshFx()

        await getRateTable('EUR')
        expect(await prisma.fxRate.findFirst({ where: { base: 'EUR', quote: 'SEK' } })).toBeNull()
        expect(await prisma.fxRate.findFirst({ where: { base: 'GBP', quote: 'SEK' } })).not.toBeNull()
    })
})

describe('single-flight and backoff are keyed by base', () => {
    it('coalesces concurrent requests for one base', async () => {
        const { getRateTable } = await freshFx()

        const tables = await Promise.all([
            getRateTable('EUR'),
            getRateTable('EUR'),
            getRateTable('EUR'),
            getRateTable('EUR'),
        ])
        expect(fetchSpy).toHaveBeenCalledTimes(1)
        expect(tables.every((table: RateTable) => table.base === 'EUR' && table.source === 'live')).toBe(true)
    })

    it('does not coalesce different destination bases', async () => {
        const { getRateTable } = await freshFx()

        const [eur, gbp] = await Promise.all([getRateTable('EUR'), getRateTable('GBP')])
        expect(fetchSpy).toHaveBeenCalledTimes(2)
        expect(eur.base).toBe('EUR')
        expect(gbp.base).toBe('GBP')
    })

    it('does not let one base failure back off another base', async () => {
        fetchSpy.mockImplementation(async (input: string | URL | Request) => {
            const base = new URL(String(input)).searchParams.get('base')!
            if (base === 'EUR') throw new Error('EUR unavailable')
            return feed(base, staticDirect(base))
        })
        const { getRateTable } = await freshFx()

        expect((await getRateTable('EUR')).source).toBe('static')
        expect((await getRateTable('GBP')).source).toBe('live')
        expect(fetchSpy).toHaveBeenCalledTimes(2)
    })

    it('releases a failed flight so a later cache read can recover', async () => {
        fetchSpy.mockRejectedValueOnce(new Error('upstream down'))
        const { getRateTable } = await freshFx()

        expect((await getRateTable('EUR')).source).toBe('static')
        await seed('EUR', coreRows('EUR'))
        expect((await getRateTable('EUR')).source).toBe('cache')
    })
})

describe('static fallback is materialized per base', () => {
    it('prices every pinned quote directly into a pinned base', async () => {
        process.env.SPLIT_FX_MODE = 'static'
        const { getRateTable, rateFrom } = await freshFx()
        const table = await getRateTable('EUR')

        expect(table).toMatchObject({ base: 'EUR', source: 'static' })
        expect(rateFrom(table, 'THB', 'EUR')).toBeCloseTo(0.028 / 1.08, 12)
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('gives a non-pinned catalog base identity but invents no cross', async () => {
        process.env.SPLIT_FX_MODE = 'static'
        const { getRateTable, rateFrom } = await freshFx()
        const table = await getRateTable('PLN')

        expect(rateFrom(table, 'PLN', 'PLN')).toBe(1)
        expect(rateFrom(table, 'EUR', 'PLN')).toBeNull()
    })
})
