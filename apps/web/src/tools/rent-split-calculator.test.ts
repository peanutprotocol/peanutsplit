import { describe, expect, it } from 'vitest'
import { rentSplitCalculator } from './rent-split-calculator'
import type { ToolOutcome } from './types'

const { compute, phrases } = rentSplitCalculator

/** `rich` is the slider notch, one to five. Left out, every room sits on the same notch. */
function split(rent: number, rooms: { size: number; rich?: number }[]): ToolOutcome {
    return compute({
        values: { rent, people: rooms.length },
        toggles: {},
        choices: {},
        rows: rooms.map((room, index) => ({
            name: `Flatmate ${index + 1}`,
            values: { size: room.size, rich: room.rich ?? 3 },
        })),
        decimals: 2,
        phrases,
    })
}

const paid = (outcome: ToolOutcome) => outcome.shares.map((share) => share.amountMinor)
const total = (outcome: ToolOutcome) => paid(outcome).reduce((running, amount) => running + amount, 0)

/** The same flat with one person's slider moved and nobody else's touched. */
const moved = (rooms: { size: number; rich?: number }[], mover: number, rich: number) =>
    rooms.map((room, index) => (index === mover ? { ...room, rich } : room))

/** A flat big enough to hold the maximum the page offers, with every notch represented. */
const twenty = Array.from({ length: 20 }, (_, index) => ({ size: 5 + index, rich: (index % 5) + 1 }))

describe('rent split by room size', () => {
    it('divides the rent in proportion to floor area', () => {
        expect(paid(split(300_000, [{ size: 20 }, { size: 10 }]))).toEqual([200_000, 100_000])
    })

    it('splits it evenly while the rooms are unmeasured', () => {
        expect(paid(split(90_000, [{ size: 0 }, { size: 0 }, { size: 0 }]))).toEqual([30_000, 30_000, 30_000])
    })

    it('shows the room and its share on every row', () => {
        expect(split(300_000, [{ size: 20 }, { size: 10 }]).shares[0].detail).toBe('20 sqm, 66.7% of the rent')
    })

    it('reads a negative room as no room at all', () => {
        expect(paid(split(300_000, [{ size: -20 }, { size: 10 }]))).toEqual([0, 300_000])
    })
})

describe('the how-rich slider', () => {
    /**
     * The rule the FAQ promises: a flat that has not moved a slider has said nothing, so the rent
     * follows floor area alone. Asserted at both ends of the scale, because "does nothing" has to
     * mean the same at notch five as at notch one.
     */
    it('does nothing at all while every slider reads the same', () => {
        const byRoom = paid(split(300_000, [{ size: 20 }, { size: 10 }]))
        for (const notch of [1, 3, 5]) {
            expect(paid(split(300_000, [{ size: 20, rich: notch }, { size: 10, rich: notch }])), `notch ${notch}`) // prettier-ignore
                .toEqual(byRoom)
        }
    })

    it('leaves the slider line out of the working while they are level', () => {
        expect(split(120_000, [{ size: 20 }, { size: 10 }]).workings.map((entry) => entry.label)).toEqual([
            'Rent',
            'Floor area measured',
        ])
    })

    /** Same rooms, different notches: the notch multiplies the room, so five counts five rooms. */
    it('counts a room as many times as its notch says once they are apart', () => {
        const outcome = split(100_000, [{ size: 10, rich: 5 }, { size: 10, rich: 1 }]) // prettier-ignore
        expect(paid(outcome)).toEqual([83_333, 16_667])
    })

    /** The notch IS the weight — five counts five times as much as one. This is the documented map. */
    it('weights a notch by its own number', () => {
        const outcome = split(120_000, [{ size: 0, rich: 1 }, { size: 0, rich: 2 }, { size: 0, rich: 3 }]) // prettier-ignore
        // Rooms unmeasured, so every room counts the same and the notches carry it: 1:2:3 of six.
        expect(paid(outcome)).toEqual([20_000, 40_000, 60_000])
    })

    it('names the room and the notch in the working', () => {
        const outcome = split(100_000, [{ size: 10, rich: 5 }, { size: 10, rich: 1 }]) // prettier-ignore
        expect(outcome.shares[0].detail).toBe('room 50%, notch 5, so 83.3% of the rent')
        expect(outcome.workings).toContainEqual({ label: 'Where the sliders sit', value: '5, 1' })
    })

    /**
     * The property the page promises, and the one the old arithmetic broke: pushing a slider up is
     * the only thing it does. Averaging each notch's share of the flat's notches against the floor
     * area dragged every flat toward an even split, and the largest room was already above an even
     * split — so marking the biggest room as the flush one paid them a discount. Checked on every
     * row of every flat, at every notch of the scale, and in both directions at once.
     */
    it('never moves a rent the opposite way to the slider that moved', () => {
        const flats = [
            [{ size: 15 }, { size: 10 }, { size: 7 }],
            [{ size: 12.5 }, { size: 12.5 }],
            [{ size: 30, rich: 1 }, { size: 4, rich: 5 }], // prettier-ignore
            [{ size: 20 }, { size: 0 }, { size: 9, rich: 2 }],
            [{ size: 0 }, { size: 0 }, { size: 0 }, { size: 0 }],
            twenty,
        ]
        for (const rooms of flats) {
            for (let mover = 0; mover < rooms.length; mover += 1) {
                for (let notch = 1; notch < 5; notch += 1) {
                    const before = paid(split(123_457, moved(rooms, mover, notch)))
                    const after = paid(split(123_457, moved(rooms, mover, notch + 1)))
                    const where = `${rooms.length} rooms, row ${mover}, notch ${notch} to ${notch + 1}`
                    expect(after[mover], `${where}: the mover`).toBeGreaterThanOrEqual(before[mover])
                    for (let other = 0; other < rooms.length; other += 1) {
                        if (other === mover) continue
                        expect(after[other], `${where}: row ${other}`).toBeLessThanOrEqual(before[other])
                    }
                }
            }
        }
    })

    /**
     * Level sliders are not "close to" floor area, they ARE floor area — the multiplier divides
     * straight back out. Asserted against the arithmetic written out by hand rather than against
     * the page's own untouched answer, so both cannot drift together.
     */
    it('lands exactly on floor area wherever the level sliders sit', () => {
        for (const notch of [1, 2, 3, 4, 5]) {
            const rooms = [{ size: 15, rich: notch }, { size: 10, rich: notch }, { size: 7, rich: notch }] // prettier-ignore
            expect(paid(split(100_000, rooms)), `notch ${notch}`).toEqual([46_875, 31_250, 21_875])
        }
    })

    /**
     * The flat that caught it, pinned to the cent. Rent 1000 over 15, 10 and 7 sqm: level sliders
     * pay 468.75, and the old blend answered 461.65 once the biggest room was marked the flush one
     * — seven euros off the person the flat had just pointed at, and twenty-seven onto the smallest
     * room, which nobody had touched.
     */
    it('pins the flat that caught the old blend', () => {
        const rooms = [{ size: 15, rich: 5 }, { size: 10 }, { size: 7 }] // prettier-ignore
        expect(paid(split(100_000, rooms))).toEqual([59_524, 23_809, 16_667])
        expect(total(split(100_000, rooms))).toBe(100_000)
    })

    /** A range input cannot produce these; a hand-edited state or a stale cache can. */
    it('holds a notch inside its own scale', () => {
        const wild = split(100_000, [{ size: 10, rich: 0 }, { size: 10, rich: 99 }]) // prettier-ignore
        const sane = split(100_000, [{ size: 10, rich: 1 }, { size: 10, rich: 5 }]) // prettier-ignore
        expect(paid(wild)).toEqual(paid(sane))
    })
})

describe('rent split, the numbers that have to hold', () => {
    it('reconciles to the cent whatever the rooms and sliders are', () => {
        const flats = [
            [{ size: 14 }, { size: 11 }, { size: 9 }],
            [{ size: 12.5, rich: 4 }, { size: 12.5, rich: 2 }], // prettier-ignore
            [
                { size: 30, rich: 1 },
                { size: 0, rich: 5 },
            ],
            [{ size: 1 }, { size: 1 }, { size: 1 }, { size: 1 }, { size: 1 }, { size: 1 }, { size: 1 }],
            [{ size: 9, rich: 5 }, { size: 9, rich: 4 }, { size: 9, rich: 3 }, { size: 9, rich: 1 }], // prettier-ignore
            twenty,
        ]
        for (const rooms of flats) {
            for (const rent of [1, 99_999, 100_000, 123_457, 1_000_003]) {
                const outcome = split(rent, rooms)
                expect(total(outcome), `${rent} across ${rooms.length} rooms`).toBe(rent)
                expect(outcome.totalMinor).toBe(rent)
            }
        }
    })

    /** One name on the rent pays the rent, and no slider position can take a cent off that. */
    it('hands the whole rent to the only person on it', () => {
        for (const notch of [1, 3, 5]) {
            expect(paid(split(87_654, [{ size: 12, rich: notch }])), `notch ${notch}`).toEqual([87_654])
        }
        expect(paid(split(87_654, [{ size: 0 }]))).toEqual([87_654])
    })

    /** Twenty is the most the field allows, so it is the widest the largest-remainder hand-out gets. */
    it('divides a rent across a full flat of twenty', () => {
        const outcome = split(100_003, twenty)
        expect(outcome.shares).toHaveLength(20)
        expect(total(outcome)).toBe(100_003)
    })

    it('has nothing to divide when nobody is on the rent', () => {
        expect(split(120_000, []).problem).toBe('Say how many people are on the rent.')
    })

    it('refuses a rent below nothing', () => {
        expect(split(-1, [{ size: 10 }]).problem).toBe('Rent cannot be less than nothing.')
    })

    it('refuses a rent past what whole units can be counted in', () => {
        expect(split(Number.MAX_SAFE_INTEGER + 10, [{ size: 10 }]).problem).toBe(
            'That is a bigger rent than this page divides.'
        )
    })

    it('splits a rent of nothing into nothing', () => {
        const outcome = split(0, [{ size: 10 }, { size: 5 }])
        expect(paid(outcome)).toEqual([0, 0])
        expect(outcome.problem).toBeUndefined()
    })
})
