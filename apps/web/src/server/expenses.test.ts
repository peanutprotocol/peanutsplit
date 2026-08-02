/**
 * `buildExpense`, and the one property the whole ledger rests on: an edit that does not change
 * the money must not change the money.
 *
 * Two ways that broke, both measured over a sweep rather than a handful of cases, because both
 * were found as a percentage of realistic (pair, amount) draws and neither shows up on round
 * numbers:
 *
 *  1. A create converted at the full precision of the quote and stored `rate.toFixed(12)`. The
 *     edit path read that column back and converted again, so the two arithmetics disagreed by one
 *     minor unit on 0.490% of the draws below. It was 0.000% at the old `RATE_SCALE = 1e9`,
 *     because 9dp scaling is coarser than the column and truncating to 12 digits could not move
 *     the scaled integer. Raising the scale to 1e18 made the column the coarser of the two.
 *  2. Rows written at `RATE_SCALE = 1e9` carry a total the current arithmetic does not reproduce —
 *     1.186% of the draws below, unfixably, because the rate that priced them is gone. Only not
 *     recomputing at all leaves them alone.
 *
 * No database: `buildExpense` takes the room and the rate table as arguments.
 */
import { describe, expect, it } from 'vitest'
import { buildExpense, type ExistingExpense } from '@/server/expenses'
import type { RateTable } from '@/server/fx'
import { ApiError } from '@/server/http'
import { convertMinorAtRate, decimalsOf, quantiseRate, STATIC_USD_PER_UNIT } from '@/server/money'
import type { RoomWithRelations } from '@/server/roomState'
import { sumShares } from '@/server/split'
import type { ExpenseBody } from '@/server/validation'

const MEMBERS = ['ana', 'bea', 'caro', 'dani', 'eve']

/** `buildExpense` reads exactly two things off a room: its currency and its member ids. */
const roomIn = (currency: string): RoomWithRelations =>
    ({ id: 'room', currency, members: MEMBERS.map((id) => ({ id })) }) as unknown as RoomWithRelations

const tableOf = (usdPerUnit: Record<string, number>): RateTable => ({
    usdPerUnit,
    source: 'static',
    fetchedAt: null,
})

const STATIC_TABLE = tableOf({ ...STATIC_USD_PER_UNIT })

const body = (over: Partial<ExpenseBody> & { paidById?: string } = {}): ExpenseBody & { paidById: string } => ({
    description: 'Dinner',
    amountMinor: '10000',
    currency: 'USD',
    paidById: 'ana',
    splitMode: 'EQUAL',
    participantIds: ['ana', 'bea'],
    ...over,
})

/** The row a create wrote, in the shape the edit path hands back to `buildExpense`. */
const rowOf = (write: { amountMinor: bigint; currency: string; baseAmountMinor: bigint; fxRate: string }) =>
    ({
        date: new Date('2026-07-01T00:00:00.000Z'),
        currency: write.currency,
        fxRate: write.fxRate,
        amountMinor: write.amountMinor,
        baseAmountMinor: write.baseAmountMinor,
    }) as unknown as ExistingExpense

/** The arithmetic of the shipped code, before `RATE_SCALE` moved to 1e18. Spelled out rather than
 *  described, so the test states exactly what wrote the rows it is protecting. */
const OLD_RATE_SCALE = 1_000_000_000n
function convertAtOldScale(amountMinor: bigint, from: string, to: string, rate: number): bigint {
    if (from === to) return amountMinor
    const num = amountMinor * BigInt(Math.round(rate * Number(OLD_RATE_SCALE))) * 10n ** BigInt(decimalsOf(to))
    const den = OLD_RATE_SCALE * 10n ** BigInt(decimalsOf(from))
    return (num + den / 2n) / den
}

/** mulberry32 — the sweep has to be the same sweep on every machine and every run. */
function rng(seed: number): () => number {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6d2b79f5) >>> 0
        let t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

const CODES = Object.keys(STATIC_USD_PER_UNIT)
/** All 132 ordered pairs of the twelve codes every existing prod room uses. */
const PAIRS = CODES.flatMap((from) => CODES.filter((to) => to !== from).map((to) => [from, to] as const))
const DRAWS = 400
const SWEEP_CASES = PAIRS.length * DRAWS

/** Amounts up to ~50 000 major units — a holiday, not a rounding demo. One stream per pair, so a
 *  pair's draws do not shift when another pair's loop changes. */
const amountsFor = (seed: number, pair: readonly [string, string]): bigint[] => {
    const rand = rng(seed + PAIRS.findIndex(([f, t]) => f === pair[0] && t === pair[1]))
    return Array.from({ length: DRAWS }, () => BigInt(Math.floor(rand() * 5_000_000) + 1))
}

describe('a description-only edit does not move the money', () => {
    it('reproduces the created total across every legacy pair and 52 800 amounts', async () => {
        expect(SWEEP_CASES).toBe(52_800)
        let moved = 0

        await Promise.all(
            PAIRS.map(async (pair) => {
                const [from, to] = pair
                for (const amountMinor of amountsFor(20260731, pair)) {
                    const room = roomIn(to)
                    const created = await buildExpense(
                        room,
                        body({ currency: from, amountMinor: amountMinor.toString() }),
                        undefined,
                        STATIC_TABLE
                    )
                    const edited = await buildExpense(
                        room,
                        body({
                            currency: from,
                            amountMinor: amountMinor.toString(),
                            description: 'Dinner (split with Caro)',
                        }),
                        rowOf(created),
                        STATIC_TABLE
                    )
                    if (edited.baseAmountMinor !== created.baseAmountMinor) moved++
                    expect(edited.fxRate).toBe(created.fxRate)
                    expect(edited.shares.map((s) => s.amountMinor)).toEqual(created.shares.map((s) => s.amountMinor))
                }
            })
        )
        expect(moved).toBe(0)
    })

    /**
     * The reviewer's case. £37 288.62 into a EUR room: the create said €43 848.65 and a PATCH that
     * only changed the description said €43 848.66.
     *
     * The one they now agree on is 43 848.66 — the number the stored rate implies. A create that
     * converts at more precision than it can record is the half that was wrong, so it is the half
     * that moved.
     */
    it('holds on GBP→EUR 3 728 862, where the two arithmetics used to disagree', async () => {
        const room = roomIn('EUR')
        const created = await buildExpense(
            room,
            body({ currency: 'GBP', amountMinor: '3728862' }),
            undefined,
            STATIC_TABLE
        )
        expect(created.fxRate).toBe('1.175925925926')
        expect(created.baseAmountMinor).toBe(4_384_866n)
        expect(convertMinorAtRate(3_728_862n, 'GBP', 'EUR', Number(created.fxRate))).toBe(4_384_866n)

        const edited = await buildExpense(
            room,
            body({ currency: 'GBP', amountMinor: '3728862', description: 'Marina fees (final)' }),
            rowOf(created),
            STATIC_TABLE
        )
        expect(edited.baseAmountMinor).toBe(4_384_866n)
    })

    /** Three decimals into zero decimals, the shape the 162-code catalog introduces and the twelve
     *  never could. Neither code is in the static table, so the rate table is built for the pair. */
    it('holds on BHD→JPY, a three-decimal currency into a zero-decimal one', async () => {
        const table = tableOf({ BHD: 2.65, JPY: 0.0064 })
        const room = roomIn('JPY')
        const created = await buildExpense(room, body({ currency: 'BHD', amountMinor: '1000000' }), undefined, table)
        const edited = await buildExpense(
            room,
            body({ currency: 'BHD', amountMinor: '1000000', description: 'renamed' }),
            rowOf(created),
            table
        )
        expect(edited.baseAmountMinor).toBe(created.baseAmountMinor)
    })

    it('holds for an EXACT split, where the shares are apportioned and not just divided', async () => {
        const room = roomIn('EUR')
        const exact = {
            currency: 'THB',
            amountMinor: '300012',
            splitMode: 'EXACT' as const,
            exactShares: [
                { memberId: 'ana', amountMinor: '100004' },
                { memberId: 'bea', amountMinor: '100004' },
                { memberId: 'caro', amountMinor: '100004' },
            ],
        }
        const created = await buildExpense(room, body(exact), undefined, STATIC_TABLE)
        const edited = await buildExpense(
            room,
            body({ ...exact, description: 'renamed' }),
            rowOf(created),
            STATIC_TABLE
        )
        expect(edited.baseAmountMinor).toBe(created.baseAmountMinor)
        expect(edited.shares).toEqual(created.shares)
        expect(sumShares(edited.shares)).toBe(edited.baseAmountMinor)
    })
})

describe('the stored rate is the rate that priced the expense', () => {
    /**
     * The root cause of the drift above, isolated from the carry-forward that also hides it. A
     * create must be reproducible from the column alone, because that column is the only record of
     * the rate: converting the created amount at `Number(row.fxRate)` has to land back on the
     * created total, for every pair and every amount.
     */
    it('reconverts to the same total from the column alone, over the whole sweep', async () => {
        let moved = 0
        let wouldHaveMoved = 0
        await Promise.all(
            PAIRS.map(async (pair) => {
                const [from, to] = pair
                const quoted = STATIC_USD_PER_UNIT[from] / STATIC_USD_PER_UNIT[to]
                for (const amountMinor of amountsFor(20260731, pair)) {
                    const created = await buildExpense(
                        roomIn(to),
                        body({ currency: from, amountMinor: amountMinor.toString() }),
                        undefined,
                        STATIC_TABLE
                    )
                    const fromColumn = convertMinorAtRate(amountMinor, from, to, Number(created.fxRate))
                    if (fromColumn !== created.baseAmountMinor) moved++
                    // Converting at the raw quote, which is what the create used to do.
                    if (convertMinorAtRate(amountMinor, from, to, quoted) !== fromColumn) wouldHaveMoved++
                }
            })
        )
        expect(moved).toBe(0)
        // 0.490% of 52 800: the share of description-only edits that used to shift a balance by a
        // minor unit. Asserted rather than described, so nobody has to take the number on trust.
        expect(wouldHaveMoved).toBe(259)
    })

    it('refuses a rate the column would store as zero, rather than converting the expense to nothing', async () => {
        // 4e-13 rounds to 0.000000000000. No real cross rate is within six orders of magnitude of
        // this; the point is that the answer is a refusal and not a zero.
        const table = tableOf({ ZWL: 4e-13, EUR: 1 })
        await expect(
            buildExpense(roomIn('EUR'), body({ currency: 'ZWL', amountMinor: '100000' }), undefined, table)
        ).rejects.toMatchObject({ code: 'NO_RATE', status: 400 })
        await expect(
            buildExpense(roomIn('EUR'), body({ currency: 'ZWL', amountMinor: '100000' }), undefined, table)
        ).rejects.toBeInstanceOf(ApiError)
    })
})

describe('an amount edit reconverts at the locked rate', () => {
    it('uses the stored rate rather than a fresh quote, and is idempotent when re-run', async () => {
        const room = roomIn('EUR')
        const created = await buildExpense(
            room,
            body({ currency: 'THB', amountMinor: '300000' }),
            undefined,
            STATIC_TABLE
        )

        // The world moves under the expense: THB doubles. The edit must not notice.
        const moved = tableOf({ ...STATIC_USD_PER_UNIT, THB: 0.056 })
        const edited = await buildExpense(room, body({ currency: 'THB', amountMinor: '450000' }), rowOf(created), moved)
        expect(edited.fxRate).toBe(created.fxRate)
        expect(edited.baseAmountMinor).toBe(convertMinorAtRate(450_000n, 'THB', 'EUR', Number(created.fxRate)))

        // Saving the same amount again is a fixed point, not a slow drift.
        const again = await buildExpense(room, body({ currency: 'THB', amountMinor: '450000' }), rowOf(edited), moved)
        expect(again.baseAmountMinor).toBe(edited.baseAmountMinor)
        expect(again.fxRate).toBe(edited.fxRate)
    })

    it('is idempotent for every pair and amount in the sweep', async () => {
        let moved = 0
        await Promise.all(
            PAIRS.map(async (pair) => {
                const [from, to] = pair
                for (const amountMinor of amountsFor(20260731, pair)) {
                    const room = roomIn(to)
                    const created = await buildExpense(
                        room,
                        body({ currency: from, amountMinor: '1000' }),
                        undefined,
                        STATIC_TABLE
                    )
                    // First edit changes the amount, so it converts. Second repeats it, so it
                    // carries forward. The two must agree or every re-save walks the balance.
                    const first = await buildExpense(
                        room,
                        body({ currency: from, amountMinor: amountMinor.toString() }),
                        rowOf(created),
                        STATIC_TABLE
                    )
                    const second = await buildExpense(
                        room,
                        body({ currency: from, amountMinor: amountMinor.toString() }),
                        rowOf(first),
                        STATIC_TABLE
                    )
                    if (first.baseAmountMinor !== second.baseAmountMinor) moved++
                }
            })
        )
        expect(moved).toBe(0)
    })

    it('re-derives the rate when the currency changes, because the stored one describes another pair', async () => {
        const room = roomIn('EUR')
        const created = await buildExpense(
            room,
            body({ currency: 'THB', amountMinor: '300000' }),
            undefined,
            STATIC_TABLE
        )
        const repriced = await buildExpense(
            room,
            body({ currency: 'GBP', amountMinor: '300000' }),
            rowOf(created),
            STATIC_TABLE
        )
        expect(repriced.fxRate).toBe(quantiseRate(1.27 / 1.08).toFixed(12))
        expect(repriced.baseAmountMinor).toBe(convertMinorAtRate(300_000n, 'GBP', 'EUR', Number(repriced.fxRate)))
    })
})

/**
 * Rows written before this branch, at `RATE_SCALE = 1e9`.
 *
 * Their total cannot be reproduced by the current arithmetic — 1.153% of the sweep below is one
 * minor unit away — so the only honest answer is not to recompute it. A description-only edit
 * carries it forward untouched. An amount edit CANNOT: the expense is a different amount now, and
 * the only rate left to price it with is the 12-digit column. Such a row is re-priced at the
 * current scale, which is stated here rather than hidden.
 */
describe('a row written at the old 1e9 rate scale', () => {
    /** What the shipped code would have written for this expense. */
    const legacyRow = (from: string, to: string, amountMinor: bigint): ExistingExpense => {
        const rate = STATIC_USD_PER_UNIT[from] / STATIC_USD_PER_UNIT[to]
        return rowOf({
            amountMinor,
            currency: from,
            baseAmountMinor: convertAtOldScale(amountMinor, from, to, rate),
            fxRate: rate.toFixed(12),
        })
    }

    it('is left exactly as it is by a description-only edit, over the whole sweep', async () => {
        let rewritten = 0
        let wouldHaveBeenRewritten = 0
        await Promise.all(
            PAIRS.map(async (pair) => {
                const [from, to] = pair
                for (const amountMinor of amountsFor(20260731, pair)) {
                    const row = legacyRow(from, to, amountMinor)
                    const edited = await buildExpense(
                        roomIn(to),
                        body({
                            currency: from,
                            amountMinor: amountMinor.toString(),
                            description: 'fixed a typo',
                        }),
                        row,
                        STATIC_TABLE
                    )
                    if (edited.baseAmountMinor !== row.baseAmountMinor) rewritten++
                    // What recomputing would have cost, which is the size of the bug being held shut.
                    if (convertMinorAtRate(amountMinor, from, to, Number(row.fxRate)) !== row.baseAmountMinor)
                        wouldHaveBeenRewritten++
                }
            })
        )
        expect(rewritten).toBe(0)
        // 1.186% of 52 800. Asserted, not printed: if a later change starts recomputing these
        // rows, this number is the evidence that it moved real balances.
        expect(wouldHaveBeenRewritten).toBe(626)
    })

    /** The reviewer's case: $48 685.98 into a CHF room, stored as 4 346 963 by the old code and
     *  4 346 962 by the new arithmetic. Renaming it must leave 4 346 963 alone. */
    it('holds on USD→CHF 4 868 598, the worst pair measured', async () => {
        const row = legacyRow('USD', 'CHF', 4_868_598n)
        expect(row.baseAmountMinor).toBe(4_346_963n)
        expect(convertMinorAtRate(4_868_598n, 'USD', 'CHF', Number(row.fxRate))).toBe(4_346_962n)

        const edited = await buildExpense(
            roomIn('CHF'),
            body({ currency: 'USD', amountMinor: '4868598', description: 'renamed' }),
            row,
            STATIC_TABLE
        )
        expect(edited.baseAmountMinor).toBe(4_346_963n)
    })

    /**
     * The behaviour that is NOT preserved, named on purpose. Changing the amount of a legacy row
     * re-prices the whole expense at the current scale, so a room holding one can see a one-minor-
     * unit step the first time somebody edits the amount. There is no way around it without
     * storing the old scaled rate, and no column holds it.
     */
    it('is re-priced at the current scale when the amount changes, and says so', async () => {
        // A legacy row for some other amount, edited to the amount that shows the step.
        const row = legacyRow('USD', 'CHF', 4_000_000n)
        const edited = await buildExpense(
            roomIn('CHF'),
            body({ currency: 'USD', amountMinor: '4868598' }),
            row,
            STATIC_TABLE
        )
        expect(edited.baseAmountMinor).toBe(convertMinorAtRate(4_868_598n, 'USD', 'CHF', Number(row.fxRate)))
        expect(edited.baseAmountMinor).toBe(4_346_962n)
        // The row's own arithmetic would have said one minor unit more for the same new amount.
        expect(convertAtOldScale(4_868_598n, 'USD', 'CHF', 1 / 1.12)).toBe(4_346_963n)
    })

    /**
     * The carried total and the rate now describe slightly different rationals, and `exactShares`
     * apportions the one against the other. The residue it computes must stay inside the range
     * `apportionMinor` accepts, or a rename of an old EXACT expense is a 500.
     */
    it('still reconciles EXACT shares against a carried total that the rate no longer implies', async () => {
        let checked = 0
        await Promise.all(
            PAIRS.map(async (pair) => {
                const [from, to] = pair
                const rand = rng(999 + PAIRS.findIndex(([f, t]) => f === pair[0] && t === pair[1]))
                for (let i = 0; i < 40; i++) {
                    const members = MEMBERS.slice(0, 2 + Math.floor(rand() * 4))
                    const parts = members.map(() => BigInt(Math.floor(rand() * 200_000) + 1))
                    const total = parts.reduce((a, b) => a + b, 0n)
                    const row = legacyRow(from, to, total)
                    const write = await buildExpense(
                        roomIn(to),
                        body({
                            currency: from,
                            amountMinor: total.toString(),
                            description: 'renamed',
                            splitMode: 'EXACT',
                            exactShares: members.map((memberId, k) => ({
                                memberId,
                                amountMinor: parts[k].toString(),
                            })),
                        }),
                        row,
                        STATIC_TABLE
                    )
                    expect(write.baseAmountMinor).toBe(row.baseAmountMinor)
                    expect(sumShares(write.shares)).toBe(row.baseAmountMinor)
                    expect(write.shares.every((s) => s.amountMinor >= 0n)).toBe(true)
                    checked++
                }
            })
        )
        expect(checked).toBe(PAIRS.length * 40)
    })
})
