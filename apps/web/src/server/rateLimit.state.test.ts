/**
 * The limiter as the routes actually use it — the stateful half.
 *
 * `rateLimit.test.ts` covers the pure bucket maths and the IP extraction. Everything the ROUTES
 * call is a layer above that: the shared map, the 429 it throws, the preflight that must not
 * spend a token, and `meterRoomLookup`, whose whole reason to exist is that a 404 and a 403 on the
 * same slug would otherwise tell a stranger which rooms are real.
 *
 * The clock is faked rather than waited on: a limiter tested with real sleeps is a limiter nobody
 * runs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/server/http'
import {
    CREATE_LIMIT,
    LOOKUP_MISS_LIMIT,
    LOOKUP_MISS_SCOPE,
    enforceRateLimit,
    enforceRateLimitOn,
    enforceRateLimitPreflight,
    meterRoomLookup,
    resetRateLimits,
} from '@/server/rateLimit'

const START = Date.UTC(2026, 6, 14, 12, 0, 0)

const from = (ip: string) => new Request('http://localhost/api/rooms', { headers: { 'x-forwarded-for': ip } })

/** Whatever it threw, as `${status}:${code}` — the only two things a client can act on. */
const shapeOf = (run: () => void): string => {
    try {
        run()
        return 'allowed'
    } catch (error) {
        return error instanceof ApiError ? `${error.status}:${error.code}` : `unexpected:${String(error)}`
    }
}

beforeEach(() => {
    resetRateLimits()
    vi.useFakeTimers()
    vi.setSystemTime(START)
})

afterEach(() => {
    vi.useRealTimers()
    resetRateLimits()
})

describe('enforceRateLimit', () => {
    it('allows exactly the capacity, then answers 429 with the code the client translates', () => {
        const request = from('203.0.113.1')
        for (let index = 0; index < CREATE_LIMIT.capacity; index++) {
            expect(`${index}:${shapeOf(() => enforceRateLimit(request, CREATE_LIMIT, 'create'))}`).toBe(
                `${index}:allowed`
            )
        }
        expect(shapeOf(() => enforceRateLimit(request, CREATE_LIMIT, 'create'))).toBe('429:RATE_LIMITED')
    })

    it('gives the drained caller one request back after one window slice, and the lot after a window', () => {
        const request = from('203.0.113.2')
        for (let index = 0; index < CREATE_LIMIT.capacity; index++) enforceRateLimit(request, CREATE_LIMIT, 'create')

        const slice = CREATE_LIMIT.windowMs / CREATE_LIMIT.capacity
        vi.setSystemTime(START + slice - 1)
        expect(shapeOf(() => enforceRateLimit(request, CREATE_LIMIT, 'create'))).toBe('429:RATE_LIMITED')

        vi.setSystemTime(START + slice)
        expect(shapeOf(() => enforceRateLimit(request, CREATE_LIMIT, 'create'))).toBe('allowed')
        // …and nothing more until the next slice.
        expect(shapeOf(() => enforceRateLimit(request, CREATE_LIMIT, 'create'))).toBe('429:RATE_LIMITED')

        vi.setSystemTime(START + CREATE_LIMIT.windowMs * 2)
        for (let index = 0; index < CREATE_LIMIT.capacity; index++) {
            expect(`${index}:${shapeOf(() => enforceRateLimit(request, CREATE_LIMIT, 'create'))}`).toBe(
                `${index}:allowed`
            )
        }
        expect(shapeOf(() => enforceRateLimit(request, CREATE_LIMIT, 'create'))).toBe('429:RATE_LIMITED')
    })

    it('meters each caller and each scope on its own budget', () => {
        const one = from('203.0.113.3')
        const two = from('203.0.113.4')
        for (let index = 0; index < CREATE_LIMIT.capacity; index++) enforceRateLimit(one, CREATE_LIMIT, 'create')

        expect(shapeOf(() => enforceRateLimit(one, CREATE_LIMIT, 'create'))).toBe('429:RATE_LIMITED')
        // A second phone in the café is not the first phone's problem…
        expect(shapeOf(() => enforceRateLimit(two, CREATE_LIMIT, 'create'))).toBe('allowed')
        // …and a drained create budget does not stop the same person adding an expense.
        expect(shapeOf(() => enforceRateLimit(one, CREATE_LIMIT, 'write'))).toBe('allowed')
    })

    it('puts every unproxied caller in one bucket, which is the deliberate failure direction', () => {
        const bare = () => new Request('http://localhost/api/rooms')
        for (let index = 0; index < CREATE_LIMIT.capacity; index++) enforceRateLimit(bare(), CREATE_LIMIT, 'create')
        expect(shapeOf(() => enforceRateLimit(bare(), CREATE_LIMIT, 'create'))).toBe('429:RATE_LIMITED')
    })

    it('forgets a caller who has been away a whole window, so the map cannot grow forever', () => {
        const request = from('203.0.113.5')
        for (let index = 0; index < CREATE_LIMIT.capacity; index++) enforceRateLimit(request, CREATE_LIMIT, 'create')
        expect(shapeOf(() => enforceRateLimit(request, CREATE_LIMIT, 'create'))).toBe('429:RATE_LIMITED')

        // Past the window AND past the prune interval: the bucket is indistinguishable from a
        // first-time visitor, so dropping it changes no decision.
        vi.setSystemTime(START + CREATE_LIMIT.windowMs + 1)
        expect(shapeOf(() => enforceRateLimit(from('198.51.100.1'), CREATE_LIMIT, 'create'))).toBe('allowed')
        expect(shapeOf(() => enforceRateLimit(request, CREATE_LIMIT, 'create'))).toBe('allowed')
    })

    it('is cleared by resetRateLimits, which is what keeps one test out of the next one', () => {
        const request = from('203.0.113.6')
        for (let index = 0; index < CREATE_LIMIT.capacity; index++) enforceRateLimit(request, CREATE_LIMIT, 'create')
        expect(shapeOf(() => enforceRateLimit(request, CREATE_LIMIT, 'create'))).toBe('429:RATE_LIMITED')
        resetRateLimits()
        expect(shapeOf(() => enforceRateLimit(request, CREATE_LIMIT, 'create'))).toBe('allowed')
    })
})

describe('enforceRateLimitPreflight', () => {
    it('spends nothing while budget remains, so ordinary polling stays free', () => {
        const request = from('203.0.113.7')
        for (let index = 0; index < CREATE_LIMIT.capacity * 3; index++) {
            enforceRateLimitPreflight(request, CREATE_LIMIT, 'create')
        }
        // Every token is still there — a preflight is a question, not a withdrawal.
        for (let index = 0; index < CREATE_LIMIT.capacity; index++) {
            expect(`${index}:${shapeOf(() => enforceRateLimit(request, CREATE_LIMIT, 'create'))}`).toBe(
                `${index}:allowed`
            )
        }
        expect(shapeOf(() => enforceRateLimitPreflight(request, CREATE_LIMIT, 'create'))).toBe('429:RATE_LIMITED')
    })

    it('records the empty bucket when it refuses, so the refusal survives to the next call', () => {
        const request = from('203.0.113.8')
        for (let index = 0; index < CREATE_LIMIT.capacity; index++) enforceRateLimit(request, CREATE_LIMIT, 'create')
        expect(shapeOf(() => enforceRateLimitPreflight(request, CREATE_LIMIT, 'create'))).toBe('429:RATE_LIMITED')
        expect(shapeOf(() => enforceRateLimitPreflight(request, CREATE_LIMIT, 'create'))).toBe('429:RATE_LIMITED')
    })
})

describe('meterRoomLookup — the room-existence oracle', () => {
    const hit = async () => 'a room'
    const miss = async () => {
        throw new ApiError(404, 'ROOM_NOT_FOUND', 'room not found')
    }

    it('does not charge a caller for rooms that exist, however often they poll', async () => {
        const request = from('203.0.113.9')
        for (let index = 0; index < LOOKUP_MISS_LIMIT.capacity * 4; index++) {
            await expect(meterRoomLookup(request, hit)).resolves.toBe('a room')
        }
    })

    it('charges one token per miss, and only for misses', async () => {
        const request = from('203.0.113.10')
        for (let index = 0; index < LOOKUP_MISS_LIMIT.capacity; index++) {
            await expect(meterRoomLookup(request, miss)).rejects.toMatchObject({ status: 404 })
        }
        await expect(meterRoomLookup(request, miss)).rejects.toMatchObject({ status: 429, code: 'RATE_LIMITED' })
    })

    it('refuses a real room too once the miss budget is empty — the whole point of the shared budget', async () => {
        const request = from('203.0.113.11')
        for (let index = 0; index < LOOKUP_MISS_LIMIT.capacity; index++) {
            await meterRoomLookup(request, miss).catch(() => undefined)
        }

        let ran = false
        await expect(
            meterRoomLookup(request, async () => {
                ran = true
                return 'a room'
            })
        ).rejects.toMatchObject({ status: 429 })
        // Refused BEFORE the database was touched, or the timing would answer the question the
        // status code refuses to.
        expect(ran).toBe(false)
    })

    it('does not spend the miss budget on a failure that is not a 404', async () => {
        const request = from('203.0.113.12')
        const archived = async () => {
            throw new ApiError(409, 'ROOM_ARCHIVED', 'this room is archived')
        }
        for (let index = 0; index < LOOKUP_MISS_LIMIT.capacity * 2; index++) {
            await expect(meterRoomLookup(request, archived)).rejects.toMatchObject({ status: 409 })
        }
        await expect(meterRoomLookup(request, hit)).resolves.toBe('a room')
    })

    it('lets a non-ApiError through untouched rather than turning a bug into a 429', async () => {
        const request = from('203.0.113.13')
        await expect(meterRoomLookup(request, async () => Promise.reject(new TypeError('boom')))).rejects.toThrow(
            TypeError
        )
        await expect(meterRoomLookup(request, hit)).resolves.toBe('a room')
    })

    it('shares one budget across every route that can 404 on a slug', async () => {
        const request = from('203.0.113.14')
        for (let index = 0; index < LOOKUP_MISS_LIMIT.capacity; index++) {
            await meterRoomLookup(request, miss).catch(() => undefined)
        }
        // A different route, the same bucket name, the same exhausted budget.
        expect(shapeOf(() => enforceRateLimitPreflight(request, LOOKUP_MISS_LIMIT, LOOKUP_MISS_SCOPE))).toBe(
            '429:RATE_LIMITED'
        )
    })
})

describe('enforceRateLimitOn — budgets that are not an IP', () => {
    const limit = { capacity: 3, windowMs: 60_000 }

    it('meters per subject rather than per caller, so a shared office is not one allowance', () => {
        for (let index = 0; index < limit.capacity; index++) enforceRateLimitOn('room-a', limit, 'scan')
        expect(shapeOf(() => enforceRateLimitOn('room-a', limit, 'scan'))).toBe('429:RATE_LIMITED')
        expect(shapeOf(() => enforceRateLimitOn('room-b', limit, 'scan'))).toBe('allowed')
    })

    it('throws the caller’s own sentence when the budget is a domain fact, not a traffic one', () => {
        const daily = new ApiError(429, 'ROOM_DAILY_SCANS_EXHAUSTED', 'this room has used today’s scans')
        for (let index = 0; index < limit.capacity; index++) enforceRateLimitOn('room-c', limit, 'scan', daily)
        expect(shapeOf(() => enforceRateLimitOn('room-c', limit, 'scan', daily))).toBe('429:ROOM_DAILY_SCANS_EXHAUSTED')
    })

    it('shares the one map with the IP buckets, so the same key cannot be spent twice', () => {
        const request = from('203.0.113.15')
        for (let index = 0; index < limit.capacity; index++) enforceRateLimitOn('203.0.113.15', limit, 'write')
        expect(shapeOf(() => enforceRateLimit(request, limit, 'write'))).toBe('429:RATE_LIMITED')
    })
})
