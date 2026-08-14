import { describe, expect, it } from 'vitest'
import { hashSlug, pick } from './seed'

/**
 * The 24 real content slugs live today: the 4 alternatives/*, 9 blog/*, 4 capture/* directory
 * names, plus the 7 guide-only slugs from src/generated/seo/manifest.json (2 more guide slugs —
 * split-a-group-trip-across-countries, split-expenses-across-currencies — already appear above as
 * blog/* directories). recipe.test.ts asserts this set against the real content tree; this file
 * just needs a real, non-trivial input set to check distribution against.
 */
const REAL_SLUGS = [
    'settle-up-alternative',
    'splitwise-daily-limit',
    'splitwise-vs-tricount',
    'tricount-alternative',
    'end-of-trip-expense-recap',
    'fronting-a-group-trip',
    'scan-a-receipt-to-split-a-bill',
    'split-a-group-trip-across-countries',
    'split-bills-without-an-app',
    'split-expenses-across-currencies',
    'split-expenses-in-real-time',
    'split-expenses-offline',
    'who-pays-for-the-wine',
    'fair-split-calculator',
    'group-trip-expenses',
    'split-airbnb-cost-unequal-rooms',
    'split-bill-no-signup',
    'ask-a-friend-to-pay-you-back',
    'someone-drops-out-of-a-group-trip',
    'split-holiday-house-per-person-or-per-room',
    'split-shared-house-bills',
    'splitwise-currency-conversion',
    'splitwise-vs-settle-up',
    'why-do-i-owe-someone-i-never-paid',
]

describe('hashSlug', () => {
    it('is deterministic', () => {
        for (const slug of REAL_SLUGS) expect(hashSlug(slug)).toBe(hashSlug(slug))
    })

    it('returns an unsigned 32-bit integer', () => {
        for (const slug of REAL_SLUGS) {
            const value = hashSlug(slug)
            expect(Number.isInteger(value)).toBe(true)
            expect(value).toBeGreaterThanOrEqual(0)
            expect(value).toBeLessThanOrEqual(0xffffffff)
        }
    })

    it('gives every real slug a distinct hash', () => {
        expect(new Set(REAL_SLUGS.map(hashSlug)).size).toBe(REAL_SLUGS.length)
    })
})

describe('pick', () => {
    it('is deterministic for the same seed and channel', () => {
        const seed = hashSlug('fronting-a-group-trip')
        expect(pick(seed, 'doodle', 5)).toBe(pick(seed, 'doodle', 5))
    })

    it('stays within [0, optionCount) for every real slug', () => {
        const optionCount = 7
        for (const slug of REAL_SLUGS) {
            const value = pick(hashSlug(slug), 'range-check', optionCount)
            expect(value).toBeGreaterThanOrEqual(0)
            expect(value).toBeLessThan(optionCount)
        }
    })

    it('collapses a single-option channel to index 0 without hashing', () => {
        expect(pick(hashSlug('fronting-a-group-trip'), 'only-one-choice', 1)).toBe(0)
    })

    it('keeps two channels on one page independent across the real slug set', () => {
        const optionCount = 6
        const a = REAL_SLUGS.map((slug) => pick(hashSlug(slug), 'a', optionCount))
        const b = REAL_SLUGS.map((slug) => pick(hashSlug(slug), 'b', optionCount))
        // A handful of slugs can land on the same index in both channels by chance (1-in-6 per
        // slug) — what must not happen is channel 'b' silently replaying channel 'a' outright.
        expect(a).not.toEqual(b)
    })

    it('never collapses a channel to one index for every real slug (distribution sanity)', () => {
        const optionCount = 6
        const indices = new Set(REAL_SLUGS.map((slug) => pick(hashSlug(slug), 'chapter-doodle', optionCount)))
        expect(indices.size).toBeGreaterThan(1)
    })
})
