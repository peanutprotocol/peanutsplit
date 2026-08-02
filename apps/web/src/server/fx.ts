/**
 * Indicative FX. Live rates come from open.er-api.com (free, no key), are cached
 * for 24h in the FxRate table, and fall back to the static catalog table when the
 * fetch fails. Rates are indicative — surfaces that show one must say so.
 */
import { prisma } from '@/server/db'
import { badRequest } from '@/server/http'
import { convertMinorAtRate, isCatalogCode, STATIC_USD_PER_UNIT } from '@/server/money'

const RATE_URL = 'https://open.er-api.com/v6/latest/USD'
const TTL_MS = 24 * 60 * 60 * 1000
/**
 * A cached rate this old never prices money again, whatever else is true.
 *
 * The TTL says when to TRY a refresh; this says when a row stops being an answer. It is longer
 * than the TTL on purpose, because the two guard different things: a short upstream outage must
 * not drop 150 currencies to the twelve static rates, and a week-old number must not be quoted as
 * a rate. Without a ceiling the age of a row is unbounded — the feed drops a code, nothing
 * refreshes it, nothing deletes it, and it keeps converting at whatever it was worth in the past.
 */
const MAX_RATE_AGE_MS = 7 * 24 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 4000
/** Don't re-hit a failing upstream on every request. */
const FAILURE_BACKOFF_MS = 10 * 60 * 1000

/**
 * The 12 codes every existing prod room uses.
 *
 * Freshness is judged against THIS set and never against the whole catalog, and that distinction
 * is the whole reason the constant exists. Four catalog codes (CUC, KPW, SVC, XSU) are not in the
 * feed and never will be, so "every catalog code is cached" is permanently false — which would
 * make the cache never look fresh, re-fetch on every single request, and drop to the 12-rate
 * static table the moment upstream blinked.
 */
export const FX_CORE: readonly string[] = [
    'USD',
    'EUR',
    'GBP',
    'ARS',
    'BRL',
    'MXN',
    'COP',
    'CHF',
    'THB',
    'JPY',
    'AUD',
    'CAD',
]

export type RateSource = 'live' | 'cache' | 'static'

export interface RateTable {
    /** USD per 1 major unit of the currency. Keys are always a subset of the catalog. */
    usdPerUnit: Record<string, number>
    source: RateSource
    fetchedAt: Date | null
}

const STATIC_TABLE: RateTable = {
    usdPerUnit: { ...STATIC_USD_PER_UNIT },
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
        for (const [code, perUsd] of Object.entries(body.rates)) {
            // Catalog codes only. The feed carries CNH, IMP, JEP and five other non-ISO codes;
            // without this, somebody who typed one as a made-up ticker would silently pick up a
            // real rate for it — which is the exact surprise this whole change exists to prevent.
            if (!isCatalogCode(code)) continue
            if (typeof perUsd === 'number' && Number.isFinite(perUsd) && perUsd > 0) out[code] = 1 / perUsd
        }
        // A payload missing one of the twelve is truncated or broken, not merely thin. Codes
        // outside the core are simply absent, which is what lets the catalog be wider than the feed.
        if (!FX_CORE.every((code) => typeof out[code] === 'number'))
            throw new Error('rate feed missing core currencies')
        return out
    } catch {
        lastFailedFetchAt = Date.now()
        return null
    }
}

/**
 * One refresh at a time per process.
 *
 * N cold requests would otherwise each run their own fetch and their own 162-row write. This is a
 * mitigation and not a fix — the deploy is containers, so it is per-process — and it must clear on
 * rejection, or one failed refresh pins every later request to the same rejected promise.
 */
let inflight: Promise<RateTable> | null = null

/** Cached rates, refreshed at most once per TTL. Never throws — worst case static. */
export function getRateTable(): Promise<RateTable> {
    if (remoteDisabled()) return Promise.resolve(STATIC_TABLE)
    if (!inflight) {
        inflight = loadRateTable().finally(() => {
            inflight = null
        })
    }
    return inflight
}

async function loadRateTable(): Promise<RateTable> {
    let rows: { quote: string; rate: unknown; fetchedAt: Date }[] = []
    try {
        rows = await prisma.fxRate.findMany({ where: { base: 'USD' } })
    } catch {
        return STATIC_TABLE
    }

    const cached: Record<string, number> = {}
    let oldestCore: Date | null = null
    const now = Date.now()
    for (const row of rows) {
        // The live branch filters to the catalog; the cache read has to as well, or a code that
        // has since left the catalog stays priceable from a row nothing ever deletes.
        if (!isCatalogCode(row.quote)) continue
        // Per row, not per table. `oldestCore` decides when to refresh and deliberately ignores
        // non-core rows; without this, a code the feed stopped carrying would be priced forever
        // from the last rate it ever had, because no core row is old enough to trigger anything.
        if (now - row.fetchedAt.getTime() >= MAX_RATE_AGE_MS) continue
        const rate = Number(row.rate)
        if (!Number.isFinite(rate) || rate <= 0) continue
        cached[row.quote] = rate
        // Over the core only: a code the feed stops carrying keeps its row forever with an old
        // timestamp, and one of those would pin the age of the whole table in the past.
        if (FX_CORE.includes(row.quote) && (!oldestCore || row.fetchedAt < oldestCore)) oldestCore = row.fetchedAt
    }
    const complete = FX_CORE.every((code) => typeof cached[code] === 'number')
    const fresh = complete && oldestCore !== null && Date.now() - oldestCore.getTime() < TTL_MS
    if (fresh) return { usdPerUnit: cached, source: 'cache', fetchedAt: oldestCore }

    const live = await fetchUsdPerUnit()
    if (!live) {
        if (complete && oldestCore) return { usdPerUnit: cached, source: 'cache', fetchedAt: oldestCore }
        return STATIC_TABLE
    }

    const fetchedAt = new Date()
    try {
        await writeRates(live, fetchedAt)
    } catch {
        // Cache write is best-effort; the rates we just fetched are still good.
    }
    return { usdPerUnit: live, source: 'live', fetchedAt }
}

/**
 * The cache is made to mirror the payload — two statements, one transaction.
 *
 * 162 upserts inside a transaction is 162 round trips on the request path of whichever unlucky
 * request lost the cache race, so the write is one statement over `unnest`. Ids are generated here
 * rather than by `gen_random_uuid()` because `FxRate.id` is application-side (`@default(uuid())`)
 * and the column has no database default. Rates cross as text and are cast to numeric in the
 * database, so no float is parsed twice.
 *
 * The DELETE is what stops a dropped code being priced forever. Keeping a row the feed no longer
 * carries made the same request answer two different ways: inside the TTL the cache branch served
 * the old rate, the one request that crossed the TTL took the live branch and returned a 400, and
 * the refresh put the cache back the way it was so the next request succeeded again. `fetchUsdPerUnit`
 * refuses any payload missing an `FX_CORE` code, so a truncated response cannot reach here and
 * empty the table.
 */
async function writeRates(usdPerUnit: Record<string, number>, fetchedAt: Date): Promise<void> {
    const entries = Object.entries(usdPerUnit)
    if (entries.length === 0) return
    const ids = entries.map(() => crypto.randomUUID())
    const quotes = entries.map(([quote]) => quote)
    const rates = entries.map(([, rate]) => rate.toFixed(12))

    await prisma.$transaction([
        prisma.$executeRaw`
            INSERT INTO split."FxRate" (id, base, quote, rate, "fetchedAt")
            SELECT q.id, 'USD', q.quote, q.rate::numeric, ${fetchedAt}
            FROM unnest(${ids}::text[], ${quotes}::text[], ${rates}::text[]) AS q(id, quote, rate)
            ON CONFLICT (base, quote) DO UPDATE
                SET rate = EXCLUDED.rate, "fetchedAt" = EXCLUDED."fetchedAt"
        `,
        prisma.$executeRaw`DELETE FROM split."FxRate" WHERE base = 'USD' AND quote <> ALL(${quotes}::text[])`,
    ])
}

/**
 * Major units of `to` per 1 major unit of `from`, or **null** when the pair cannot be priced.
 *
 * Null, never 1. A silent 1:1 between two currencies that have no rate is the one failure this
 * whole area exists to make impossible, so the absence of a rate has to be a value the caller is
 * forced to handle rather than a plausible-looking number.
 *
 * `from === to` is 1 by identity, checked before any lookup, so a room settling in a custom
 * ticker always accepts its own expenses.
 */
export function rateFrom(table: RateTable, from: string, to: string): number | null {
    if (from === to) return 1
    const f = table.usdPerUnit[from]
    const t = table.usdPerUnit[to]
    if (!f || !t) return null
    return f / t
}

/** The same lookup on a write path, where "no rate" is a 400 and not an option. */
export function requireRate(table: RateTable, from: string, to: string): number {
    const rate = rateFrom(table, from, to)
    if (rate === null) throw badRequest(`no exchange rate for ${from} → ${to}`, 'NO_RATE')
    return rate
}

export async function getRate(from: string, to: string): Promise<{ rate: number | null; source: RateSource }> {
    const table = await getRateTable()
    return { rate: rateFrom(table, from, to), source: table.source }
}

/** Convert minor units at the current cached rate. */
export async function convertMinor(amountMinor: bigint, from: string, to: string): Promise<bigint> {
    if (from === to) return amountMinor
    const table = await getRateTable()
    return convertMinorAtRate(amountMinor, from, to, requireRate(table, from, to))
}
