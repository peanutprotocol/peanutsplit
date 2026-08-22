import { describe, expect, it } from 'vitest'
import { allocateByWeights, formatFigure, formatShareOfWhole, MAX_SAFE_MINOR } from './allocate'
import type { IndexedLocale } from '@/i18n/locales'

const sum = (values: readonly number[]) => values.reduce((running, value) => running + value, 0)

describe('allocateByWeights', () => {
    it('divides an even total evenly', () => {
        expect(allocateByWeights(6000, [1, 1, 1, 1])).toEqual([1500, 1500, 1500, 1500])
    })

    /** The whole reason this function exists: three ways of 100 is 33.33 each, and it must not be. */
    it('gives the leftover units to the largest fractions, earliest first', () => {
        expect(allocateByWeights(10000, [1, 1, 1])).toEqual([3334, 3333, 3333])
        expect(allocateByWeights(10001, [1, 1, 1])).toEqual([3334, 3334, 3333])
    })

    it('follows the weights', () => {
        expect(allocateByWeights(3000, [20, 10])).toEqual([2000, 1000])
        expect(allocateByWeights(6000, [0.5, 1, 1])).toEqual([1200, 2400, 2400])
    })

    /**
     * The property the money rules actually care about — no total, and no set of weights a text
     * input can produce, may lose or invent a unit.
     */
    it('reconciles to the unit for every total and weight set', () => {
        const weightSets = [[1], [1, 1], [3, 1], [1, 2, 3, 4], [0.5, 1, 1, 1.5], [7, 7, 7], [1, 0, 0]]
        for (const weights of weightSets) {
            for (const total of [0, 1, 2, 7, 99, 100, 101, 4999, 123456, 1_000_003]) {
                const shares = allocateByWeights(total, weights)
                expect(sum(shares), `${total} across ${weights.join('/')}`).toBe(total)
                expect(shares.length).toBe(weights.length)
            }
        }
    })

    /**
     * The ceiling is real arithmetic, not a round number. At MAX_SAFE_MINOR the shares still add
     * back up; above it a double's step exceeds one minor unit, the floored share can come out one
     * too high, and the function INVENTS a unit nobody owes. Both facts are pinned, because a
     * ceiling that is only asserted against itself would move silently with the constant.
     */
    it('reconciles at the largest total it claims to be exact for', () => {
        for (const weights of [
            [1, 1, 1],
            [7, 3],
            [1, 1e9],
        ]) {
            for (const total of [MAX_SAFE_MINOR, MAX_SAFE_MINOR - 1, MAX_SAFE_MINOR - 7]) {
                const shares = allocateByWeights(total, weights)
                expect(sum(shares), `${total} across ${weights.join('/')}`).toBe(total)
            }
        }
    })

    it('sits below MAX_SAFE_INTEGER, where the arithmetic provably drifts', () => {
        expect(MAX_SAFE_MINOR).toBeLessThan(Number.MAX_SAFE_INTEGER)
        // A total a double cannot divide into whole units: the shares come back one over.
        const drifting = 9007199254740847
        expect(Number.isSafeInteger(drifting)).toBe(true)
        expect(sum(allocateByWeights(drifting, [7.332447289954871e-7]))).not.toBe(drifting)
        expect(drifting).toBeGreaterThan(MAX_SAFE_MINOR)
    })

    it('splits a total nobody weighted equally rather than refusing it', () => {
        expect(allocateByWeights(900, [0, 0, 0])).toEqual([300, 300, 300])
    })

    it('reads a negative, infinite or missing weight as nothing', () => {
        expect(allocateByWeights(1000, [-5, 1, 1])).toEqual([0, 500, 500])
        expect(allocateByWeights(1000, [Number.NaN, 1])).toEqual([0, 1000])
        expect(allocateByWeights(1000, [Number.POSITIVE_INFINITY, 1])).toEqual([0, 1000])
    })

    it('stays total-preserving for a negative total', () => {
        const shares = allocateByWeights(-10000, [1, 1, 1])
        expect(sum(shares)).toBe(-10000)
        expect(shares).toEqual([-3334, -3333, -3333])
    })

    it('has nothing to divide across nobody', () => {
        expect(allocateByWeights(500, [])).toEqual([])
        expect(allocateByWeights(0, [1, 1])).toEqual([0, 0])
    })

    /** Same inputs, same output — a split that moves on its own loses the argument it settles. */
    it('is deterministic', () => {
        const once = allocateByWeights(100_007, [3, 3, 3, 1])
        for (let run = 0; run < 5; run += 1) expect(allocateByWeights(100_007, [3, 3, 3, 1])).toEqual(once)
    })
})

describe('figures', () => {
    it('prints a proportion as a percentage without a trailing zero', () => {
        expect(formatShareOfWhole(0.5, 1)).toBe('50%')
        expect(formatShareOfWhole(1, 3)).toBe('33.3%')
        expect(formatShareOfWhole(1, 0)).toBe('0%')
    })

    it('prints a count without inventing decimals', () => {
        expect(formatFigure(18)).toBe('18')
        expect(formatFigure(1.5)).toBe('1.5')
        expect(formatFigure(Number.NaN)).toBe('0')
    })

    /**
     * The derivation sits beside money the shell formats in the same locale, so it is written in
     * that locale's marks — from the rulebook (§5), which pins a comma decimal for es-419 where
     * CLDR would give a dot.
     */
    const written: readonly (readonly [IndexedLocale, string, string, string])[] = [
        ['en', '33.3%', '1,234.5', '30,000'],
        ['es-419', '33,3 %', '1.234,5', '30.000'],
        ['pt-br', '33,3 %', '1.234,5', '30.000'],
    ]

    it.each(written)('writes %s figures in its own marks', (locale, percent, grouped, whole) => {
        expect(formatShareOfWhole(1, 3, locale)).toBe(percent)
        expect(formatFigure(1234.5, locale)).toBe(grouped)
        expect(formatFigure(30_000, locale)).toBe(whole)
    })
})
