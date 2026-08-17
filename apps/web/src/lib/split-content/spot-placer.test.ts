import { describe, expect, it } from 'vitest'
import { DOODLE_NAMES } from '@/components/ui/doodles'
import { CHAPTER_BY_SLUG } from './recipe'
import { hashSlug } from './seed'
import { CHAPTER_DOODLE_POOLS, spotDoodle, spotPlan } from './spot-placer'
import type { Chapter } from './chapter-tokens'

const CHAPTERS = Object.keys(CHAPTER_DOODLE_POOLS) as Chapter[]
const DOODLE_NAME_SET = new Set<string>(DOODLE_NAMES)

/** No adjacent pair — every consecutive gap in the sorted list is at least 2. */
function hasNoAdjacentPair(spots: readonly number[]): boolean {
    return spots.every((value, index) => index === 0 || value - spots[index - 1] >= 2)
}

describe('CHAPTER_DOODLE_POOLS', () => {
    it('covers all six chapters with a non-empty pool', () => {
        expect(CHAPTERS.length).toBe(6)
        for (const chapter of CHAPTERS) expect(CHAPTER_DOODLE_POOLS[chapter].length).toBeGreaterThan(0)
    })

    it('only returns names present in DOODLE_NAMES and never an expense_-prefixed one', () => {
        for (const chapter of CHAPTERS) {
            for (const name of CHAPTER_DOODLE_POOLS[chapter]) {
                expect(DOODLE_NAME_SET.has(name), `${chapter}: ${name} is not a real doodle`).toBe(true)
                expect(name.startsWith('expense_'), `${chapter}: ${name} is an expense-category icon`).toBe(false)
            }
        }
    })
})

describe('spotPlan', () => {
    it('is deterministic: the same inputs always draw the same spots', () => {
        const seed = hashSlug('fronting-a-group-trip')
        const first = spotPlan(seed, 'trips', 9, 'default')
        const second = spotPlan(seed, 'trips', 9, 'default')
        expect(second).toEqual(first)
    })

    it('never exceeds a hard cap of 5, even over a very long section count', () => {
        const seed = hashSlug('split-expenses-across-currencies')
        expect(spotPlan(seed, 'currencies', 200, 'default').length).toBeLessThanOrEqual(5)
    })

    it('never places two doodles in adjacent sections', () => {
        for (const slug of Object.keys(CHAPTER_BY_SLUG)) {
            const seed = hashSlug(slug)
            for (const sectionCount of [1, 2, 3, 4, 5, 6, 9, 12, 20]) {
                const spots = spotPlan(seed, CHAPTER_BY_SLUG[slug], sectionCount, 'default')
                expect(hasNoAdjacentPair(spots), `${slug}@${sectionCount}: ${spots.join(',')}`).toBe(true)
            }
        }
    })

    it('returns [] immediately for register "flat", regardless of seed, chapter or section count', () => {
        for (const chapter of CHAPTERS) {
            for (const sectionCount of [0, 1, 5, 50]) {
                expect(spotPlan(999, chapter, sectionCount, 'flat')).toEqual([])
                expect(spotPlan(hashSlug('splitwise-daily-limit'), chapter, sectionCount, 'flat')).toEqual([])
            }
        }
    })

    it('returns [] for a section count of zero or fewer', () => {
        expect(spotPlan(1, 'home', 0, 'default')).toEqual([])
    })

    it('places at least one spot once there are enough sections to earn one', () => {
        expect(spotPlan(hashSlug('who-pays-for-the-wine'), 'table', 3, 'default').length).toBeGreaterThanOrEqual(1)
    })

    it('has distribution sanity over the real 24-slug seed set: not every slug draws the same spots', () => {
        const plans = Object.entries(CHAPTER_BY_SLUG).map(([slug, chapter]) =>
            JSON.stringify(spotPlan(hashSlug(slug), chapter, 6, 'default'))
        )
        expect(new Set(plans).size).toBeGreaterThan(1)
    })
})

describe('spotDoodle', () => {
    it('always draws a name from that chapter’s own pool', () => {
        const seed = hashSlug('group-trip-expenses')
        for (let index = 0; index < 5; index++) {
            expect(CHAPTER_DOODLE_POOLS.trips).toContain(spotDoodle(seed, 'trips', index))
        }
    })

    it('is deterministic per seed, chapter and index', () => {
        expect(spotDoodle(42, 'home', 0)).toBe(spotDoodle(42, 'home', 0))
    })
})
