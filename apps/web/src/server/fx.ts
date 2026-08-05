/**
 * Indicative FX. Live display-sell rates come from Peanut's backend, are cached
 * for 24h in the FxRate table, and fall back to the static catalog table when the
 * fetch fails. Rates are indicative — surfaces that show one must say so.
 */
import { prisma } from '@/server/db'
import { egressFetch } from '@/server/egress'
import { badRequest } from '@/server/http'
import { convertMinorAtRate, isCatalogCode, STATIC_USD_PER_UNIT } from '@/server/money'

const RATE_URL = 'https://api.peanut.me/fx/rates?base=USD'
const TTL_MS = 24 * 60 * 60 * 1000
/**
 * A cached rate this old never prices money again, whatever else is true.
 *
 * The TTL says when to TRY a refresh; this says when a row stops being an answer. It is longer
 * than the TTL on purpose, because the two guard different things: a short upstream outage must
 * not drop most currencies to the twelve static rates, and a week-old number must not be quoted as
 * a rate. Without a ceiling the age of a row is unbounded — the feed drops a code, nothing
 * refreshes it, nothing deletes it, and it keeps converting at whatever it was worth in the past.
 */
const MAX_RATE_AGE_MS = 7 * 24 * 60 * 60 * 1000
// The API's cold reference/provider work is itself bounded at three seconds.
// Leave enough budget for the Squid CONNECT and normal network latency around it.
const FETCH_TIMEOUT_MS = 6000
/** Avoid a request storm without pinning a transient cold-start failure for ten minutes. */
const FAILURE_BACKOFF_MS = 60 * 1000
/** The backend currently serves about 200 ISO rates. This bound leaves room for
 *  the catalog to grow while refusing an accidentally unbounded response. */
const MIN_RATE_ROWS = 150
const MAX_RATE_ROWS = 512
const MAX_RATE_RESPONSE_BYTES = 256 * 1024
const MAX_RATE_DECIMAL_CHARS = 64
const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000
/** Producer contract bounds. Their reciprocals also fit FxRate Decimal(24,12). */
const MIN_UNITS_PER_USD = 1e-9
const MAX_UNITS_PER_USD = 1e9
/** A non-identity leg must describe a recently observed market, not merely a
 * recently assembled snapshot containing a historic quote. */
const MAX_EFFECTIVE_AT_AGE_MS = 30 * 24 * 60 * 60 * 1000
/** Expense.fxRate Decimal(24,12) must remain positive after quantisation and
 * leave fewer than twelve whole digits. Extreme crosses are unavailable rather
 * than becoming a database overflow or a rounded-to-zero conversion. */
const MIN_PERSISTABLE_CROSS_RATE = 1e-12
const MAX_PERSISTABLE_CROSS_RATE = 1e12
const RATE_DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/
const RATE_CODE = /^[A-Z]{3,4}$/
const RATE_SOURCES = new Set(['identity', 'bridge', 'manteca', 'reference'])

/**
 * The 12 codes every existing prod room uses.
 *
 * Freshness is judged against THIS set and never against the whole catalog, and that distinction
 * is the whole reason the constant exists. Six catalog codes are not in the current provider
 * snapshot, so "every catalog code is cached" is permanently false — which would
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

/** Keep diagnostics useful without printing a response body, proxy URL or an
 *  unbounded upstream exception. Messages created in this module are safe; all
 *  other failures collapse to their class name. */
const failureDetail = (error: unknown): string => {
    if (!(error instanceof Error)) return 'unknown'
    const detail = error.message.startsWith('rate feed ') ? error.message : error.name
    return detail.slice(0, 120)
}

interface LiveRateSnapshot {
    usdPerUnit: Record<string, number>
    generatedAt: Date
}

type JsonObject = Record<string, unknown>

const isObject = (value: unknown): value is JsonObject =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

/** The producer promises canonical `Date.toISOString()` instants. Requiring
 *  that one spelling keeps ambiguous local dates and permissive Date parsing
 *  out of the cache's freshness boundary. */
const canonicalInstant = (value: unknown): Date | null => {
    if (typeof value !== 'string' || value.length !== 24) return null
    const instant = new Date(value)
    if (!Number.isFinite(instant.getTime()) || instant.toISOString() !== value) return null
    return instant
}

const unusablePayload = (): never => {
    throw new Error('rate feed payload unusable')
}

/** Read the upstream stream with a real byte ceiling. `Content-Length` is only
 *  a fast path: chunked responses are counted as they arrive and cancelled as
 *  soon as they cross the cap. */
async function readLivePayload(response: Awaited<ReturnType<typeof egressFetch>>): Promise<unknown> {
    const declared = Number(response.headers.get('content-length') ?? 0)
    if (Number.isFinite(declared) && declared > MAX_RATE_RESPONSE_BYTES) return unusablePayload()
    if (!response.body) return unusablePayload()

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let text = ''
    let seen = 0
    try {
        for (;;) {
            const { value, done } = await reader.read()
            if (done) break
            seen += value.byteLength
            if (seen > MAX_RATE_RESPONSE_BYTES) return unusablePayload()
            text += decoder.decode(value, { stream: true })
        }
    } finally {
        await reader.cancel().catch(() => {})
    }
    text += decoder.decode()

    try {
        return JSON.parse(text)
    } catch {
        return unusablePayload()
    }
}

/** Peanut returns quote-currency units per 1 USD. Split stores the inverse so
 *  its existing reciprocal cross-rate table remains unchanged. */
function parseLiveSnapshot(body: unknown): LiveRateSnapshot {
    if (!isObject(body)) return unusablePayload()
    if (body.base !== 'USD' || body.basis !== 'display_sell' || body.indicative !== true) return unusablePayload()

    const generatedAt = canonicalInstant(body.generatedAt)
    if (!generatedAt) return unusablePayload()
    const snapshotAge = Date.now() - generatedAt.getTime()
    // A successful upstream response must itself be fresh. The seven-day ceiling below is for
    // Split's last known-good cache during an outage, not permission to re-cache an old snapshot.
    if (snapshotAge >= TTL_MS || snapshotAge < -MAX_FUTURE_CLOCK_SKEW_MS) return unusablePayload()

    if (!Array.isArray(body.rates) || body.rates.length < MIN_RATE_ROWS || body.rates.length > MAX_RATE_ROWS)
        return unusablePayload()

    const usdPerUnit: Record<string, number> = {}
    let previousCode = ''
    const now = Date.now()
    for (const value of body.rates) {
        if (!isObject(value)) return unusablePayload()
        const { code, unitsPerBase, source, effectiveAt } = value
        if (typeof code !== 'string' || !RATE_CODE.test(code) || code <= previousCode) return unusablePayload()
        previousCode = code
        if (typeof source !== 'string' || !RATE_SOURCES.has(source)) return unusablePayload()
        if (
            typeof unitsPerBase !== 'string' ||
            unitsPerBase.length === 0 ||
            unitsPerBase.length > MAX_RATE_DECIMAL_CHARS ||
            !RATE_DECIMAL.test(unitsPerBase)
        )
            return unusablePayload()

        const perUsd = Number(unitsPerBase)
        if (!Number.isFinite(perUsd) || perUsd < MIN_UNITS_PER_USD || perUsd > MAX_UNITS_PER_USD)
            return unusablePayload()
        if (code === 'USD') {
            if (perUsd !== 1 || source !== 'identity' || effectiveAt !== null) return unusablePayload()
        } else {
            if (source === 'identity' || effectiveAt === null) return unusablePayload()
            const effective = canonicalInstant(effectiveAt)
            if (!effective) return unusablePayload()
            const effectiveAge = now - effective.getTime()
            if (effectiveAge > MAX_EFFECTIVE_AT_AGE_MS || effectiveAge < -MAX_FUTURE_CLOCK_SKEW_MS)
                return unusablePayload()
        }

        // The backend also carries codes outside Split's ICU catalog. Validate every row first,
        // then filter them, so malformed producer output cannot hide behind an unknown code.
        if (isCatalogCode(code)) {
            const inverse = 1 / perUsd
            if (!Number.isFinite(inverse) || inverse <= 0) return unusablePayload()
            usdPerUnit[code] = inverse
        }
    }
    if (!FX_CORE.every((code) => typeof usdPerUnit[code] === 'number'))
        throw new Error('rate feed missing core currencies')
    return { usdPerUnit, generatedAt }
}

async function fetchUsdPerUnit(): Promise<LiveRateSnapshot | null> {
    if (remoteDisabled()) return null
    if (Date.now() - lastFailedFetchAt < FAILURE_BACKOFF_MS) return null
    try {
        const res = await egressFetch(process.env.SPLIT_FX_PROXY_URL, RATE_URL, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        })
        if (!res.ok) throw new Error(`rate feed responded ${res.status}`)
        return parseLiveSnapshot(await readLivePayload(res))
    } catch (error) {
        lastFailedFetchAt = Date.now()
        console.warn(`[fx] rate feed refresh failed (${failureDetail(error)})`)
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
    } catch (error) {
        console.warn(`[fx] rate cache read failed (${failureDetail(error)})`)
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
        if (!Number.isFinite(rate) || rate < MIN_UNITS_PER_USD || rate > MAX_UNITS_PER_USD) continue
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

    try {
        await writeRates(live.usdPerUnit, live.generatedAt)
    } catch (error) {
        // Cache write is best-effort; the rates we just fetched are still good.
        console.warn(`[fx] rate cache write failed (${failureDetail(error)})`)
    }
    return { usdPerUnit: live.usdPerUnit, source: 'live', fetchedAt: live.generatedAt }
}

/**
 * The cache is made to mirror the payload — two statements, one transaction.
 *
 * One upsert per carried rate would put hundreds of round trips on the request path of whichever
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
    const rate = f / t
    if (!Number.isFinite(rate) || rate < MIN_PERSISTABLE_CROSS_RATE || rate >= MAX_PERSISTABLE_CROSS_RATE) return null
    return rate
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
