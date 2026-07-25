/**
 * Indicative FX. Live rates come from open.er-api.com (free, no key), are cached
 * for 24h in the FxRate table, and fall back to the static catalog table when the
 * fetch fails. Rates are indicative — surfaces that show one must say so.
 */
import { prisma } from '@/server/db'
import { CURRENCIES, CURRENCY_CODES, convertMinorAtRate, currency } from '@/server/money'

const RATE_URL = 'https://open.er-api.com/v6/latest/USD'
const TTL_MS = 24 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 4000
/** Don't re-hit a failing upstream on every request. */
const FAILURE_BACKOFF_MS = 10 * 60 * 1000

export type RateSource = 'live' | 'cache' | 'static'

export interface RateTable {
    /** USD per 1 major unit of the currency. */
    usdPerUnit: Record<string, number>
    source: RateSource
    fetchedAt: Date | null
}

const STATIC_TABLE: RateTable = {
    usdPerUnit: Object.fromEntries(CURRENCIES.map((c) => [c.code, c.usdPerUnit])),
    source: 'static',
    fetchedAt: null,
}

let lastFailedFetchAt = 0

const remoteDisabled = () => process.env.SPLIT_FX_MODE === 'static'

/** open.er-api.com returns "units of X per 1 USD"; we store the inverse. */
async function fetchUsdPerUnit(): Promise<Record<string, number> | null> {
    if (remoteDisabled()) return null
    if (Date.now() - lastFailedFetchAt < FAILURE_BACKOFF_MS) return null
    try {
        const res = await fetch(RATE_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
        if (!res.ok) throw new Error(`rate feed responded ${res.status}`)
        const body = (await res.json()) as { result?: string; rates?: Record<string, number> }
        if (body.result !== 'success' || !body.rates) throw new Error('rate feed payload unusable')
        const out: Record<string, number> = {}
        for (const code of CURRENCY_CODES) {
            const perUsd = body.rates[code]
            if (typeof perUsd === 'number' && perUsd > 0) out[code] = 1 / perUsd
        }
        // A partial table would silently mix live and static rates — reject it.
        if (Object.keys(out).length !== CURRENCY_CODES.length) throw new Error('rate feed missing currencies')
        return out
    } catch {
        lastFailedFetchAt = Date.now()
        return null
    }
}

/** Cached rates, refreshed at most once per TTL. Never throws — worst case static. */
export async function getRateTable(): Promise<RateTable> {
    let rows: { quote: string; rate: unknown; fetchedAt: Date }[] = []
    try {
        rows = await prisma.fxRate.findMany({ where: { base: 'USD' } })
    } catch {
        return STATIC_TABLE
    }

    const cached: Record<string, number> = {}
    let oldest: Date | null = null
    for (const row of rows) {
        cached[row.quote] = Number(row.rate)
        if (!oldest || row.fetchedAt < oldest) oldest = row.fetchedAt
    }
    const complete = CURRENCY_CODES.every((code) => typeof cached[code] === 'number')
    const fresh = complete && oldest !== null && Date.now() - oldest.getTime() < TTL_MS
    if (fresh) return { usdPerUnit: cached, source: 'cache', fetchedAt: oldest }

    const live = await fetchUsdPerUnit()
    if (!live) {
        if (complete && oldest) return { usdPerUnit: cached, source: 'cache', fetchedAt: oldest }
        return STATIC_TABLE
    }

    const fetchedAt = new Date()
    try {
        await prisma.$transaction(
            Object.entries(live).map(([quote, rate]) =>
                prisma.fxRate.upsert({
                    where: { base_quote: { base: 'USD', quote } },
                    create: { base: 'USD', quote, rate, fetchedAt },
                    update: { rate, fetchedAt },
                })
            )
        )
    } catch {
        // Cache write is best-effort; the rates we just fetched are still good.
    }
    return { usdPerUnit: live, source: 'live', fetchedAt }
}

/** Major units of `to` per 1 major unit of `from`. */
export function rateFrom(table: RateTable, from: string, to: string): number {
    if (from === to) return 1
    const f = table.usdPerUnit[currency(from).code]
    const t = table.usdPerUnit[currency(to).code]
    if (!f || !t) throw new Error(`no rate for ${from} → ${to}`)
    return f / t
}

export async function getRate(from: string, to: string): Promise<{ rate: number; source: RateSource }> {
    const table = await getRateTable()
    return { rate: rateFrom(table, from, to), source: table.source }
}

/** Convert minor units at the current cached rate. */
export async function convertMinor(amountMinor: bigint, from: string, to: string): Promise<bigint> {
    if (from === to) return amountMinor
    const table = await getRateTable()
    return convertMinorAtRate(amountMinor, from, to, rateFrom(table, from, to))
}
