import { describe, expect, it } from 'vitest'
import { convertMinorAtRate, MAX_SIGNED_MINOR, STATIC_USD_PER_UNIT } from '@/server/money'
import { equalShares, exactShares, sumShares, weightedShares } from '@/server/split'

const STATIC_CODES = Object.keys(STATIC_USD_PER_UNIT)
const usdPerUnit = (code: string) => STATIC_USD_PER_UNIT[code]
const staticRate = (from: string, to: string) => usdPerUnit(from) / usdPerUnit(to)
const amounts = (shares: { amountMinor: bigint }[]) => shares.map((s) => s.amountMinor)

describe('equalShares', () => {
    it('splits €10 three ways as 3.34 / 3.33 / 3.33', () => {
        expect(amounts(equalShares(1000n, ['a', 'b', 'c']))).toEqual([334n, 333n, 333n])
    })

    it('always sums to the total, for every remainder', () => {
        for (let total = 0; total < 60; total++) {
            for (let n = 1; n <= 7; n++) {
                const ids = Array.from({ length: n }, (_, i) => `m${i}`)
                expect(sumShares(equalShares(BigInt(total), ids))).toBe(BigInt(total))
            }
        }
    })

    it('spreads the remainder one unit at a time, never two', () => {
        const shares = equalShares(1002n, ['a', 'b', 'c', 'd', 'e'])
        expect(amounts(shares)).toEqual([201n, 201n, 200n, 200n, 200n])
    })

    it('leaves enteredAmountMinor null — EQUAL has nothing typed per person', () => {
        expect(equalShares(300n, ['a', 'b'])[0].enteredAmountMinor).toBeNull()
        expect(equalShares(300n, ['a', 'b'])[0].splitWeight).toBeNull()
    })

    it('refuses an expense with no participants', () => {
        expect(() => equalShares(100n, [])).toThrow()
    })
})

describe('weightedShares', () => {
    it('splits 10 minor units at 2 shares to 1 as 7 / 3', () => {
        expect(
            amounts(
                weightedShares(10n, [
                    { memberId: 'a', weight: 2n },
                    { memberId: 'b', weight: 1n },
                ])
            )
        ).toEqual([7n, 3n])
    })

    it('splits a 10-unit percentage total at 33.33 / 33.33 / 33.34 as 3 / 3 / 4', () => {
        expect(
            amounts(
                weightedShares(10n, [
                    { memberId: 'a', weight: 3333n },
                    { memberId: 'b', weight: 3333n },
                    { memberId: 'c', weight: 3334n },
                ])
            )
        ).toEqual([3n, 3n, 4n])
    })

    it('uses largest remainders and preserves the entered integer weights', () => {
        const shares = weightedShares(1001n, [
            { memberId: 'a', weight: 1n },
            { memberId: 'b', weight: 2n },
            { memberId: 'c', weight: 3n },
        ])

        expect(amounts(shares)).toEqual([167n, 334n, 500n])
        expect(shares.map((share) => share.splitWeight)).toEqual([1n, 2n, 3n])
        expect(shares.every((share) => share.enteredAmountMinor === null)).toBe(true)
        expect(sumShares(shares)).toBe(1001n)
    })

    it('breaks equal-remainder ties by input order deterministically', () => {
        const weights = ['first', 'second', 'third'].map((memberId) => ({ memberId, weight: 1n }))
        expect(amounts(weightedShares(2n, weights))).toEqual([1n, 1n, 0n])
        expect(weightedShares(2n, weights)).toEqual(weightedShares(2n, weights))
    })

    it('does all arithmetic as BigInt above Number safe-integer precision', () => {
        const huge = 9_007_199_254_740_993n
        const shares = weightedShares(10_000_000_000_000_001n, [
            { memberId: 'a', weight: huge },
            { memberId: 'b', weight: huge + 1n },
            { memberId: 'c', weight: 1n },
        ])
        expect(sumShares(shares)).toBe(10_000_000_000_000_001n)
        expect(shares.map((share) => share.splitWeight)).toEqual([huge, huge + 1n, 1n])
    })

    it('always sums exactly to the total across small totals and varied weights', () => {
        for (let total = 0; total < 60; total++) {
            for (let size = 1; size <= 7; size++) {
                const weights = Array.from({ length: size }, (_, index) => ({
                    memberId: `m${index}`,
                    weight: BigInt((index + 1) * (size + 2)),
                }))
                expect(sumShares(weightedShares(BigInt(total), weights))).toBe(BigInt(total))
            }
        }
    })

    it('refuses missing and non-positive weights', () => {
        expect(() => weightedShares(100n, [])).toThrow()
        expect(() => weightedShares(100n, [{ memberId: 'a', weight: 0n }])).toThrow()
        expect(() => weightedShares(100n, [{ memberId: 'a', weight: -1n }])).toThrow()
    })
})

describe('exactShares', () => {
    const rate = staticRate('THB', 'EUR')

    it('keeps the entered amounts verbatim in the expense currency', () => {
        const baseTotal = convertMinorAtRate(300_000n, 'THB', 'EUR', rate)
        const shares = exactShares(
            [
                { memberId: 'a', amountMinor: 100_000n },
                { memberId: 'b', amountMinor: 200_000n },
            ],
            'THB',
            'EUR',
            baseTotal,
            rate
        )
        expect(shares.map((s) => s.enteredAmountMinor)).toEqual([100_000n, 200_000n])
        expect(shares.every((s) => s.splitWeight === null)).toBe(true)
    })

    it('sums to the converted total even when every share rounds down', () => {
        // €0.05 × 3 at 1.08 USD/EUR: each share rounds 5.4 → 5, but the €0.15
        // total converts to 16, so one cent of residue has to land somewhere.
        const entered = [
            { memberId: 'a', amountMinor: 5n },
            { memberId: 'b', amountMinor: 5n },
            { memberId: 'c', amountMinor: 5n },
        ]
        const baseTotal = convertMinorAtRate(15n, 'EUR', 'USD', 1.08)
        const shares = exactShares(entered, 'EUR', 'USD', baseTotal, 1.08)
        expect(baseTotal).toBe(16n)
        expect(amounts(shares)).toEqual([6n, 5n, 5n])
        expect(sumShares(shares)).toBe(baseTotal)
    })

    it('never makes a share negative when independent FX rounding exceeds the converted total', () => {
        // R$0.03 converts to half a euro cent at the static rate. Independently
        // rounding four shares produces [1, 1, 1, 1], while the R$0.12 total is
        // only €0.02. The old single-row correction persisted [-1, 1, 1, 1].
        const brlToEur = staticRate('BRL', 'EUR')
        const entered = ['a', 'b', 'c', 'd'].map((memberId) => ({ memberId, amountMinor: 3n }))
        const baseTotal = convertMinorAtRate(12n, 'BRL', 'EUR', brlToEur)
        const shares = exactShares(entered, 'BRL', 'EUR', baseTotal, brlToEur)

        expect(baseTotal).toBe(2n)
        expect(amounts(shares)).toEqual([1n, 1n, 0n, 0n])
        expect(shares.every((share) => share.amountMinor >= 0n)).toBe(true)
        expect(sumShares(shares)).toBe(baseTotal)
    })

    it('is deterministic, nonnegative and exact across every currency pair and roster size', () => {
        for (const from of STATIC_CODES) {
            for (const to of STATIC_CODES) {
                const pairRate = staticRate(from, to)
                for (let size = 1; size <= 20; size++) {
                    const entered = Array.from({ length: size }, (_, index) => ({
                        memberId: `m${index}`,
                        amountMinor: BigInt(1 + ((index * 7 + size) % 53)),
                    }))
                    const enteredTotal = entered.reduce((sum, share) => sum + share.amountMinor, 0n)
                    const baseTotal = convertMinorAtRate(enteredTotal, from, to, pairRate)
                    const first = exactShares(entered, from, to, baseTotal, pairRate)
                    const second = exactShares(entered, from, to, baseTotal, pairRate)

                    expect(first).toEqual(second)
                    expect(first.every((share) => share.amountMinor >= 0n)).toBe(true)
                    expect(sumShares(first)).toBe(baseTotal)
                }
            }
        }
    })

    it('re-splitting the stored entered amounts reproduces the same shares (no drift)', () => {
        const baseTotal = convertMinorAtRate(15n, 'EUR', 'USD', 1.08)
        const first = exactShares(
            [
                { memberId: 'a', amountMinor: 5n },
                { memberId: 'b', amountMinor: 5n },
                { memberId: 'c', amountMinor: 5n },
            ],
            'EUR',
            'USD',
            baseTotal,
            1.08
        )
        const second = exactShares(
            first.map((s) => ({ memberId: s.memberId, amountMinor: s.enteredAmountMinor! })),
            'EUR',
            'USD',
            baseTotal,
            1.08
        )
        expect(amounts(second)).toEqual(amounts(first))
        expect(sumShares(second)).toBe(baseTotal)
    })

    it('reconciles a realistic foreign-currency bill to the exact converted total', () => {
        const baseTotal = convertMinorAtRate(300_000n, 'THB', 'EUR', rate)
        const shares = exactShares(
            [
                { memberId: 'a', amountMinor: 100_000n },
                { memberId: 'b', amountMinor: 200_000n },
            ],
            'THB',
            'EUR',
            baseTotal,
            rate
        )
        expect(sumShares(shares)).toBe(baseTotal)
        expect(amounts(shares)).toEqual([2593n, 5185n])
    })

    it('is exact for a same-currency split', () => {
        const shares = exactShares(
            [
                { memberId: 'a', amountMinor: 700n },
                { memberId: 'b', amountMinor: 300n },
            ],
            'EUR',
            'EUR',
            1000n,
            1
        )
        expect(amounts(shares)).toEqual([700n, 300n])
    })
})

/**
 * `exactShares` and `convertMinorAtRate` are hand-kept character-identical arithmetic
 * (`split.ts` says so), and `buildExpense` throws a raw 500 when they disagree. Raising
 * `RATE_SCALE` moved both, so the agreement needs a test that covers the pairs the 162-code
 * catalog reaches — not just the twelve where the rates are all within four orders of magnitude.
 */
describe('exactShares agrees with convertMinorAtRate at the new scale', () => {
    const pairs: [string, string, number][] = [
        ['THB', 'EUR', 0.028 / 1.08],
        ['JPY', 'KWD', 0.0064 / 3.2673], // 0 decimals → 3 decimals
        ['KWD', 'JPY', 3.2673 / 0.0064], // 3 decimals → 0 decimals, a ~510x multiply
        ['IRR', 'KWD', 0.0000002418180611634891], // the smallest cross rate in the catalog
        ['KWD', 'IRR', 4_135_340.409184394], // the largest
        ['USD', 'DOGE', 1], // a made-up ticker, priced only against itself
    ]

    it('reconciles every share to the converted total, for every roster size', () => {
        for (const [from, to, rate] of pairs) {
            for (let size = 1; size <= 12; size++) {
                const entered = Array.from({ length: size }, (_, index) => ({
                    memberId: `m${index}`,
                    amountMinor: BigInt(1 + ((index * 7919 + size) % 100_003)),
                }))
                const total = entered.reduce((sum, share) => sum + share.amountMinor, 0n)
                const baseTotal = convertMinorAtRate(total, from, to, rate)
                const shares = exactShares(entered, from, to, baseTotal, rate)

                expect(sumShares(shares)).toBe(baseTotal)
                expect(shares.every((share) => share.amountMinor >= 0n)).toBe(true)
            }
        }
    })

    /** The stored rate has to survive the column it goes into. `Decimal(24,12)` holds 12 integer
     *  digits; the widest rate the catalog reaches is about 4.1e6, so eight are used. */
    it('stores a rate that fits Decimal(24,12) at both ends of the catalog', () => {
        for (const [, , rate] of pairs) {
            const stored = rate.toFixed(12)
            const [whole, fraction] = stored.split('.')
            expect(whole.replace('-', '').length).toBeLessThanOrEqual(12)
            expect(fraction).toHaveLength(12)
        }
    })

    /** KWD → IRR multiplies a stored minor amount by about 4 135 — a rate of 4.1e6 over a
     *  three-decimal gap — which is the largest blow-up in the catalog and far past anything the
     *  twelve codes could do. `buildExpense` refuses the result with AMOUNT_TOO_LARGE rather than
     *  handing Postgres a number the BIGINT column cannot hold, so the boundary has to be real. */
    it('leaves a conversion that would overflow the column detectable, not wrapped', () => {
        const huge = convertMinorAtRate(10_000_000_000_000_000n, 'KWD', 'IRR', 4_135_340.409184394)
        expect(huge).toBeGreaterThan(MAX_SIGNED_MINOR)
        expect(convertMinorAtRate(1_000_000n, 'KWD', 'IRR', 4_135_340.409184394)).toBeLessThan(MAX_SIGNED_MINOR)
    })
})
