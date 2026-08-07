/**
 * Indicative FX. Peanut resolves each requested room-currency table with the
 * same all-provider-or-all-reference policy used by Peanut UI. Split stores
 * those direct quote→room rates for 24h and never reconstructs a different pair
 * by crossing unrelated rows locally.
 */
import { prisma } from '@/server/db'
import { egressFetch } from '@/server/egress'
import { badRequest } from '@/server/http'
import { convertMinorAtRate, isCatalogCode, STATIC_USD_PER_UNIT } from '@/server/money'

// Overridable so staging can be pointed at a staging API. Production egress is
// default-deny, so the call rides the pinned squid proxy exactly like the model
// scan does — without SPLIT_FX_PROXY_URL set, and api.peanut.me on the squid
// CONNECT-443 allowlist, every refresh fails and the table silently degrades to
// the twelve static rates. See the Deployment section of README.md.
const RATE_ENDPOINT = process.env.SPLIT_FX_ENDPOINT ?? 'https://api.peanut.me/fx/rates'
const TTL_MS = 24 * 60 * 60 * 1000
/** A cached rate this old never prices money again, even during an outage. */
const MAX_RATE_AGE_MS = 7 * 24 * 60 * 60 * 1000
// The API's cold provider/reference work is bounded at three seconds. Leave
// enough room for DNS, TLS and ordinary network latency around it.
const FETCH_TIMEOUT_MS = 6000
/** Avoid a request storm without pinning a transient cold-start failure. */
const FAILURE_BACKOFF_MS = 60 * 1000
const MIN_RATE_ROWS = 150
const MAX_RATE_ROWS = 512
const MAX_RATE_RESPONSE_BYTES = 256 * 1024
const MAX_RATE_DECIMAL_CHARS = 64
const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000
const MAX_EFFECTIVE_AT_AGE_MS = 30 * 24 * 60 * 60 * 1000
/** The API can describe wider pairs than Split's Decimal(24,12) column. */
const MIN_WIRE_RATE = 1e-18
const MAX_WIRE_RATE = 1e18
const MIN_PERSISTABLE_RATE = 1e-12
const MAX_PERSISTABLE_RATE = 1e12
const RATE_DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/
const RATE_CODE = /^[A-Z]{3,4}$/
const RATE_SELECTIONS = new Set(['identity', 'provider_pair', 'reference_pair'])
const LEG_SOURCES = new Set(['identity', 'bridge', 'manteca', 'reference'])
const PROVIDER_SOURCES = new Set(['bridge', 'manteca'])

const persistableRate = (value: number): number | null => {
    if (!Number.isFinite(value) || value < MIN_PERSISTABLE_RATE || value >= MAX_PERSISTABLE_RATE) return null
    const quantised = Number(value.toFixed(12))
    if (!Number.isFinite(quantised) || quantised < MIN_PERSISTABLE_RATE || quantised >= MAX_PERSISTABLE_RATE)
        return null
    return quantised
}

/** The 12 currencies guaranteed by Split's static outage table. */
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
    /** The only destination this table can price. */
    base: string
    /** Units of `base` per one major unit of each quote currency. */
    basePerUnit: Record<string, number>
    source: RateSource
    fetchedAt: Date | null
}

const staticTables = new Map<string, RateTable>()

/** Materialize the pinned USD fallback in the requested destination currency.
 * This is the one deliberate local cross: a fixed, reviewed outage table, not
 * independently selected live rows. */
function staticTableFor(baseInput: string): RateTable {
    const base = baseInput.toUpperCase()
    // Public rate previews also accept invented 3–4 character tickers for
    // same-currency identity. Never retain that attacker-controlled keyspace;
    // only the finite generated catalog belongs in the process cache.
    const cacheable = isCatalogCode(base)
    const existing = cacheable ? staticTables.get(base) : undefined
    if (existing) return existing

    const basePerUnit: Record<string, number> = { [base]: 1 }
    const usdPerBase = STATIC_USD_PER_UNIT[base]
    if (usdPerBase !== undefined) {
        for (const [quote, usdPerQuote] of Object.entries(STATIC_USD_PER_UNIT)) {
            basePerUnit[quote] = usdPerQuote / usdPerBase
        }
    }
    const table: RateTable = { base, basePerUnit, source: 'static', fetchedAt: null }
    if (cacheable) staticTables.set(base, table)
    return table
}

const lastFailedFetchAt = new Map<string, number>()
const inflight = new Map<string, Promise<RateTable>>()

const remoteDisabled = () => process.env.SPLIT_FX_MODE === 'static'

/** Keep diagnostics useful without printing a response body, request URL or an
 * unbounded upstream exception. */
const failureDetail = (error: unknown): string => {
    if (!(error instanceof Error)) return 'unknown'
    const detail = error.message.startsWith('rate feed ') ? error.message : error.name
    return detail.slice(0, 120)
}

interface LiveRateSnapshot {
    basePerUnit: Record<string, number>
    generatedAt: Date
}

type JsonObject = Record<string, unknown>

const isObject = (value: unknown): value is JsonObject =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

const canonicalInstant = (value: unknown): Date | null => {
    if (typeof value !== 'string' || value.length !== 24) return null
    const instant = new Date(value)
    if (!Number.isFinite(instant.getTime()) || instant.toISOString() !== value) return null
    return instant
}

const unusablePayload = (): never => {
    throw new Error('rate feed payload unusable')
}

/** Read a chunked response with a real byte ceiling; Content-Length is only a
 * fast path and is never trusted as the sole bound. */
async function readLivePayload(response: Response): Promise<unknown> {
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

type RateSelection = 'identity' | 'provider_pair' | 'reference_pair'
type LegSource = 'identity' | 'bridge' | 'manteca' | 'reference'

function validLegProvenance(currency: string, source: LegSource, selection: RateSelection): boolean {
    if (currency === 'USD') return source === 'identity'
    if (selection === 'reference_pair') return source === 'reference'
    if (selection === 'provider_pair') return PROVIDER_SOURCES.has(source)
    return false
}

/** Validate the complete base-specific response before selecting catalog rows.
 * `unitsPerBase` is quote units per room unit; the DB stores its inverse so a
 * source amount can be multiplied directly into the room currency. */
function parseLiveSnapshot(body: unknown, requestedBase: string): LiveRateSnapshot {
    if (!isObject(body)) return unusablePayload()
    if (
        body.base !== requestedBase ||
        body.basis !== 'display_sell' ||
        body.indicative !== true ||
        !Array.isArray(body.rates) ||
        body.rates.length < MIN_RATE_ROWS ||
        body.rates.length > MAX_RATE_ROWS
    )
        return unusablePayload()

    const generatedAt = canonicalInstant(body.generatedAt)
    if (!generatedAt) return unusablePayload()
    const snapshotAge = Date.now() - generatedAt.getTime()
    if (snapshotAge >= TTL_MS || snapshotAge < -MAX_FUTURE_CLOCK_SKEW_MS) return unusablePayload()

    const basePerUnit: Record<string, number> = {}
    let previousCode = ''
    const now = Date.now()
    for (const value of body.rates) {
        if (!isObject(value)) return unusablePayload()
        const { code, unitsPerBase, selection, baseSource, quoteSource, effectiveAt } = value
        if (typeof code !== 'string' || !RATE_CODE.test(code) || code <= previousCode) return unusablePayload()
        previousCode = code
        if (
            typeof selection !== 'string' ||
            !RATE_SELECTIONS.has(selection) ||
            typeof baseSource !== 'string' ||
            !LEG_SOURCES.has(baseSource) ||
            typeof quoteSource !== 'string' ||
            !LEG_SOURCES.has(quoteSource)
        )
            return unusablePayload()
        if (
            typeof unitsPerBase !== 'string' ||
            unitsPerBase.length === 0 ||
            unitsPerBase.length > MAX_RATE_DECIMAL_CHARS ||
            !RATE_DECIMAL.test(unitsPerBase)
        )
            return unusablePayload()

        const quotePerBase = Number(unitsPerBase)
        if (!Number.isFinite(quotePerBase) || quotePerBase < MIN_WIRE_RATE || quotePerBase > MAX_WIRE_RATE)
            return unusablePayload()

        const typedSelection = selection as RateSelection
        const typedBaseSource = baseSource as LegSource
        const typedQuoteSource = quoteSource as LegSource
        if (code === requestedBase) {
            if (
                quotePerBase !== 1 ||
                typedSelection !== 'identity' ||
                typedBaseSource !== 'identity' ||
                typedQuoteSource !== 'identity' ||
                effectiveAt !== null
            )
                return unusablePayload()
        } else {
            if (
                typedSelection === 'identity' ||
                !validLegProvenance(requestedBase, typedBaseSource, typedSelection) ||
                !validLegProvenance(code, typedQuoteSource, typedSelection)
            )
                return unusablePayload()
            const effective = canonicalInstant(effectiveAt)
            if (!effective) return unusablePayload()
            const effectiveAge = now - effective.getTime()
            if (effectiveAge > MAX_EFFECTIVE_AT_AGE_MS || effectiveAge < -MAX_FUTURE_CLOCK_SKEW_MS)
                return unusablePayload()
        }

        // Validate every producer row first. Only then select currencies Split
        // recognises, and omit crosses its Decimal column cannot represent.
        if (isCatalogCode(code)) {
            const directRate = persistableRate(1 / quotePerBase)
            if (directRate !== null) basePerUnit[code] = directRate
        }
    }

    const required = new Set([...FX_CORE, requestedBase])
    if (![...required].every((code) => typeof basePerUnit[code] === 'number')) {
        throw new Error('rate feed missing core currencies')
    }
    return { basePerUnit, generatedAt }
}

const rateUrl = (base: string): string => {
    const url = new URL(RATE_ENDPOINT)
    url.searchParams.set('base', base)
    return url.toString()
}

async function fetchBaseRates(base: string): Promise<LiveRateSnapshot | null> {
    if (remoteDisabled() || !isCatalogCode(base)) return null
    if (Date.now() - (lastFailedFetchAt.get(base) ?? 0) < FAILURE_BACKOFF_MS) return null
    try {
        const response = await egressFetch(process.env.SPLIT_FX_PROXY_URL, rateUrl(base), {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            redirect: 'error',
            credentials: 'omit',
            cache: 'no-store',
        })
        if (!response.ok) throw new Error(`rate feed responded ${response.status}`)
        const snapshot = parseLiveSnapshot(await readLivePayload(response), base)
        lastFailedFetchAt.delete(base)
        return snapshot
    } catch (error) {
        lastFailedFetchAt.set(base, Date.now())
        console.warn(`[fx] ${base} rate feed refresh failed (${failureDetail(error)})`)
        return null
    }
}

/** Cached rates for one destination, refreshed at most once per TTL. */
export function getRateTable(baseInput: string): Promise<RateTable> {
    const base = baseInput.toUpperCase()
    const fallback = staticTableFor(base)
    if (remoteDisabled() || !isCatalogCode(base)) return Promise.resolve(fallback)

    const existing = inflight.get(base)
    if (existing) return existing
    const request = loadRateTable(base, fallback).finally(() => {
        if (inflight.get(base) === request) inflight.delete(base)
    })
    inflight.set(base, request)
    return request
}

async function loadRateTable(base: string, fallback: RateTable): Promise<RateTable> {
    let rows: { quote: string; rate: unknown; fetchedAt: Date }[] = []
    try {
        rows = await prisma.fxRate.findMany({ where: { base } })
    } catch (error) {
        console.warn(`[fx] ${base} rate cache read failed (${failureDetail(error)})`)
        return fallback
    }

    const cached: Record<string, number> = {}
    const required = new Set([...FX_CORE, base])
    let oldestRequired: Date | null = null
    const now = Date.now()
    for (const row of rows) {
        if (!isCatalogCode(row.quote) || now - row.fetchedAt.getTime() >= MAX_RATE_AGE_MS) continue
        const rate = persistableRate(Number(row.rate))
        if (rate === null) continue
        if (row.quote === base && rate !== 1) continue
        cached[row.quote] = rate
        if (required.has(row.quote) && (!oldestRequired || row.fetchedAt < oldestRequired)) {
            oldestRequired = row.fetchedAt
        }
    }
    const complete = [...required].every((code) => typeof cached[code] === 'number')
    const fresh = complete && oldestRequired !== null && now - oldestRequired.getTime() < TTL_MS
    if (fresh) return { base, basePerUnit: cached, source: 'cache', fetchedAt: oldestRequired }

    const live = await fetchBaseRates(base)
    if (!live) {
        if (complete && oldestRequired) return { base, basePerUnit: cached, source: 'cache', fetchedAt: oldestRequired }
        return fallback
    }

    try {
        await writeRates(base, live.basePerUnit, live.generatedAt)
    } catch (error) {
        console.warn(`[fx] ${base} rate cache write failed (${failureDetail(error)})`)
    }
    return { base, basePerUnit: live.basePerUnit, source: 'live', fetchedAt: live.generatedAt }
}

/** Mirror one complete destination snapshot in two statements. */
async function writeRates(base: string, basePerUnit: Record<string, number>, fetchedAt: Date): Promise<void> {
    const entries = Object.entries(basePerUnit)
    if (entries.length === 0) return
    const ids = entries.map(() => crypto.randomUUID())
    const quotes = entries.map(([quote]) => quote)
    const rates = entries.map(([, rate]) => rate.toFixed(12))

    await prisma.$transaction([
        prisma.$executeRaw`
            INSERT INTO split."FxRate" (id, base, quote, rate, "fetchedAt")
            SELECT q.id, ${base}, q.quote, q.rate::numeric, ${fetchedAt}
            FROM unnest(${ids}::text[], ${quotes}::text[], ${rates}::text[]) AS q(id, quote, rate)
            ON CONFLICT (base, quote) DO UPDATE
                SET rate = EXCLUDED.rate, "fetchedAt" = EXCLUDED."fetchedAt"
        `,
        prisma.$executeRaw`DELETE FROM split."FxRate" WHERE base = ${base} AND quote <> ALL(${quotes}::text[])`,
    ])
}

/**
 * Units of `to` per one major unit of `from`, or null. A table can answer only
 * for its declared destination; crossing it into another base would silently
 * reintroduce the policy mismatch the base-specific API prevents.
 */
export function rateFrom(table: RateTable, from: string, to: string): number | null {
    if (from === to) return 1
    if (to !== table.base) return null
    return persistableRate(table.basePerUnit[from])
}

export function requireRate(table: RateTable, from: string, to: string): number {
    const rate = rateFrom(table, from, to)
    if (rate === null) throw badRequest(`no exchange rate for ${from} → ${to}`, 'NO_RATE')
    return rate
}

export async function getRate(from: string, to: string): Promise<{ rate: number | null; source: RateSource }> {
    const table = await getRateTable(to)
    return { rate: rateFrom(table, from, to), source: table.source }
}

/** Convert minor units at the current direct room-base rate. */
export async function convertMinor(amountMinor: bigint, from: string, to: string): Promise<bigint> {
    if (from === to) return amountMinor
    const table = await getRateTable(to)
    return convertMinorAtRate(amountMinor, from, to, requireRate(table, from, to))
}
