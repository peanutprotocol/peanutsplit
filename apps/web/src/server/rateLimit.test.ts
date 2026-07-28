/** The bucket maths and the IP extraction — both pure, both the parts that
 *  decide whether a real user gets a 429. */
import { describe, expect, it } from 'vitest'
import { CREATE_LIMIT, clientIp, takeToken, type Bucket } from '@/server/rateLimit'

const drain = (limit = CREATE_LIMIT, now = 0): Bucket => {
    let bucket: Bucket | undefined
    for (let i = 0; i < limit.capacity; i++) bucket = takeToken(bucket, limit, now).next
    return bucket!
}

describe('takeToken', () => {
    it('allows exactly `capacity` requests from a standing start', () => {
        let bucket: Bucket | undefined
        for (let i = 0; i < CREATE_LIMIT.capacity; i++) {
            const result = takeToken(bucket, CREATE_LIMIT, 0)
            expect(result.allowed).toBe(true)
            bucket = result.next
        }
        expect(takeToken(bucket, CREATE_LIMIT, 0).allowed).toBe(false)
    })

    it('refills continuously, so a drained caller gets a trickle rather than a cliff', () => {
        const drained = drain()
        const perToken = CREATE_LIMIT.windowMs / CREATE_LIMIT.capacity

        expect(takeToken(drained, CREATE_LIMIT, perToken - 1).allowed).toBe(false)
        expect(takeToken(drained, CREATE_LIMIT, perToken).allowed).toBe(true)
    })

    it('never refills past capacity, however long the caller was away', () => {
        const drained = drain()
        const afterAges = takeToken(drained, CREATE_LIMIT, CREATE_LIMIT.windowMs * 1000)
        expect(afterAges.allowed).toBe(true)
        expect(afterAges.next.tokens).toBe(CREATE_LIMIT.capacity - 1)
    })

    it('spends one token per call and keeps the fraction', () => {
        const first = takeToken(undefined, CREATE_LIMIT, 0)
        expect(first.next.tokens).toBe(CREATE_LIMIT.capacity - 1)
        const half = CREATE_LIMIT.windowMs / CREATE_LIMIT.capacity / 2
        // Half a token back, one token out — the leftover must not round away.
        expect(takeToken(first.next, CREATE_LIMIT, half).next.tokens).toBeCloseTo(CREATE_LIMIT.capacity - 2 + 0.5, 9)
    })
})

describe('clientIp', () => {
    const req = (headers: Record<string, string>) => new Request('http://localhost/api/rooms', { headers })

    it('takes the first x-forwarded-for hop — the rest are our own proxies', () => {
        expect(clientIp(req({ 'x-forwarded-for': '203.0.113.7, 10.0.0.2, 10.0.0.3' }))).toBe('203.0.113.7')
    })

    it('falls back to x-real-ip, then to a shared bucket', () => {
        expect(clientIp(req({ 'x-real-ip': '203.0.113.9' }))).toBe('203.0.113.9')
        expect(clientIp(req({}))).toBe('unknown')
    })
})
