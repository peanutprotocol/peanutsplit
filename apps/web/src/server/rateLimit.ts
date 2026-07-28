// duplicated from wave0/correctness — coordinator dedupes at merge
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
/** Expenses and settlements are the normal traffic of a busy trip, so the ceiling
 *  only has to stop a runaway loop. */
export const WRITE_LIMIT: Limit = { capacity: 120, windowMs: HOUR_MS }

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

/** Throws a 429 the same way every other failure leaves a route. */
export function enforceRateLimit(request: Request, limit: Limit, scope: string): void {
    const now = Date.now()
    prune(now)
    const key = `${scope}:${clientIp(request)}`
    const { allowed, next } = takeToken(buckets.get(key), limit, now)
    buckets.set(key, next)
    if (!allowed) {
        throw new ApiError(429, 'RATE_LIMITED', 'that was a lot of requests — give it a minute and try again')
    }
}

/** Tests share one process, and a leaked bucket would fail a later test for a
 *  reason that has nothing to do with it. */
export function resetRateLimits(): void {
    buckets.clear()
    lastPruneAt = 0
}
