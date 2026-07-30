import { describe, expect, it } from 'vitest'
import { billSplitCalculator } from './bill-split-calculator'
import type { ToolOutcome } from './types'

const { compute } = billSplitCalculator

/** Shares default to one each, which is what the page loads with. */
function split(bill: number, people: number, options: { tip?: number; shares?: number[] } = {}): ToolOutcome {
    const shares = options.shares ?? Array.from({ length: people }, () => 1)
    return compute({
        values: { bill, people, tip: options.tip ?? 0 },
        toggles: {},
        rows: shares.map((share, index) => ({ name: `Person ${index + 1}`, values: { share } })),
        decimals: 2,
    })
}

const paid = (outcome: ToolOutcome) => outcome.shares.map((share) => share.amountMinor)
const total = (outcome: ToolOutcome) => paid(outcome).reduce((running, amount) => running + amount, 0)

describe('bill split', () => {
    it('divides an even bill evenly', () => {
        expect(paid(split(6000, 4))).toEqual([1500, 1500, 1500, 1500])
    })

    it('adds the tip to the bill before dividing it', () => {
        const outcome = split(6000, 4, { tip: 10 })
        expect(outcome.totalMinor).toBe(6600)
        expect(paid(outcome)).toEqual([1650, 1650, 1650, 1650])
        expect(outcome.workings).toContainEqual({ label: 'Tip', amountMinor: 600 })
    })

    it('leaves the tip line off a bill with no tip on it', () => {
        expect(split(6000, 4).workings.map((working) => working.label)).toEqual(['Bill', 'Shares'])
    })

    it('gives a half share to somebody who skipped the drinks', () => {
        expect(paid(split(6000, 3, { shares: [0.5, 1, 1] }))).toEqual([1200, 2400, 2400])
    })

    it('gives a double share to somebody who ordered for two', () => {
        expect(paid(split(8000, 3, { shares: [2, 1, 1] }))).toEqual([4000, 2000, 2000])
    })

    /** The rule the FAQ promises: the column adds up to what is on the bill, always. */
    it('reconciles to the cent whatever the shares are', () => {
        for (const bill of [1, 999, 1000, 4737, 10_000, 123_457]) {
            for (const tip of [0, 10, 12.5, 20]) {
                for (const shares of [
                    [1, 1, 1],
                    [1, 0.5, 2],
                    [1, 1, 1, 1, 1, 1, 1],
                ]) {
                    const outcome = split(bill, shares.length, { tip, shares })
                    expect(total(outcome), `${bill} at ${tip}% across ${shares.join('/')}`).toBe(outcome.totalMinor)
                }
            }
        }
    })

    it('shows the working on every row', () => {
        expect(split(6000, 3, { shares: [0.5, 1, 1] }).shares[0].detail).toBe('0.5 of 2.5 shares')
    })

    it('has nothing to divide when nobody is paying', () => {
        expect(split(6000, 0, { shares: [] }).problem).toBe('Say how many people are paying.')
    })

    it('refuses a bill below nothing', () => {
        expect(split(-100, 3).problem).toBe('A bill cannot be less than nothing.')
    })

    it('refuses a total past what whole units can be counted in', () => {
        expect(split(Number.MAX_SAFE_INTEGER + 10, 3).problem).toBe('That is a bigger total than this page divides.')
    })

    it('says so when every share is set to nothing', () => {
        expect(split(6000, 3, { shares: [0, 0, 0] }).problem).toBe(
            'Every share is set to nothing, so there is nothing to divide.'
        )
    })

    it('splits a bill of nothing into nothing', () => {
        const outcome = split(0, 3)
        expect(paid(outcome)).toEqual([0, 0, 0])
        expect(outcome.problem).toBeUndefined()
    })

    it('reads a negative share as no share at all', () => {
        expect(paid(split(6000, 3, { shares: [-4, 1, 1] }))).toEqual([0, 3000, 3000])
    })
})
