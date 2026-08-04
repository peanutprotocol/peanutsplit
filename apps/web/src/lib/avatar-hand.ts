/**
 * Which eight characters the picker offers, and how a shuffle gets from one hand
 * to the next.
 *
 * The catalog is forty-eight options. Forty-eight tiles is a wall, so the picker
 * shows a HAND of eight plus a dice tile, and the dice deals a new hand. All of
 * the dealing lives here, pure and RNG-injected like `randomPersonaKey`, because
 * the rules it enforces are product rules rather than animation details:
 *
 *   - The first hand is derived from the stored pick alone. The picker is
 *     server-rendered, so a `Math.random()` in that path is a hydration mismatch.
 *   - The current pick is always in the hand. A shuffle may move it, never drop
 *     it — a person who cannot see their own character believes it was lost.
 *   - A hand never repeats a character, and neither does any FRAME of a shuffle:
 *     each reel reads its own window of one shuffled catalog, so two reels can
 *     never be showing the same drawing at the same moment. The arithmetic that
 *     makes that true lives in `reelGap`.
 *   - Every catalog key stays reachable, because the pool is the whole catalog.
 *
 * A spin is modelled as eight slot-machine reels that start in a ripple and stop
 * in a decelerating sequence. The plan is computed up front and `handAt` renders
 * any tick of it, so the component needs one timer and no per-tile state, and
 * every timing below is testable without a DOM.
 */

import { AVATAR_KEYS, type AvatarKey } from './avatars'
import {
    avatarPaletteForIdentity,
    isAvatarPaletteKey,
    separatedAvatarPaletteKeys,
    type AvatarPaletteKey,
} from './avatar-palettes'

/** Eight characters plus the dice tile: one full 3×3 grid. */
export const HAND_SIZE = 8

/**
 * The resolution the schedule is written in — NOT the rate anything moves at.
 *
 * Reels advance every `FRAME_TICKS`, and they start and stop on their own ticks
 * in between, which is only expressible if the clock is finer than the frame.
 * Integer ticks keep the whole schedule exact arithmetic that a test can walk.
 */
export const TICK_MS = 20

/** Ticks a single reel frame stays on screen: 3 × 20 = 60ms. */
export const FRAME_TICKS = 3

/** Milliseconds per reel frame. Fast enough to blur, slow enough to read. */
export const SPIN_FRAME_MS = FRAME_TICKS * TICK_MS

/**
 * Ticks between slot n starting to cycle and slot n+1 starting, so the grid
 * ripples into motion from the top left instead of flashing as one block.
 *
 * This is a SAFETY constraint and not decoration. Eight tiles hard-cutting in
 * lockstep sixteen times a second is a large-area flash sequence, which is the
 * photosensitivity grey zone for everyone who never set
 * `prefers-reduced-motion` (that preference removes the cycling altogether).
 * Staggered starts mean roughly two tiles change per tick instead of eight at
 * once, and the grid never flashes as a whole again after the opening frame.
 * Do not collapse this to one start time.
 */
export const START_STAGGER_TICKS = 1

/** The tick slot `i` starts cycling on. */
const START_AT: readonly number[] = Array.from({ length: HAND_SIZE }, (_, slot) => slot * START_STAGGER_TICKS)

/** The first reel stops here: 10 × 20 = 200ms. */
const FIRST_SETTLE_TICKS = 10

/**
 * Ticks from one reel stopping to the next, in order — 40, 60, 60, 60, 80, 80,
 * 100ms.
 *
 * Non-decreasing on purpose. An even stagger is a metronome, and a metronome is
 * the one rhythm that carries no information about ending; real reels decelerate,
 * so the gaps widen and the last tile lands like a final answer instead of one
 * more beat.
 */
const SETTLE_GAP_TICKS: readonly number[] = [2, 3, 3, 3, 4, 4, 5]

/**
 * The tick each slot stops on, left to right and top to bottom:
 * 200, 240, 300, 360, 420, 500, 580, 680ms.
 */
const SETTLE_AT: readonly number[] = SETTLE_GAP_TICKS.reduce<number[]>(
    (stops, gap) => [...stops, stops[stops.length - 1] + gap],
    [FIRST_SETTLE_TICKS]
)

const LAST_SETTLE_TICK = SETTLE_AT[HAND_SIZE - 1]

/**
 * Ticks the settle pop needs after a reel stops.
 *
 * The spin has to outlive its last reel by this much, or the pop that marks the
 * final tile resolving is cut off at the exact moment it lands. Nothing changes
 * character during the tail — it is the same hand, holding still.
 */
export const SETTLE_POP_TICKS = 6

/** Milliseconds until the last reel stops — the spin as a person perceives it. */
export const REELS_STOP_MS = LAST_SETTLE_TICK * TICK_MS

/** Ticks in a whole spin, pop tail included: 40 × 20 = 800ms. */
export const SPIN_TICKS = LAST_SETTLE_TICK + SETTLE_POP_TICKS

/** Milliseconds from the tap to the picker being quiet again. */
export const SPIN_MS = SPIN_TICKS * TICK_MS

/** How many frames slot `i` advances through before it stops. */
const STEPS: readonly number[] = Array.from({ length: HAND_SIZE }, (_, slot) =>
    Math.floor((SETTLE_AT[slot] - START_AT[slot]) / FRAME_TICKS)
)

const MAX_STEPS = Math.max(...STEPS)

/**
 * The most frames the start stagger can put an earlier reel AHEAD of a later
 * one, which is the only direction the ripple breaks the reels' ordering in.
 * `reelGap` is floored above it — see there for why that is the whole guarantee.
 */
const MAX_START_LEAD = Math.ceil(((HAND_SIZE - 1) * START_STAGGER_TICKS) / FRAME_TICKS)

export interface SpinPlan {
    /** One shuffled copy of the catalog. Every reel reads a window of it. */
    readonly reel: readonly AvatarKey[]
    /** Where slot `i` starts reading. */
    readonly offsets: readonly number[]
    /** The tick slot `i` starts cycling on. */
    readonly startAt: readonly number[]
    /** The tick slot `i` stops on. */
    readonly settleAt: readonly number[]
    /** How many frames slot `i` advances through in total. */
    readonly steps: readonly number[]
    /** Where the reels land — the hand this spin is dealing. */
    readonly hand: readonly AvatarKey[]
    /** Ticks to render, `0 … ticks - 1`. Everything is settled well before the end. */
    readonly ticks: number
}

/**
 * True for a key the picker is allowed to offer. `isAvatarKey` is deliberately
 * wider — it also accepts the compatibility keys (`face-bun`, `ninja-pear`) that
 * a row may still store but that the grid never re-offers.
 */
export const isOfferable = (value: string | null | undefined): value is AvatarKey =>
    typeof value === 'string' && (AVATAR_KEYS as string[]).includes(value)

const pick = (random: () => number, count: number): number =>
    count <= 1 ? 0 : Math.min(Math.max(Math.floor(random() * count), 0), count - 1)

const shuffle = <Key>(keys: readonly Key[], random: () => number): Key[] => {
    const pool = [...keys]
    for (let index = pool.length - 1; index > 0; index--) {
        const swap = pick(random, index + 1)
        const held = pool[index]
        pool[index] = pool[swap]
        pool[swap] = held
    }
    return pool
}

/**
 * How far apart two reels read.
 *
 * The windows do overlap — slot 1 reads indices 5…9 and slot 2 starts at 10 — so
 * "they never meet" is not the reason a frame is duplicate free. Nor, since the
 * starts are staggered, is it that a later reel is never behind an earlier one:
 * for the first few ticks slot 0 is moving while slot 7 has not begun, so the
 * earlier reel genuinely leads.
 *
 * The reason is that the lead is BOUNDED. Slot `i` reads `i·gap + frame(i)`, and
 * the only thing that can make `frame(j) > frame(i)` for `j < i` is the start
 * stagger, worth at most `MAX_START_LEAD` frames; once a reel stops the ordering
 * is restored, because `SETTLE_AT` and `STEPS` both rise with the slot. So for
 * `i > j` the two indices differ by at least `gap - MAX_START_LEAD`, and the gap
 * is floored one above that lead.
 *
 * The argument also needs nothing to wrap, which is what the divisor buys: the
 * furthest index anybody reads is `(HAND_SIZE - 1)·gap + MAX_STEPS`, sized to
 * stay inside the catalog. Both halves are asserted in `avatar-hand.test.ts`
 * against the real catalog and exhaustively over every tick of many spins,
 * rather than trusted from this paragraph — it has been wrong before.
 */
const reelGap = (poolSize: number): number =>
    Math.max(MAX_START_LEAD + 1, Math.floor((poolSize - 1 - MAX_STEPS) / Math.max(1, HAND_SIZE - 1)))

/**
 * The eight tiles for a first paint, from the stored pick alone.
 *
 * The pick leads and the catalog follows it in order, wrapping — so the same
 * member always gets the same opening hand on the server and in the browser. A
 * null or compatibility key has no place in the catalog order, so those open on
 * the top of the catalog instead.
 */
export function initialHand(value: string | null | undefined): AvatarKey[] {
    const start = isOfferable(value) ? AVATAR_KEYS.indexOf(value) : 0
    const size = Math.min(HAND_SIZE, AVATAR_KEYS.length)
    return Array.from({ length: size }, (_, slot) => AVATAR_KEYS[(start + slot) % AVATAR_KEYS.length])
}

/**
 * Stable colours for the server-rendered first hand.
 *
 * The selected pair comes from the member row. Every other offer greedily
 * maximizes OKLab distance from the room and the colours already dealt, without
 * asking for randomness during hydration.
 */
export function initialPaletteHand(
    hand: readonly AvatarKey[],
    value: string | null | undefined,
    valuePalette: string | null | undefined,
    occupied: readonly string[] = []
): AvatarPaletteKey[] {
    const palettes = new Array<AvatarPaletteKey>(hand.length)
    const selectedSlot = isOfferable(value) ? hand.indexOf(value) : -1
    const selectedPalette =
        selectedSlot >= 0
            ? isAvatarPaletteKey(valuePalette)
                ? valuePalette
                : avatarPaletteForIdentity(value ?? hand[selectedSlot]).key
            : null

    if (selectedSlot >= 0 && selectedPalette) {
        palettes[selectedSlot] = selectedPalette
    }

    const offers = separatedAvatarPaletteKeys(hand.length - (selectedSlot >= 0 ? 1 : 0), occupied, [
        ...(selectedPalette ? [selectedPalette] : []),
    ])
    let offer = 0
    for (let slot = 0; slot < hand.length; slot++) {
        if (slot === selectedSlot && palettes[slot]) continue
        palettes[slot] = offers[offer++]
    }
    return palettes
}

/**
 * Deal room-free reviewed colours to the landing characters. Offers stay
 * unique while the remaining room-free pool is large enough; in a crowded room
 * repeating a free colour is better than offering one another member wears.
 *
 * Like the character hand, this is only an offer. The selected member pair is
 * forced into its landing slot so pressing the die never edits or visually
 * repaints the member; another pair is persisted only when its tile is tapped.
 */
export function planPaletteHand(
    hand: readonly AvatarKey[],
    value: string | null | undefined,
    valuePalette: string | null | undefined,
    random: () => number = Math.random,
    occupied: readonly string[] = []
): AvatarPaletteKey[] {
    const selectedSlot = isOfferable(value) ? hand.indexOf(value) : -1
    const palettes = initialPaletteHand(hand, value, valuePalette, occupied)
    const offerSlots = palettes.flatMap((_, slot) => (slot === selectedSlot ? [] : [slot]))
    const shuffledOffers = shuffle(
        offerSlots.map((slot) => palettes[slot]),
        random
    )
    for (let index = 0; index < offerSlots.length; index++) {
        palettes[offerSlots[index]] = shuffledOffers[index]
    }
    return palettes
}

/**
 * The hand, guaranteed to contain the pick.
 *
 * Only reached when the value changes from outside the picker — another person
 * in the room changing this character while the sheet is open. The pick takes the
 * last slot rather than a random one so that the tiles somebody is reading do not
 * rearrange under their eyes.
 */
export function ensurePick(hand: readonly AvatarKey[], value: string | null | undefined): AvatarKey[] {
    if (!isOfferable(value) || hand.includes(value)) return [...hand]
    return [...hand.slice(0, Math.max(0, hand.length - 1)), value]
}

/**
 * Plan one shuffle: where every reel lands and what it shows on the way there.
 *
 * The hand is read OFF the reels rather than drawn first and animated towards,
 * which is what makes the frames honest — a tile shows the key its own reel is
 * on, and stopping is just refusing to advance. The current pick is then forced
 * in by swapping it into the landing position of one slot; swapping inside a
 * permutation keeps the pool distinct, so the duplicate-free guarantee holds.
 */
export function planSpin(value: string | null | undefined, random: () => number = Math.random): SpinPlan {
    const reel = shuffle(AVATAR_KEYS, random)
    const gap = reelGap(reel.length)
    const offsets = Array.from({ length: HAND_SIZE }, (_, slot) => slot * gap)
    const landing = offsets.map((offset, slot) => (offset + STEPS[slot]) % reel.length)

    if (isOfferable(value) && !landing.some((index) => reel[index] === value)) {
        const slot = pick(random, HAND_SIZE)
        const target = landing[slot]
        const held = reel.indexOf(value)
        reel[held] = reel[target]
        reel[target] = value
    }

    return {
        reel,
        offsets,
        startAt: START_AT,
        settleAt: SETTLE_AT,
        steps: STEPS,
        hand: landing.map((index) => reel[index]),
        ticks: SPIN_TICKS,
    }
}

/** Which frame slot `i`'s reel is showing on a given tick of a spin. */
const frameAt = (plan: SpinPlan, slot: number, tick: number): number =>
    Math.min(Math.max(Math.floor((tick - plan.startAt[slot]) / FRAME_TICKS), 0), plan.steps[slot])

/** The eight tiles to draw on a given tick of a spin. */
export function handAt(plan: SpinPlan, tick: number): AvatarKey[] {
    return plan.offsets.map((offset, slot) => plan.reel[(offset + frameAt(plan, slot, tick)) % plan.reel.length])
}

/**
 * True once slot `i` has stopped — the moment its name is worth reading again,
 * and the moment it is allowed to pop.
 */
export const hasSettled = (plan: SpinPlan, slot: number, tick: number): boolean => tick >= plan.settleAt[slot]

/** True for the handful of ticks in which slot `i` plays its settle pop. */
export const isPopping = (plan: SpinPlan, slot: number, tick: number): boolean =>
    hasSettled(plan, slot, tick) && tick < plan.settleAt[slot] + SETTLE_POP_TICKS
