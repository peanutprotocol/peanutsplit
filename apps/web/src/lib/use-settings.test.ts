import { describe, expect, it } from 'vitest'
import { HAPTIC_MS, HAPTIC_PATTERNS, IOS_PATTERN_OFFSETS_MS } from './use-settings'

/**
 * The haptic tables, asserted as data.
 *
 * None of this can be felt in CI, and the failure mode when it drifts is silent
 * on every platform: a missing entry in `HAPTIC_MS` is `undefined` handed to
 * `navigator.vibrate`, which does nothing rather than throwing, and an iOS
 * offset list of the wrong length means Android users feel three pulses where
 * iPhone users feel two. The tables are the only place that can be checked.
 */
describe('haptic durations', () => {
    it('covers every sound in the palette', () => {
        expect(Object.keys(HAPTIC_MS).sort()).toEqual(['bell', 'blip', 'error', 'pop', 'thunk', 'tick', 'whoosh'])
    })

    it('stays under the threshold where a tap becomes a buzz', () => {
        for (const [name, ms] of Object.entries(HAPTIC_MS)) {
            expect(ms, name).toBeGreaterThan(0)
            expect(ms, name).toBeLessThanOrEqual(30)
        }
    })
})

describe('haptic patterns', () => {
    it('alternates buzz and pause, so every pattern has an odd length', () => {
        // navigator.vibrate reads the array as buzz/pause/buzz/…; an even length
        // ends on a pause, which is a silent no-op tacked onto the end.
        for (const [name, pattern] of Object.entries(HAPTIC_PATTERNS)) {
            expect(pattern.length % 2, name).toBe(1)
        }
    })

    it('gives error more pulses than confirm', () => {
        const pulses = (pattern: readonly number[]) => Math.ceil(pattern.length / 2)
        expect(pulses(HAPTIC_PATTERNS.confirm)).toBe(2)
        expect(pulses(HAPTIC_PATTERNS.error)).toBe(3)
        expect(pulses(HAPTIC_PATTERNS.success)).toBe(3)
    })

    it('accelerates the success pattern', () => {
        // The celebratory one has to arrive somewhere rather than just repeat.
        const buzzes = HAPTIC_PATTERNS.success.filter((_, index) => index % 2 === 0)
        for (let i = 1; i < buzzes.length; i += 1) expect(buzzes[i]).toBeGreaterThan(buzzes[i - 1])
    })
})

describe('iOS pattern emulation', () => {
    it('produces the same number of taps as the Android pattern has pulses', () => {
        for (const name of Object.keys(HAPTIC_PATTERNS) as (keyof typeof HAPTIC_PATTERNS)[]) {
            const pulses = Math.ceil(HAPTIC_PATTERNS[name].length / 2)
            // The first tap fires immediately; the table holds only the stagger.
            expect(IOS_PATTERN_OFFSETS_MS[name].length + 1, name).toBe(pulses)
        }
    })

    it('spaces taps far enough apart to be felt separately', () => {
        for (const [name, offsets] of Object.entries(IOS_PATTERN_OFFSETS_MS)) {
            let previous = 0
            for (const offset of offsets) {
                // Below ~100ms two Taptic taps blur into one, which is why these
                // are not the Android 50/70ms durations.
                expect(offset - previous, name).toBeGreaterThanOrEqual(100)
                previous = offset
            }
        }
    })
})
