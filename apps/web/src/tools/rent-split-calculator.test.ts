import { describe, expect, it } from 'vitest'
import { rentSplitCalculator } from './rent-split-calculator'
import type { ToolOutcome } from './types'

const { compute } = rentSplitCalculator

function split(rent: number, rooms: { size: number; income?: number }[], byIncome = false): ToolOutcome {
    return compute({
        values: { rent, people: rooms.length },
        toggles: { byIncome },
        choices: {},
        rows: rooms.map((room, index) => ({
            name: `Flatmate ${index + 1}`,
            values: { size: room.size, income: room.income ?? 0 },
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

describe('rent split weighted by income', () => {
    /** Same rooms, different pay: half the rent follows the room, half follows the income. */
    it('blends the room share and the income share in half', () => {
        const outcome = split(100_000, [{ size: 10, income: 300_000 }, { size: 10, income: 100_000 }], true) // prettier-ignore
        expect(paid(outcome)).toEqual([62_500, 37_500])
    })

    it('names both halves of the working', () => {
        const outcome = split(100_000, [{ size: 10, income: 300_000 }, { size: 10, income: 100_000 }], true) // prettier-ignore
        expect(outcome.shares[0].detail).toBe('room 50%, income 75%, so 62.5% of the rent')
        expect(outcome.workings).toContainEqual({ label: 'Income counted', amountMinor: 400_000 })
    })

    it('falls back to an even income share while no income is typed in', () => {
        // Rooms of 20 and 10 are two thirds and one third; an unstated income counts as half each.
        const outcome = split(120_000, [{ size: 20 }, { size: 10 }], true)
        expect(paid(outcome)).toEqual([70_000, 50_000])
    })

    it('leaves the income line off when the weighting is switched off', () => {
        expect(split(120_000, [{ size: 20 }, { size: 10 }]).workings.map((w) => w.label)).toEqual([
            'Rent',
            'Floor area measured',
        ])
    })
})

describe('rent split, the numbers that have to hold', () => {
    it('reconciles to the cent whatever the rooms and incomes are', () => {
        const flats = [
            [{ size: 14 }, { size: 11 }, { size: 9 }],
            [{ size: 12.5, income: 210_000 }, { size: 12.5, income: 190_000 }], // prettier-ignore
            [{ size: 30 }, { size: 0 }],
            [{ size: 1 }, { size: 1 }, { size: 1 }, { size: 1 }, { size: 1 }, { size: 1 }, { size: 1 }],
        ]
        for (const rooms of flats) {
            for (const rent of [1, 99_999, 100_000, 123_457, 1_000_003]) {
                for (const byIncome of [false, true]) {
                    const outcome = split(rent, rooms, byIncome)
                    expect(total(outcome), `${rent} across ${rooms.length} rooms`).toBe(rent)
                    expect(outcome.totalMinor).toBe(rent)
                }
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
