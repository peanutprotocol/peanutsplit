import { describe, expect, it } from 'vitest'
import { BASE_BACKOFF_MS, MAX_BACKOFF_MS, backoffDelay } from './realtime'

describe('reconnect backoff', () => {
    it('starts at a second and doubles', () => {
        // `random = 1` is the top of the jitter window, i.e. the ceiling itself.
        expect(backoffDelay(1, () => 1)).toBe(BASE_BACKOFF_MS)
        expect(backoffDelay(2, () => 1)).toBe(2 * BASE_BACKOFF_MS)
        expect(backoffDelay(3, () => 1)).toBe(4 * BASE_BACKOFF_MS)
    })

    it('never waits longer than the cap, however long the outage runs', () => {
        for (const attempt of [10, 50, 1000]) expect(backoffDelay(attempt, () => 1)).toBe(MAX_BACKOFF_MS)
    })

    it('jitters across the whole lower half — a restart must not resynchronise every phone', () => {
        expect(backoffDelay(5, () => 0)).toBe((16 * BASE_BACKOFF_MS) / 2)
        expect(backoffDelay(5, () => 1)).toBe(16 * BASE_BACKOFF_MS)
        expect(backoffDelay(5, () => 0.5)).toBe(0.75 * 16 * BASE_BACKOFF_MS)
    })

    it('treats a nonsense attempt count as the first one rather than waiting forever', () => {
        expect(backoffDelay(0, () => 1)).toBe(BASE_BACKOFF_MS)
        expect(backoffDelay(-3, () => 1)).toBe(BASE_BACKOFF_MS)
    })
})
