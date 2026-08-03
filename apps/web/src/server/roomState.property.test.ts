/**
 * Settlement money invariants, as properties rather than examples.
 *
 * `balance-derivation.test.ts` already runs 300 randomised rooms through the real server fold to
 * prove the CLIENT mirrors it. This file points the same technique at the other half of the money
 * surface — what happens to a room while it is being paid off:
 *
 *   1. settle every suggested transfer  → every balance is zero and nothing is left to suggest
 *   2. settle PART of a transfer        → the room still nets to zero and exactly that much debt moved
 *   3. delete a settlement              → the balances return to what they were before it, to the cent
 *
 * No arithmetic is re-implemented here. `balancesOf` and `suggestedTransfers` from
 * `src/server/roomState.ts` are the only maths in the file, which is the point: a second
 * implementation could drift with the thing it is meant to police.
 */
import { describe, expect, it } from 'vitest'
import { balancesOf, suggestedTransfers, type BalanceInput } from '@/server/roomState'

// ─── generator ───────────────────────────────────────────────────────────────

/** Deterministic PRNG, so a failing seed is reproducible in one line. */
function mulberry32(seed: number): () => number {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6d2b79f5) >>> 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
    }
}

const between = (rng: () => number, low: number, high: number): number => low + Math.floor(rng() * (high - low + 1))
const pick = <T>(rng: () => number, items: readonly T[]): T => items[Math.floor(rng() * items.length)]

/** Cut `total` into `count` nonnegative parts that sum to it exactly — the invariant every
 *  expense on the wire already satisfies. */
function randomParts(rng: () => number, total: bigint, count: number): bigint[] {
    const cuts = Array.from({ length: count - 1 }, () => BigInt(between(rng, 0, Number(total)))).sort((a, b) =>
        a === b ? 0 : a < b ? -1 : 1
    )
    const bounds = [0n, ...cuts, total]
    return Array.from({ length: count }, (_, index) => bounds[index + 1] - bounds[index])
}

type Room = {
    members: { id: string }[]
    expenses: { paidById: string; baseAmountMinor: bigint; shares: { memberId: string; amountMinor: bigint }[] }[]
    settlements: { fromId: string; toId: string; amountMinor: bigint }[]
}

function randomRoom(rng: () => number, seed: number): Room {
    const members = Array.from({ length: between(rng, 2, 6) }, (_, index) => ({ id: `m${seed}-${index}` }))
    const expenses = Array.from({ length: between(rng, 1, 8) }, () => {
        const participants = members.filter(() => rng() < 0.7)
        if (participants.length === 0) participants.push(pick(rng, members))
        const baseAmountMinor = BigInt(between(rng, 1, 500_000))
        const parts = randomParts(rng, baseAmountMinor, participants.length)
        return {
            paidById: pick(rng, members).id,
            baseAmountMinor,
            shares: participants.map((member, position) => ({ memberId: member.id, amountMinor: parts[position] })),
        }
    })
    return { members, expenses, settlements: [] }
}

const totalOf = (balances: Map<string, bigint>): bigint => [...balances.values()].reduce((a, b) => a + b, 0n)
const owedTotal = (balances: Map<string, bigint>): bigint =>
    [...balances.values()].filter((value) => value > 0n).reduce((a, b) => a + b, 0n)

const SEEDS = 300

// ─── the properties ──────────────────────────────────────────────────────────

describe('settling a room — property over randomised ledgers', () => {
    it('nets to zero before anybody has paid anything, for every generated room', () => {
        for (let seed = 1; seed <= SEEDS; seed++) {
            const room = randomRoom(mulberry32(seed), seed)
            expect(`${seed}:${totalOf(balancesOf(room as BalanceInput))}`).toBe(`${seed}:0`)
        }
    })

    it('clears every balance once the suggested transfers are recorded, and then suggests nothing', () => {
        for (let seed = 1; seed <= SEEDS; seed++) {
            const room = randomRoom(mulberry32(seed), seed)
            const transfers = suggestedTransfers(balancesOf(room as BalanceInput))

            // Each suggestion, recorded exactly as the settlement route would write it.
            const settled: Room = {
                ...room,
                settlements: transfers.map((transfer) => ({
                    fromId: transfer.fromId,
                    toId: transfer.toId,
                    amountMinor: BigInt(transfer.amountMinor),
                })),
            }
            const after = balancesOf(settled as BalanceInput)
            for (const [memberId, balance] of after)
                expect(`${seed}:${memberId}=${balance}`).toBe(`${seed}:${memberId}=0`)
            expect(`${seed}:${suggestedTransfers(after).length}`).toBe(`${seed}:0`)
        }
    })

    it('never suggests a self-payment, a non-positive amount, or more than n−1 transfers', () => {
        for (let seed = 1; seed <= SEEDS; seed++) {
            const room = randomRoom(mulberry32(seed), seed)
            const balances = balancesOf(room as BalanceInput)
            const transfers = suggestedTransfers(balances)

            expect(`${seed}:${transfers.length <= room.members.length - 1}`).toBe(`${seed}:true`)
            let moved = 0n
            for (const transfer of transfers) {
                expect(`${seed}:${transfer.fromId === transfer.toId}`).toBe(`${seed}:false`)
                expect(`${seed}:${BigInt(transfer.amountMinor) > 0n}`).toBe(`${seed}:true`)
                moved += BigInt(transfer.amountMinor)
            }
            // No money is invented and none is lost: the plan moves exactly what is owed.
            expect(`${seed}:${moved}`).toBe(`${seed}:${owedTotal(balances)}`)
        }
    })

    it('is deterministic — the same room suggests the same plan twice', () => {
        for (let seed = 1; seed <= SEEDS; seed++) {
            const room = randomRoom(mulberry32(seed), seed)
            const balances = balancesOf(room as BalanceInput)
            expect(JSON.stringify(suggestedTransfers(balances))).toBe(JSON.stringify(suggestedTransfers(balances)))
        }
    })
})

describe('recording part of a debt — property', () => {
    /** Everything the settlement route enforces about the amount: a positive number no larger
     *  than the smaller of the payer's debt and the payee's credit. */
    const ceilingFor = (balances: Map<string, bigint>, fromId: string, toId: string): bigint => {
        const debt = -(balances.get(fromId) ?? 0n)
        const credit = balances.get(toId) ?? 0n
        return debt < credit ? debt : credit
    }

    it('moves exactly the amount paid and leaves the rest outstanding, for every generated room', () => {
        for (let seed = 1; seed <= SEEDS; seed++) {
            const rng = mulberry32(seed)
            const room = randomRoom(rng, seed)
            const before = balancesOf(room as BalanceInput)
            const [transfer] = suggestedTransfers(before)
            if (!transfer) continue

            const ceiling = ceilingFor(before, transfer.fromId, transfer.toId)
            // A real part-payment: at least one minor unit, never the whole thing when there is
            // room to leave a remainder.
            const paid = ceiling > 1n ? BigInt(between(rng, 1, Number(ceiling) - 1)) : ceiling
            const partly: Room = {
                ...room,
                settlements: [{ fromId: transfer.fromId, toId: transfer.toId, amountMinor: paid }],
            }
            const after = balancesOf(partly as BalanceInput)

            expect(`${seed}:${totalOf(after)}`).toBe(`${seed}:0`)
            expect(`${seed}:${after.get(transfer.fromId)}`).toBe(
                `${seed}:${(before.get(transfer.fromId) ?? 0n) + paid}`
            )
            expect(`${seed}:${after.get(transfer.toId)}`).toBe(`${seed}:${(before.get(transfer.toId) ?? 0n) - paid}`)
            // Everybody else is untouched by a payment between two other people.
            for (const member of room.members) {
                if (member.id === transfer.fromId || member.id === transfer.toId) continue
                expect(`${seed}:${member.id}=${after.get(member.id)}`).toBe(
                    `${seed}:${member.id}=${before.get(member.id)}`
                )
            }
            // The outstanding total drops by exactly what was handed over.
            expect(`${seed}:${owedTotal(after)}`).toBe(`${seed}:${owedTotal(before) - paid}`)
        }
    })

    it('leaves nothing outstanding when the part-payments add up to the whole plan', () => {
        for (let seed = 1; seed <= SEEDS; seed++) {
            const rng = mulberry32(seed)
            const room = randomRoom(rng, seed)
            const transfers = suggestedTransfers(balancesOf(room as BalanceInput))
            if (transfers.length === 0) continue

            // Every suggestion paid in two instalments rather than one — the ordinary case of
            // somebody sending what they have now and the rest on Friday.
            const settlements = transfers.flatMap((transfer) => {
                const amount = BigInt(transfer.amountMinor)
                const first = amount > 1n ? BigInt(between(rng, 1, Number(amount) - 1)) : amount
                const rest = amount - first
                return rest === 0n
                    ? [{ fromId: transfer.fromId, toId: transfer.toId, amountMinor: first }]
                    : [
                          { fromId: transfer.fromId, toId: transfer.toId, amountMinor: first },
                          { fromId: transfer.fromId, toId: transfer.toId, amountMinor: rest },
                      ]
            })
            const after = balancesOf({ ...room, settlements } as BalanceInput)
            expect(`${seed}:${owedTotal(after)}`).toBe(`${seed}:0`)
            expect(`${seed}:${suggestedTransfers(after).length}`).toBe(`${seed}:0`)
        }
    })
})

describe('deleting a settlement — property', () => {
    /** A soft delete drops the row from the fold: `roomArgs` filters `deletedAt: null` before
     *  `balancesOf` ever sees it, so undoing a mistaken "paid" has to be a clean subtraction. */
    it('returns every balance to exactly what it was before the payment was recorded', () => {
        for (let seed = 1; seed <= SEEDS; seed++) {
            const rng = mulberry32(seed)
            const room = randomRoom(rng, seed)
            const before = balancesOf(room as BalanceInput)
            const transfers = suggestedTransfers(before)
            if (transfers.length === 0) continue

            const settlements = transfers.map((transfer) => ({
                fromId: transfer.fromId,
                toId: transfer.toId,
                amountMinor: BigInt(transfer.amountMinor),
            }))
            // Delete one of them — the wire shape of a soft delete is simply its absence.
            const dropped = between(rng, 0, settlements.length - 1)
            const kept = settlements.filter((_, index) => index !== dropped)
            const removed = settlements[dropped]

            const after = balancesOf({ ...room, settlements: kept } as BalanceInput)
            const withAll = balancesOf({ ...room, settlements } as BalanceInput)

            expect(`${seed}:${totalOf(after)}`).toBe(`${seed}:0`)
            expect(`${seed}:${after.get(removed.fromId)}`).toBe(
                `${seed}:${(withAll.get(removed.fromId) ?? 0n) - removed.amountMinor}`
            )
            expect(`${seed}:${after.get(removed.toId)}`).toBe(
                `${seed}:${(withAll.get(removed.toId) ?? 0n) + removed.amountMinor}`
            )
        }
    })

    it('is order-independent — deleting every payment one by one restores the untouched room', () => {
        for (let seed = 1; seed <= SEEDS; seed++) {
            const rng = mulberry32(seed)
            const room = randomRoom(rng, seed)
            const before = balancesOf(room as BalanceInput)
            let settlements = suggestedTransfers(before).map((transfer) => ({
                fromId: transfer.fromId,
                toId: transfer.toId,
                amountMinor: BigInt(transfer.amountMinor),
            }))
            if (settlements.length === 0) continue

            // Undo them in a random order, checking the room stays coherent at every step.
            while (settlements.length > 0) {
                settlements = settlements.filter((_, index) => index !== between(rng, 0, settlements.length - 1))
                expect(`${seed}:${totalOf(balancesOf({ ...room, settlements } as BalanceInput))}`).toBe(`${seed}:0`)
            }
            const restored = balancesOf({ ...room, settlements } as BalanceInput)
            for (const [memberId, balance] of restored) {
                expect(`${seed}:${memberId}=${balance}`).toBe(`${seed}:${memberId}=${before.get(memberId)}`)
            }
        }
    })
})
