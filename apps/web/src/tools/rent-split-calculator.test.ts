import { describe, expect, it } from 'vitest'
import { rentSplitCalculator } from './rent-split-calculator'
import type { ToolOutcome } from './types'

const { compute } = rentSplitCalculator

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
    })
}

const paid = (outcome: ToolOutcome) => outcome.shares.map((share) => share.amountMinor)
const total = (outcome: ToolOutcome) => paid(outcome).reduce((running, amount) => running + amount, 0)

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

    /** Same rooms, different notches: half the rent follows the room, half follows the slider. */
    it('blends the room share and the slider share in half once they are apart', () => {
        const outcome = split(100_000, [{ size: 10, rich: 5 }, { size: 10, rich: 1 }]) // prettier-ignore
        expect(paid(outcome)).toEqual([66_667, 33_333])
    })

    /** The notch IS the weight — five counts five times as much as one. This is the documented map. */
    it('weights a notch by its own number', () => {
        const outcome = split(120_000, [{ size: 0, rich: 1 }, { size: 0, rich: 2 }, { size: 0, rich: 3 }]) // prettier-ignore
        // Rooms unmeasured, so the room half is equal thirds and the slider half is 1:2:3 of six.
        expect(paid(outcome)).toEqual([30_000, 40_000, 50_000])
    })

    it('names both halves of the working', () => {
        const outcome = split(100_000, [{ size: 10, rich: 5 }, { size: 10, rich: 1 }]) // prettier-ignore
        expect(outcome.shares[0].detail).toBe('room 50%, slider 83.3%, so 66.7% of the rent')
        expect(outcome.workings).toContainEqual({ label: 'Where the sliders sit', value: '5, 1' })
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
        ]
        for (const rooms of flats) {
            for (const rent of [1, 99_999, 100_000, 123_457, 1_000_003]) {
                const outcome = split(rent, rooms)
                expect(total(outcome), `${rent} across ${rooms.length} rooms`).toBe(rent)
                expect(outcome.totalMinor).toBe(rent)
            }
        }
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
