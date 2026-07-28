import { describe, expect, it } from 'vitest'
import { CURRENCIES, convertMinorAtRate } from '@/server/money'
import { equalShares, exactShares, sumShares } from '@/server/split'

const usdPerUnit = (code: string) => CURRENCIES.find((c) => c.code === code)!.usdPerUnit
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
    })

    it('refuses an expense with no participants', () => {
        expect(() => equalShares(100n, [])).toThrow()
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
        for (const from of CURRENCIES) {
            for (const to of CURRENCIES) {
                const pairRate = staticRate(from.code, to.code)
                for (let size = 1; size <= 20; size++) {
                    const entered = Array.from({ length: size }, (_, index) => ({
                        memberId: `m${index}`,
                        amountMinor: BigInt(1 + ((index * 7 + size) % 53)),
                    }))
                    const enteredTotal = entered.reduce((sum, share) => sum + share.amountMinor, 0n)
                    const baseTotal = convertMinorAtRate(enteredTotal, from.code, to.code, pairRate)
                    const first = exactShares(entered, from.code, to.code, baseTotal, pairRate)
                    const second = exactShares(entered, from.code, to.code, baseTotal, pairRate)

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
