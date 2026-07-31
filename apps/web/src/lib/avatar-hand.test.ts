/**
 * The dealing rules, not the animation.
 *
 * Everything asserted here is something a person would notice: their character
 * missing from the grid, the same drawing twice, an option that no amount of
 * shuffling can reach, or a first paint that differs between the server and the
 * browser (React would then discard the server HTML with a hydration error).
 */
import { describe, expect, it } from 'vitest'
import { AVATAR_KEYS } from './avatars'
import {
    HAND_SIZE,
    REELS_STOP_MS,
    SETTLE_POP_TICKS,
    SPIN_FRAME_MS,
    SPIN_MS,
    TICK_MS,
    ensurePick,
    handAt,
    hasSettled,
    initialHand,
    isOfferable,
    isPopping,
    planSpin,
} from './avatar-hand'

/** A seeded generator, so "many rolls" is a repeatable sentence. */
function seeded(seed: number): () => number {
    let state = seed >>> 0
    return () => {
        state = (state + 0x6d2b79f5) >>> 0
        let drawn = Math.imul(state ^ (state >>> 15), 1 | state)
        drawn = (drawn + Math.imul(drawn ^ (drawn >>> 7), 61 | drawn)) ^ drawn
        return ((drawn ^ (drawn >>> 14)) >>> 0) / 4294967296
    }
}

const unique = (keys: readonly string[]) => new Set(keys).size === keys.length

describe('the first hand', () => {
    it('shows the current pick first, then the catalog in order', () => {
        const start = AVATAR_KEYS.indexOf('tea-dragon')
        expect(initialHand('tea-dragon')).toEqual(AVATAR_KEYS.slice(start, start + HAND_SIZE))
    })

    it('wraps rather than running short at the end of the catalog', () => {
        const last = AVATAR_KEYS[AVATAR_KEYS.length - 1]
        const hand = initialHand(last)
        expect(hand[0]).toBe(last)
        expect(hand).toHaveLength(HAND_SIZE)
        expect(unique(hand)).toBe(true)
        expect(hand[1]).toBe(AVATAR_KEYS[0])
    })

    it('is the same answer every time it is asked — the server and the browser must agree', () => {
        for (const value of [null, undefined, 'party-bee', 'doodle-pizza', 'face-bun']) {
            expect(initialHand(value)).toEqual(initialHand(value))
        }
    })

    it('opens on the top of the catalog for a member with no pick yet', () => {
        expect(initialHand(null)).toEqual(AVATAR_KEYS.slice(0, HAND_SIZE))
    })

    it('opens on the top of the catalog for a stored key the picker never offers', () => {
        // Both are real values a row may hold, and neither is in AVATAR_KEYS.
        expect(isOfferable('face-bun')).toBe(false)
        expect(isOfferable('ninja-pear')).toBe(false)
        expect(initialHand('face-bun')).toEqual(AVATAR_KEYS.slice(0, HAND_SIZE))
        expect(initialHand('ninja-pear')).toEqual(AVATAR_KEYS.slice(0, HAND_SIZE))
    })
})

describe('a dealt hand', () => {
    it('is always eight distinct characters', () => {
        const random = seeded(7)
        for (let roll = 0; roll < 200; roll++) {
            const hand = planSpin('spreadsheet-owl', random).hand
            expect(hand).toHaveLength(HAND_SIZE)
            expect(unique(hand)).toBe(true)
        }
    })

    it('never loses the current pick', () => {
        const random = seeded(11)
        for (const value of ['vampire-penguin', 'punk-pineapple', 'doodle-boat', AVATAR_KEYS[AVATAR_KEYS.length - 1]]) {
            for (let roll = 0; roll < 100; roll++) {
                expect(planSpin(value, random).hand).toContain(value)
            }
        }
    })

    it('moves the pick around the grid instead of pinning it to one slot', () => {
        const random = seeded(3)
        const slots = new Set<number>()
        for (let roll = 0; roll < 400; roll++) slots.add(planSpin('tea-dragon', random).hand.indexOf('tea-dragon'))
        expect(slots.size).toBeGreaterThan(1)
    })

    it('deals a full hand for a member with no pick, or one the picker cannot offer', () => {
        const random = seeded(19)
        for (const value of [null, undefined, 'face-bun']) {
            const hand = planSpin(value, random).hand
            expect(hand).toHaveLength(HAND_SIZE)
            expect(unique(hand)).toBe(true)
            expect(hand.every(isOfferable)).toBe(true)
        }
        expect(planSpin('face-bun', random).hand).not.toContain('face-bun')
    })

    it('can reach every option in the catalog, so nothing quietly leaves the product', () => {
        const random = seeded(23)
        const seen = new Set<string>()
        for (let roll = 0; roll < 400; roll++) for (const key of planSpin(null, random).hand) seen.add(key)
        expect(seen.size).toBe(AVATAR_KEYS.length)
    })
})

describe('a spin', () => {
    it('deals eight, because the ninth tile is the die', () => {
        // Every other assertion in this file says `HAND_SIZE`, which stays true
        // if the constant moves. The grid is `grid-cols-3` and the die takes the
        // last cell, so eight is the number, and this is the one place to pin it.
        expect(HAND_SIZE).toBe(8)
        expect(initialHand(null)).toHaveLength(8)
        expect(planSpin(null, seeded(2)).hand).toHaveLength(8)
    })

    it('is duplicate free by arithmetic rather than by luck', () => {
        // Two facts carry the guarantee, and a shrinking catalog would break the
        // first one silently: the furthest index any reel reads has to stay
        // inside the catalog, so nothing wraps and meets another reel from
        // behind. The second keeps the eight reels reading genuinely different
        // stretches instead of one window sliding in lockstep.
        const plan = planSpin('party-bee', seeded(13))
        const furthest = Math.max(...plan.offsets.map((offset, slot) => offset + plan.steps[slot]))
        expect(furthest).toBeLessThan(AVATAR_KEYS.length)
        expect(plan.offsets[HAND_SIZE - 1] - plan.offsets[0]).toBeGreaterThanOrEqual(HAND_SIZE)
    })

    it('keeps the reel gap wider than the lead the start stagger can open', () => {
        // The ripple is the one thing that puts an EARLIER reel ahead of a later
        // one, and the duplicate-free argument in `reelGap` survives only while
        // that lead stays smaller than the gap between two reels' windows. This
        // measures the worst lead actually reached instead of restating the
        // formula: a wider stagger or a slower frame would show up here.
        const plan = planSpin('party-bee', seeded(13))
        const gap = plan.offsets[1] - plan.offsets[0]
        let worst = 0
        for (let tick = -2; tick <= plan.ticks + 2; tick++) {
            const indices = plan.offsets.map((offset, slot) => plan.reel.indexOf(handAt(plan, tick)[slot]) - offset)
            for (let later = 1; later < HAND_SIZE; later++) {
                for (let earlier = 0; earlier < later; earlier++) {
                    worst = Math.max(worst, indices[earlier] - indices[later])
                }
            }
        }
        expect(worst).toBeLessThan(gap)
    })

    it('cycles every reel — a tile that never moves is not a slot machine', () => {
        const plan = planSpin('party-bee', seeded(17))
        for (let slot = 0; slot < HAND_SIZE; slot++) {
            const shown = new Set(Array.from({ length: plan.ticks }, (_, tick) => handAt(plan, tick)[slot]))
            expect(shown.size, `slot ${slot} barely moved`).toBeGreaterThanOrEqual(3)
        }
    })

    it('stays inside the delight budget', () => {
        // The reels are what a person is waiting for; the tail after them is one
        // tile's pop, and it still has to fit the budget the spec set.
        expect(SPIN_MS).toBeLessThanOrEqual(800)
        expect(REELS_STOP_MS).toBeGreaterThanOrEqual(600)
        expect(REELS_STOP_MS).toBeLessThanOrEqual(720)
        expect(SPIN_FRAME_MS).toBeGreaterThanOrEqual(45)
        expect(SPIN_FRAME_MS).toBeLessThanOrEqual(70)
    })

    it('starts the reels in a ripple rather than all at once', () => {
        // Not decoration: eight tiles hard-cutting in lockstep is a large-area
        // flash sequence for anyone photosensitive who never set the OS
        // preference. See START_STAGGER_TICKS.
        const plan = planSpin('party-bee', seeded(5))
        expect(plan.startAt[0]).toBe(0)
        for (let slot = 1; slot < HAND_SIZE; slot++) {
            expect(plan.startAt[slot]).toBeGreaterThan(plan.startAt[slot - 1])
        }
        expect(plan.startAt[HAND_SIZE - 1] * TICK_MS).toBeLessThan(REELS_STOP_MS / 2)
    })

    it('stops the reels one after another, left to right', () => {
        const plan = planSpin('party-bee', seeded(5))
        expect(plan.settleAt).toHaveLength(HAND_SIZE)
        for (let slot = 1; slot < HAND_SIZE; slot++) {
            expect(plan.settleAt[slot]).toBeGreaterThan(plan.settleAt[slot - 1])
        }
        // The spin outlives its last reel by exactly the pop, and no longer.
        expect(plan.ticks).toBe(plan.settleAt[HAND_SIZE - 1] + SETTLE_POP_TICKS)
    })

    it('decelerates instead of ticking like a metronome', () => {
        const plan = planSpin('party-bee', seeded(29))
        const gaps = plan.settleAt.slice(1).map((stop, index) => stop - plan.settleAt[index])
        for (let index = 1; index < gaps.length; index++) {
            expect(gaps[index], `gap ${index} came sooner than the one before`).toBeGreaterThanOrEqual(gaps[index - 1])
        }
        // And it is a real ramp, not a nominally non-decreasing flat line.
        expect(gaps[gaps.length - 1]).toBeGreaterThan(gaps[0])
    })

    it('leaves a settled tile alone for the rest of the spin', () => {
        const plan = planSpin('party-bee', seeded(31))
        for (let slot = 0; slot < HAND_SIZE; slot++) {
            for (let tick = plan.settleAt[slot]; tick < plan.ticks + 3; tick++) {
                expect(handAt(plan, tick)[slot]).toBe(plan.hand[slot])
            }
        }
    })

    it('is still moving on the first tick and finished on the last', () => {
        const plan = planSpin(null, seeded(37))
        const opening = handAt(plan, 0)
        expect(opening.some((key, slot) => key !== plan.hand[slot])).toBe(true)
        expect(handAt(plan, plan.ticks - 1)).toEqual([...plan.hand])
        // A tick before the start, or long after the end, still renders something sane.
        expect(handAt(plan, -3)).toEqual(opening)
    })

    it('never shows the same character twice, on any tick of any spin', () => {
        const random = seeded(41)
        for (let roll = 0; roll < 150; roll++) {
            const plan = planSpin('doodle-cake', random)
            for (let tick = -2; tick <= plan.ticks + 2; tick++) {
                expect(unique(handAt(plan, tick))).toBe(true)
            }
        }
    })
})

describe('a tile resolving', () => {
    it('is not asked to show its name while it is still moving', () => {
        const plan = planSpin('party-bee', seeded(43))
        for (let slot = 0; slot < HAND_SIZE; slot++) {
            expect(hasSettled(plan, slot, plan.settleAt[slot] - 1)).toBe(false)
            expect(hasSettled(plan, slot, plan.settleAt[slot])).toBe(true)
            expect(hasSettled(plan, slot, plan.ticks)).toBe(true)
        }
    })

    it('pops once as it lands, and the spin lasts long enough to show it', () => {
        const plan = planSpin('party-bee', seeded(47))
        for (let slot = 0; slot < HAND_SIZE; slot++) {
            expect(isPopping(plan, slot, plan.settleAt[slot] - 1)).toBe(false)
            expect(isPopping(plan, slot, plan.settleAt[slot])).toBe(true)
            expect(isPopping(plan, slot, plan.settleAt[slot] + SETTLE_POP_TICKS)).toBe(false)
            // The last tile's pop is the one a frame-counted spin would cut off.
            expect(plan.settleAt[slot] + SETTLE_POP_TICKS).toBeLessThanOrEqual(plan.ticks)
        }
    })
})

describe('a pick that arrives from outside the picker', () => {
    it('takes the last slot when the hand does not hold it', () => {
        const hand = initialHand('tea-dragon')
        const kept = ensurePick(hand, 'punk-pineapple')
        expect(kept).toContain('punk-pineapple')
        expect(kept).toHaveLength(HAND_SIZE)
        expect(unique(kept)).toBe(true)
        expect(kept.slice(0, HAND_SIZE - 1)).toEqual(hand.slice(0, HAND_SIZE - 1))
    })

    it('leaves the hand exactly as it is when the pick is already on the grid', () => {
        const hand = initialHand('tea-dragon')
        expect(ensurePick(hand, hand[3])).toEqual(hand)
        expect(ensurePick(hand, null)).toEqual(hand)
        expect(ensurePick(hand, 'face-bun')).toEqual(hand)
    })
})
