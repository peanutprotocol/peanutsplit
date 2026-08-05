import { describe, expect, it } from 'vitest'
import { EXACT_SETTLEMENT_MAX_NONZERO_BALANCES, suggestedTransfers } from '@/server/settlement'

const settledBalances = (balances: Map<string, bigint>) => {
    const after = new Map(balances)
    for (const transfer of suggestedTransfers(balances)) {
        const amount = BigInt(transfer.amountMinor)
        after.set(transfer.fromId, (after.get(transfer.fromId) ?? 0n) + amount)
        after.set(transfer.toId, (after.get(transfer.toId) ?? 0n) - amount)
    }
    return after
}

/** Independent exponential oracle for small property cases. It chooses the
 * zero-sum group containing the first remaining member, not an entry ordering
 * like the production subset DP. */
function exactMinimumTransferCount(amounts: readonly bigint[]): number {
    const nonzero = amounts.filter((amount) => amount !== 0n)
    if (nonzero.length === 0) return 0

    const stateCount = 2 ** nonzero.length
    const sums = new Array<bigint>(stateCount)
    sums[0] = 0n
    for (let mask = 1; mask < stateCount; mask++) {
        const bit = mask & -mask
        const index = 31 - Math.clz32(bit)
        sums[mask] = sums[mask ^ bit] + nonzero[index]
    }

    const memo = new Map<number, number>([[0, 0]])
    const maximumGroups = (mask: number): number => {
        const remembered = memo.get(mask)
        if (remembered !== undefined) return remembered

        const first = mask & -mask
        let best = Number.NEGATIVE_INFINITY
        for (let subset = mask; subset !== 0; subset = (subset - 1) & mask) {
            if ((subset & first) === 0 || sums[subset] !== 0n) continue
            best = Math.max(best, 1 + maximumGroups(mask ^ subset))
        }
        memo.set(mask, best)
        return best
    }

    return nonzero.length - maximumGroups(stateCount - 1)
}

function mulberry32(seed: number): () => number {
    let state = seed >>> 0
    return () => {
        state = (state + 0x6d2b79f5) >>> 0
        let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
        mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296
    }
}

const randomBalancedAmounts = (seed: number): bigint[] => {
    const rng = mulberry32(seed)
    const count = 2 + Math.floor(rng() * 7)
    const amounts = Array.from({ length: count - 1 }, () => BigInt(Math.floor(rng() * 11) - 5))
    amounts.push(-amounts.reduce((sum, amount) => sum + amount, 0n))
    return amounts
}

describe('hybrid settlement planning', () => {
    it('finds the three-transfer optimum that the greedy walk misses for five people', () => {
        const balances = new Map([
            ['ada', -700n],
            ['bo', -600n],
            ['cora', 600n],
            ['dev', 400n],
            ['emi', 300n],
        ])

        const transfers = suggestedTransfers(balances)

        expect(transfers).toHaveLength(3)
        expect([...settledBalances(balances).values()]).toEqual([0n, 0n, 0n, 0n, 0n])
    })

    it('matches an independent exact oracle across deterministic small balance maps', () => {
        for (let seed = 1; seed <= 120; seed++) {
            const amounts = randomBalancedAmounts(seed)
            const balances = new Map(amounts.map((amount, index) => [`m${index}`, amount]))
            const transfers = suggestedTransfers(balances)

            expect(`${seed}:${transfers.length}`).toBe(`${seed}:${exactMinimumTransferCount(amounts)}`)
            expect(`${seed}:${[...settledBalances(balances).values()].every((amount) => amount === 0n)}`).toBe(
                `${seed}:true`
            )
        }
    })

    it('is independent of balance-map insertion order when several exact plans tie', () => {
        const entries: [string, bigint][] = [
            ['ada', -700n],
            ['bo', -600n],
            ['cora', 600n],
            ['dev', 400n],
            ['emi', 300n],
        ]

        expect(suggestedTransfers(new Map(entries))).toEqual(suggestedTransfers(new Map([...entries].reverse())))
    })

    it('preserves the established greedy plan when exact search cannot remove a transfer', () => {
        const balances = new Map([
            ['a', 1n],
            ['b', 1n],
            ['c', -9n],
            ['d', -2n],
            ['e', -1n],
            ['f', 10n],
        ])

        expect(suggestedTransfers(balances)).toEqual([
            { fromId: 'c', toId: 'f', amountMinor: '9' },
            { fromId: 'd', toId: 'f', amountMinor: '1' },
            { fromId: 'd', toId: 'a', amountMinor: '1' },
            { fromId: 'e', toId: 'b', amountMinor: '1' },
        ])
    })

    it('puts the largest payment first when an exact plan improves on greedy', () => {
        const balances = new Map([
            ['a', -44n],
            ['b', 36n],
            ['c', 16n],
            ['d', -16n],
            ['e', 8n],
        ])

        const transfers = suggestedTransfers(balances)

        expect(transfers).toHaveLength(3)
        expect(transfers[0]).toEqual({ fromId: 'a', toId: 'b', amountMinor: '36' })
        expect([...settledBalances(balances).values()].every((amount) => amount === 0n)).toBe(true)
    })

    it('keeps exact arithmetic above Number.MAX_SAFE_INTEGER', () => {
        const unit = BigInt(Number.MAX_SAFE_INTEGER) + 2n
        const balances = new Map([
            ['ada', -7n * unit],
            ['bo', -6n * unit],
            ['cora', 6n * unit],
            ['dev', 4n * unit],
            ['emi', 3n * unit],
        ])

        expect(suggestedTransfers(balances)).toHaveLength(3)
        expect([...settledBalances(balances).values()].every((amount) => amount === 0n)).toBe(true)
    })

    it('retains generic greedy behavior for an unbalanced malformed map', () => {
        expect(
            suggestedTransfers(
                new Map([
                    ['debtor', -7n],
                    ['creditor-a', 5n],
                    ['creditor-b', 1n],
                ])
            )
        ).toEqual([
            { fromId: 'debtor', toId: 'creditor-a', amountMinor: '5' },
            { fromId: 'debtor', toId: 'creditor-b', amountMinor: '1' },
        ])
    })

    it('keeps the established deterministic greedy plan above the exact-search ceiling', () => {
        const padding = Array.from({ length: 7 }, (_, index) => {
            const amount = BigInt((index + 1) * 10_000)
            return [[`pad-debtor-${index}`, -amount] as const, [`pad-creditor-${index}`, amount] as const]
        }).flat()
        const balances = new Map<string, bigint>([
            ...padding,
            ['ada', -700n],
            ['bo', -600n],
            ['cora', 600n],
            ['dev', 400n],
            ['emi', 300n],
        ])
        expect([...balances.values()].filter((amount) => amount !== 0n)).toHaveLength(
            EXACT_SETTLEMENT_MAX_NONZERO_BALANCES + 1
        )

        const transfers = suggestedTransfers(balances)
        const expectedPadding = Array.from({ length: 7 }, (_, position) => {
            const index = 6 - position
            return {
                fromId: `pad-debtor-${index}`,
                toId: `pad-creditor-${index}`,
                amountMinor: String((index + 1) * 10_000),
            }
        })

        expect(transfers).toEqual([
            ...expectedPadding,
            { fromId: 'ada', toId: 'cora', amountMinor: '600' },
            { fromId: 'ada', toId: 'dev', amountMinor: '100' },
            { fromId: 'bo', toId: 'dev', amountMinor: '300' },
            { fromId: 'bo', toId: 'emi', amountMinor: '300' },
        ])
        expect([...settledBalances(balances).values()].every((amount) => amount === 0n)).toBe(true)
    })

    it('keeps the threshold-sized exact search inside the RoomState serialization budget', () => {
        // This 16-person core is deliberately not solved by the lower-bound
        // shortcut: greedy needs 15 transfers and exact needs 14. Candidate
        // thresholds above 16 are padded with exact pairs, preserving that gap.
        const credits = [101n, 103n, 107n, 109n, 113n, 127n, 131n, 137n]
        const debts = [-41n, -53n, -59n, -61n, -67n, -71n, -73n, -503n]
        const balances = new Map<string, bigint>([
            ...credits.map((amount, index) => [`core-creditor-${index}`, amount] as const),
            ...debts.map((amount, index) => [`core-debtor-${index}`, amount] as const),
        ])
        const paddingPairs = (EXACT_SETTLEMENT_MAX_NONZERO_BALANCES - 16) / 2
        for (let index = 0; index < paddingPairs; index++) {
            const amount = BigInt((index + 1) * 10_000)
            balances.set(`perf-debtor-${index}`, -amount)
            balances.set(`perf-creditor-${index}`, amount)
        }

        // Warm V8 before measuring the synchronous path used by `toRoomState`.
        expect(suggestedTransfers(balances)).toHaveLength(14 + paddingPairs)
        const started = performance.now()
        for (let run = 0; run < 3; run++) suggestedTransfers(balances)
        const perCall = (performance.now() - started) / 3

        expect(perCall).toBeLessThan(80)
    })
})
