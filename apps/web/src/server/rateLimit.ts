/**
 * Per-IP token buckets for the unauthenticated write endpoints.
 *
 * Every mutation here is reachable by anyone holding a room link, so the only
 * thing standing between a script and a few hundred thousand rows is this file
 * (a review run created 300 rows in 2.9s). It is a courtesy limiter, not
 * security: the slug is the credential, and a determined attacker rotates IPs.
 *
 * State is in memory, per container. Two containers mean two allowances, and a
 * deploy resets the counters — both are fine for a limiter whose job is to stop
 * accidents and casual abuse. A shared store would mean Redis, which the
 * no-egress deploy would have to reach.
 */
import { ApiError } from '@/server/http'

export interface Limit {
    /** Burst size, and the number of requests allowed per window once drained. */
    capacity: number
    windowMs: number
}

const HOUR_MS = 60 * 60 * 1000

/** SPEC: 20/hour on room and member creation — the rows nobody can delete. */
export const CREATE_LIMIT: Limit = { capacity: 20, windowMs: HOUR_MS }
/** Bulk imports create hundreds or thousands of related rows at once, so they
 * get a separate, intentionally small courtesy bucket rather than borrowing
 * the ordinary room-creation allowance. */
export const IMPORT_LIMIT: Limit = { capacity: 5, windowMs: HOUR_MS }
/** Expenses and settlements are the normal traffic of a busy trip, so the ceiling
 *  only has to stop a runaway loop. */
export const WRITE_LIMIT: Limit = { capacity: 120, windowMs: HOUR_MS }
/** One catch-up command rewrites shares but creates no ledger row. Imported
 * rooms can legitimately contain 500 expenses. The allowance covers one full
 * review, a full conflict-safe Undo, and retry headroom without making ordinary
 * expense writes share that unusually large burst budget. */
export const CATCH_UP_LIMIT: Limit = { capacity: 1200, windowMs: HOUR_MS }
/** Missing room slugs are metered separately from normal polling. Once this
 *  budget is empty, preflight rejects every lookup so a caller cannot use the
 *  limiter response itself to distinguish an existing room from a missing one. */
export const LOOKUP_MISS_LIMIT: Limit = { capacity: 30, windowMs: HOUR_MS }
/** Event streams. Thirty an hour is a phone reconnecting all day; it is nowhere
 *  near the 2000 process-wide slots, which is the point — one client must not be
 *  able to hold every SSE slot on the box and silently demote every other room
 *  in the container to the slow poll. */
export const EVENTS_LIMIT: Limit = { capacity: 30, windowMs: HOUR_MS }

export interface Bucket {
    tokens: number
    updatedAt: number
    windowMs: number
}

/**
 * Continuous refill rather than a fixed window: `capacity` tokens come back over
 * `windowMs`, so a client that spends its burst still gets a steady trickle
 * instead of waiting out a cliff. Pure — the state goes in and comes back out,
 * which is the whole reason the maths is testable without a clock or a Map.
 */
export function takeToken(bucket: Bucket | undefined, limit: Limit, now: number): { allowed: boolean; next: Bucket } {
    const elapsed = bucket ? now - bucket.updatedAt : 0
    const refilled = bucket ? bucket.tokens + (elapsed / limit.windowMs) * limit.capacity : limit.capacity
    const tokens = Math.min(limit.capacity, refilled)
    if (tokens < 1) return { allowed: false, next: { tokens, updatedAt: now, windowMs: limit.windowMs } }
    return { allowed: true, next: { tokens: tokens - 1, updatedAt: now, windowMs: limit.windowMs } }
}

const buckets = new Map<string, Bucket>()

/** Ceiling on distinct keys — an IP costs ~100 bytes, so this is a few hundred KB
 *  even when saturated, and the map can never grow past it. */
const MAX_KEYS = 10_000
const PRUNE_INTERVAL_MS = 60_000
let lastPruneAt = 0

/** Drop buckets that have refilled to full: they are indistinguishable from a
 *  first-time visitor, so forgetting them changes no decision. */
function prune(now: number): void {
    if (now - lastPruneAt < PRUNE_INTERVAL_MS && buckets.size <= MAX_KEYS) return
    lastPruneAt = now
    for (const [key, bucket] of buckets) {
        if (now - bucket.updatedAt >= bucket.windowMs) buckets.delete(key)
    }
    // Only reachable with MAX_KEYS genuinely active IPs. Everyone gets a fresh
    // allowance, which is the deliberate failure direction — an unbounded map is
    // a worse outage than a limiter that forgets.
    if (buckets.size > MAX_KEYS) buckets.clear()
}

/**
 * The app sits behind Traefik, so `request.ip` is the proxy for every caller.
 * The first `x-forwarded-for` hop is the client; the rest are proxies. It is
 * spoofable — see the file header on what this limiter is and isn't for.
 */
export function clientIp(request: Request): string {
    const forwarded = request.headers.get('x-forwarded-for')
    if (forwarded) {
        const first = forwarded.split(',')[0]?.trim()
        if (first) return first
    }
    return request.headers.get('x-real-ip')?.trim() || 'unknown'
}

/** The generic 429. A caller with a more specific sentence passes its own — see
 *  `enforceRateLimitOn`. */
const rateLimited = () =>
    new ApiError(429, 'RATE_LIMITED', 'that was a lot of requests — give it a minute and try again')

/** Throws a 429 the same way every other failure leaves a route. */
export function enforceRateLimit(request: Request, limit: Limit, scope: string): void {
    const now = Date.now()
    prune(now)
    const key = `${scope}:${clientIp(request)}`
    const { allowed, next } = takeToken(buckets.get(key), limit, now)
    buckets.set(key, next)
    if (!allowed) throw rateLimited()
}

/**
 * Check a bucket without spending an allowed token. Room reads use this before
 * touching the database: ordinary polling stays free while budget remains, but
 * an exhausted miss bucket rejects both valid and invalid slugs before either
 * can be revealed.
 */
export function enforceRateLimitPreflight(request: Request, limit: Limit, scope: string): void {
    const now = Date.now()
    prune(now)
    const key = `${scope}:${clientIp(request)}`
    const { allowed, next } = takeToken(buckets.get(key), limit, now)
    if (!allowed) {
        buckets.set(key, next)
        throw rateLimited()
    }
}

/** The one bucket name every room lookup shares. It only hides room existence
 *  while every path that can 404 on a slug spends from the SAME budget. */
export const LOOKUP_MISS_SCOPE = 'room-lookup-miss'

/**
 * Run a room lookup with its misses metered on the shared miss budget.
 *
 * A guessed slug answers 404 and a real slug with a bad token answers 403, so any
 * route that loads a room by slug is a room-existence oracle unless the misses
 * are budgeted — 30 an hour, not the 120 of whatever write limiter the route also
 * carries. Preflight first, because an exhausted budget has to reject hits and
 * misses alike; a token is spent only when the lookup actually missed.
 */
export async function meterRoomLookup<T>(request: Request, lookup: () => Promise<T>): Promise<T> {
    enforceRateLimitPreflight(request, LOOKUP_MISS_LIMIT, LOOKUP_MISS_SCOPE)
    try {
        return await lookup()
    } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
            enforceRateLimit(request, LOOKUP_MISS_LIMIT, LOOKUP_MISS_SCOPE)
        }
        throw error
    }
}

/** Tests share one process, and a leaked bucket would fail a later test for a
 *  reason that has nothing to do with it. */
export function resetRateLimits(): void {
    buckets.clear()
    lastPruneAt = 0
}
// ── accounts wave ────────────────────────────────────────────────────────────

/**
 * Same limiter, keyed by something other than an IP — the authenticated auth
 * routes budget per account, because one signed-in user behind a shared NAT
 * should not spend their office's allowance. Deliberately the same map, so the
 * `MAX_KEYS` ceiling and the prune still cover every bucket in the process.
 *
 * `tooMany` is overridable because a per-subject budget is a domain fact, not a
 * traffic one: "this room has used today's scans" and "slow down" are different
 * sentences to the person holding the phone, and the client picks its copy off
 * the code.
 */
export function enforceRateLimitOn(subject: string, limit: Limit, scope: string, tooMany?: ApiError): void {
    const now = Date.now()
    prune(now)
    const key = `${scope}:${subject}`
    const { allowed, next } = takeToken(buckets.get(key), limit, now)
    buckets.set(key, next)
    if (!allowed) throw tooMany ?? rateLimited()
}
