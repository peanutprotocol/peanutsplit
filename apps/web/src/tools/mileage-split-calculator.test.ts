import { describe, expect, it } from 'vitest'
import { MILEAGE_RATES } from './mileage-rates'
import { buildCustomRate, mileageSplitCalculator } from './mileage-split-calculator'
import type { ToolOutcome } from './types'

const { compute } = mileageSplitCalculator

interface Options {
    rate?: number
    country?: string
    driverShares?: boolean
    shares?: number[]
    decimals?: number
}

/** Shares default to one each, which is what the page loads with. */
function drive(distance: number, passengers: number, options: Options = {}): ToolOutcome {
    const shares = options.shares ?? Array.from({ length: passengers }, () => 1)
    return compute({
        values: { distance, rate: options.rate ?? 0.55, passengers },
        toggles: { driverShares: options.driverShares ?? false },
        choices: { country: options.country ?? 'GB' },
        rows: shares.map((share, index) => ({ name: `Passenger ${index + 1}`, values: { share } })),
        decimals: options.decimals ?? 2,
    })
}

const paid = (outcome: ToolOutcome) => outcome.shares.map((share) => share.amountMinor)
const total = (outcome: ToolOutcome) => paid(outcome).reduce((running, amount) => running + amount, 0)
const working = (outcome: ToolOutcome, label: string) => outcome.workings.find((entry) => entry.label === label)

describe('mileage split', () => {
    it('costs the drive at the rate and divides it between the passengers', () => {
        const outcome = drive(300, 3)
        expect(outcome.totalMinor).toBe(16_500)
        expect(paid(outcome)).toEqual([5500, 5500, 5500])
    })

    /** The default reading of a lift: the car is the driver's contribution, the money is everyone else's. */
    it('leaves the driver out of the split unless the toggle says otherwise', () => {
        expect(paid(drive(300, 3)).length).toBe(3)
        expect(drive(300, 3).shares.map((share) => share.label)).toEqual(['Passenger 1', 'Passenger 2', 'Passenger 3'])
    })

    it('gives the driver a share of their own when the toggle is on', () => {
        const outcome = drive(300, 3, { driverShares: true })
        expect(outcome.shares[0].label).toBe('The driver')
        expect(paid(outcome)).toEqual([4125, 4125, 4125, 4125])
        expect(total(outcome)).toBe(outcome.totalMinor)
    })

    it('gives a half share to somebody who only rode one way', () => {
        expect(paid(drive(300, 3, { shares: [0.5, 1, 1] }))).toEqual([3300, 6600, 6600])
    })

    /**
     * Belgium publishes 0.4440 a kilometre, which is not a whole number of cents. The rate is a
     * plain figure for exactly this reason — rounding it to the currency first would lose 0.004 on
     * every kilometre and cost a 900 km drive over three euros.
     */
    it('keeps a rate that carries more decimals than the currency does', () => {
        expect(drive(900, 3, { rate: 0.444, country: 'BE' }).totalMinor).toBe(39_960)
    })

    /** A zero-decimal currency has no cents to round to, and the rate still applies per kilometre. */
    it('costs a drive in a currency with no minor unit', () => {
        expect(drive(300, 3, { rate: 120, decimals: 0 }).totalMinor).toBe(36_000)
    })

    it('names the unit the chosen country publishes its rate in', () => {
        expect(working(drive(300, 3, { country: 'GB' }), 'Distance')?.value).toBe('300 mi')
        expect(working(drive(300, 3, { country: 'DE' }), 'Distance')?.value).toBe('300 km')
        expect(working(drive(300, 3, { country: 'DE' }), 'Rate for each kilometre')).toBeDefined()
        expect(working(drive(300, 3, { country: 'US' }), 'Rate for each mile')).toBeDefined()
    })

    /** A country nothing in the data covers is not an error — it is the reader typing their own rate. */
    it('falls back to kilometres for a country the data does not carry', () => {
        expect(working(drive(300, 3, { country: 'other' }), 'Distance')?.value).toBe('300 km')
    })

    it('prints the rate as its government writes it, never below two decimals', () => {
        expect(working(drive(300, 3, { rate: 0.3 }), 'Rate for each mile')?.value).toBe('0.30')
        expect(working(drive(300, 3, { rate: 0.444 }), 'Rate for each mile')?.value).toBe('0.444')
    })

    describe('what it refuses to divide', () => {
        it('asks for the missing number rather than dividing nothing', () => {
            expect(drive(0, 3).problem).toBe('Put in how far the car went.')
            expect(drive(300, 3, { rate: 0 }).problem).toBe('Put in a rate for each mile.')
            expect(drive(300, 3, { rate: 0, country: 'FR' }).problem).toBe('Put in a rate for each kilometre.')
            expect(drive(300, 0).problem).toBe('Say how many people are riding with the driver.')
        })

        it('refuses a negative distance or rate', () => {
            expect(drive(-1, 3).problem).toBe('A distance cannot be less than nothing.')
            expect(drive(300, 3, { rate: -1 }).problem).toBe('A rate cannot be less than nothing.')
        })

        it('refuses a drive too long to count in whole cents', () => {
            expect(drive(Number.MAX_SAFE_INTEGER, 3).problem).toBe('That is a longer drive than this page divides.')
        })

        it('refuses a table where every share is nothing', () => {
            expect(drive(300, 3, { shares: [0, 0, 0] }).problem).toBe(
                'Every share is set to nothing, so there is nothing to divide.'
            )
        })
    })

    /** The rule the page promises: the column adds up to what the drive cost, always. */
    it('reconciles to the cent whatever the shares are', () => {
        for (const distance of [1, 7, 137, 903, 12_345]) {
            for (const rate of [0.25, 0.3, 0.444, 0.55, 0.91]) {
                for (const shares of [
                    [1, 1, 1],
                    [1, 0.5, 2],
                    [1, 1, 1, 1, 1, 1, 1],
                ]) {
                    for (const driverShares of [false, true]) {
                        const outcome = drive(distance, shares.length, { rate, shares, driverShares })
                        expect(total(outcome), `${distance} at ${rate} across ${shares.join('/')}`) //
                            .toBe(outcome.totalMinor)
                    }
                }
            }
        }
    })
})

describe('the custom-rate builder', () => {
    it('turns what the car drinks into a rate for each unit of distance', () => {
        // Seven litres every hundred at 1.60 the litre is 11.2 cents of fuel a kilometre.
        expect(buildCustomRate({ fuelPer100: 7, fuelPrice: 1.6, wear: 0 })).toEqual({ floor: 0.112, total: 0.112 })
    })

    /** The whole point of the fold: the fuel is the floor, and what goes on top is visible. */
    it('adds the wear on top of the fuel without hiding it', () => {
        expect(buildCustomRate({ fuelPer100: 7, fuelPrice: 1.6, wear: 0.25 })).toEqual({ floor: 0.112, total: 0.362 })
    })

    it('keeps four decimals, the way a published rate does', () => {
        // 7.7 × 1.539 ÷ 100 is 0.11850300 exactly, and Belgium publishes 0.4440 — two places is
        // not enough precision to write either of them down.
        expect(buildCustomRate({ fuelPer100: 7.7, fuelPrice: 1.539, wear: 0 }).floor).toBe(0.1185)
        expect(buildCustomRate({ fuelPer100: 10, fuelPrice: 1.5, wear: 0.294 }).total).toBe(0.444)
    })

    it('reads an empty fold, and a nonsense one, as nothing rather than as NaN', () => {
        expect(buildCustomRate({})).toEqual({ floor: 0, total: 0 })
        expect(buildCustomRate({ fuelPer100: -7, fuelPrice: 1.6, wear: -1 })).toEqual({ floor: 0, total: 0 })
        expect(buildCustomRate({ fuelPer100: Number.NaN, fuelPrice: 1.6, wear: 0 })).toEqual({ floor: 0, total: 0 })
    })

    /**
     * The builder feeds an input, so the only thing that matters downstream is that the split it
     * causes still adds up. A four-decimal rate is exactly the shape that would not, if the cost
     * were rounded per person rather than allocated by largest remainder.
     */
    it('produces a rate the split still reconciles to the cent at', () => {
        for (const wear of [0, 0.07, 0.2345]) {
            const { total: rate } = buildCustomRate({ fuelPer100: 7.4, fuelPrice: 1.679, wear })
            for (const distance of [1, 137, 903.5]) {
                for (const shares of [
                    [1, 1, 1],
                    [1, 0.5, 1],
                ]) {
                    // prettier-ignore
                    const outcome = drive(distance, shares.length, { rate, shares, country: 'DE' })
                    expect(total(outcome), `${distance} km at ${rate}`).toBe(outcome.totalMinor)
                    expect(outcome.totalMinor).toBe(Math.round(distance * rate * 100))
                }
            }
        }
    })
})

describe('the rate data', () => {
    it('publishes every rate with the page it was read off', () => {
        for (const row of MILEAGE_RATES) {
            expect(row.sourceUrl, `${row.code} source`).toMatch(/^https:\/\//)
            expect(row.sourceLabel.length, `${row.code} source label`).toBeGreaterThan(0)
            expect(row.note.length, `${row.code} note`).toBeGreaterThan(20)
        }
    })

    /**
     * Honesty over coverage. France, Ireland, Poland and Brazil are in the picker because a reader
     * looking for them should find out why there is no number, not because there is one.
     */
    it('leaves a country empty rather than inventing a single-trip rate for it', () => {
        const without = MILEAGE_RATES.filter((row) => row.rate === null).map((row) => row.code)
        expect(without.sort()).toEqual(['BR', 'FR', 'IE', 'PL'])
    })

    it('gives every country a rate in a currency the page can print', () => {
        for (const row of MILEAGE_RATES) {
            if (row.rate === null) continue
            expect(row.currency, `${row.code} ships a rate with no currency`).toBeTruthy()
        }
    })

    /** One option per row, and one picker value per country: a duplicate would shadow a rate. */
    it('names every country once', () => {
        const codes = MILEAGE_RATES.map((row) => row.code)
        expect(new Set(codes).size).toBe(codes.length)
    })
})
