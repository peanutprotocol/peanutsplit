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
import { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { buildExpense, expenseNeedsRateTable, type ExistingExpense } from '@/server/expenses'
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

const roomWithFormer = (currency: string): RoomWithRelations =>
    ({
        id: 'room',
        currency,
        members: MEMBERS.map((id) => ({ id, removedAt: id === 'bea' || id === 'caro' ? new Date() : null })),
    }) as unknown as RoomWithRelations

const tableOf = (usdPerUnit: Record<string, number>, base = 'EUR'): RateTable => {
    const usdPerBase = usdPerUnit[base]
    const basePerUnit =
        usdPerBase === undefined
            ? { ...usdPerUnit }
            : Object.fromEntries(Object.entries(usdPerUnit).map(([quote, usd]) => [quote, usd / usdPerBase]))
    return { base, basePerUnit, source: 'static', fetchedAt: null }
}

const staticTableFor = (base: string) => tableOf({ ...STATIC_USD_PER_UNIT }, base)
const STATIC_TABLE = staticTableFor('EUR')

const body = (over: Partial<ExpenseBody> & { paidById?: string } = {}): ExpenseBody & { paidById: string } => {
    const result = {
        description: 'Dinner',
        amountMinor: '10000',
        currency: 'USD',
        paidById: 'ana',
        splitMode: 'EQUAL' as const,
        participantIds: ['ana', 'bea'],
        ...over,
    }
    if (result.splitMode !== 'EQUAL' && !Object.prototype.hasOwnProperty.call(over, 'participantIds'))
        delete (result as { participantIds?: string[] }).participantIds
    return result as ExpenseBody & { paidById: string }
}

/** The row a create wrote, in the shape the edit path hands back to `buildExpense`. */
const rowOf = (write: { amountMinor: bigint; currency: string; baseAmountMinor: bigint; fxRate: string }) =>
    ({
        date: new Date('2026-07-01T00:00:00.000Z'),
        currency: write.currency,
        fxRate: new Prisma.Decimal(write.fxRate),
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

describe('Former membership on expense writes', () => {
    it('defaults a new equal expense to active people only', async () => {
        const write = await buildExpense(
            roomWithFormer('EUR'),
            body({ currency: 'EUR', participantIds: undefined }),
            undefined,
            STATIC_TABLE
        )
        expect(write.shares.map((share) => share.memberId)).toEqual(['ana', 'dani', 'eve'])
    })

    /**
     * The client's offline queue has to guard against "the server will pick the
     * roster for me", and it guards on the body. `[]` and an absent key are the
     * same instruction here — so a guard written for one and not the other lets
     * a draft saved hours ago be split among whoever happens to be in the room
     * when it finally sends. Locked explicitly rather than left implied by the
     * `?.length` in the expression.
     */
    it('reads an empty participant list as the same live roster as no list at all', async () => {
        const write = await buildExpense(
            roomWithFormer('EUR'),
            body({ currency: 'EUR', participantIds: [] }),
            undefined,
            STATIC_TABLE
        )
        expect(write.shares.map((share) => share.memberId)).toEqual(['ana', 'dani', 'eve'])
    })

    it('rejects a Former identity introduced by a new write', async () => {
        await expect(
            buildExpense(
                roomWithFormer('EUR'),
                body({
                    currency: 'EUR',
                    splitMode: 'EXACT',
                    exactShares: [{ memberId: 'bea', amountMinor: '10000' }],
                }),
                undefined,
                STATIC_TABLE
            )
        ).rejects.toMatchObject({ code: 'MEMBER_FORMER' })
    })

    it('lets an edit preserve its own Former references but not add another one', async () => {
        const existing: ExistingExpense = {
            date: new Date('2026-07-01T00:00:00.000Z'),
            currency: 'EUR',
            fxRate: new Prisma.Decimal(1),
            amountMinor: 10_000n,
            baseAmountMinor: 10_000n,
            paidById: 'ana',
            shares: [{ memberId: 'ana' }, { memberId: 'bea' }],
        }
        const preserved = await buildExpense(
            roomWithFormer('EUR'),
            body({ currency: 'EUR', participantIds: ['ana', 'bea'] }),
            existing,
            STATIC_TABLE
        )
        expect(preserved.shares.map((share) => share.memberId)).toEqual(['ana', 'bea'])

        await expect(
            buildExpense(
                roomWithFormer('EUR'),
                body({ currency: 'EUR', participantIds: ['ana', 'bea', 'caro'] }),
                existing,
                STATIC_TABLE
            )
        ).rejects.toMatchObject({ code: 'MEMBER_FORMER' })
    })

    it('does not let an old Former participant escalate into payer', async () => {
        const existing: ExistingExpense = {
            date: new Date('2026-07-01T00:00:00.000Z'),
            currency: 'EUR',
            fxRate: new Prisma.Decimal(1),
            amountMinor: 10_000n,
            baseAmountMinor: 10_000n,
            paidById: 'ana',
            shares: [{ memberId: 'bea' }],
        }
        await expect(
            buildExpense(
                roomWithFormer('EUR'),
                body({
                    currency: 'EUR',
                    paidById: 'bea',
                    splitMode: 'EXACT',
                    exactShares: [{ memberId: 'bea', amountMinor: '10000' }],
                }),
                existing,
                STATIC_TABLE
            )
        ).rejects.toMatchObject({ code: 'MEMBER_FORMER' })
    })

    it('does not let an old Former payer escalate into participant', async () => {
        const existing: ExistingExpense = {
            date: new Date('2026-07-01T00:00:00.000Z'),
            currency: 'EUR',
            fxRate: new Prisma.Decimal(1),
            amountMinor: 10_000n,
            baseAmountMinor: 10_000n,
            paidById: 'bea',
            shares: [{ memberId: 'ana' }],
        }
        await expect(
            buildExpense(
                roomWithFormer('EUR'),
                body({
                    currency: 'EUR',
                    paidById: 'ana',
                    splitMode: 'EXACT',
                    exactShares: [{ memberId: 'bea', amountMinor: '10000' }],
                }),
                existing,
                STATIC_TABLE
            )
        ).rejects.toMatchObject({ code: 'MEMBER_FORMER' })
    })
})

describe('manual rates for invented expense currencies', () => {
    it('loads catalog FX only for a new real-currency pair', () => {
        expect(expenseNeedsRateTable('EUR', 'USD')).toBe(true)
        expect(expenseNeedsRateTable('EUR', 'USD', 'USD')).toBe(false)
        expect(expenseNeedsRateTable('EUR', 'EUR')).toBe(false)
        expect(expenseNeedsRateTable('EUR', 'BEER')).toBe(false)
        expect(expenseNeedsRateTable('EUR', 'USD', undefined, '7')).toBe(false)
        expect(expenseNeedsRateTable('BEER', 'USD')).toBe(false)
    })

    it('converts at the supplied room-major-units rate and freezes it at 12dp', async () => {
        const write = await buildExpense(
            roomIn('EUR'),
            body({ currency: 'BEER', amountMinor: '10000', manualFxRate: '5.123456789012' }),
            undefined,
            // A made-up cache row must not be what makes the write possible.
            tableOf({ ...STATIC_USD_PER_UNIT, BEER: 99 })
        )

        expect(write.fxRate).toBe('5.123456789012')
        expect(write.baseAmountMinor).toBe(51_235n)
        expect(write.shares.map((share) => share.amountMinor)).toEqual([25_618n, 25_617n])
        expect(sumShares(write.shares)).toBe(write.baseAmountMinor)
    })

    it('stores and uses a large 12dp manual rate exactly, including EXACT-share remainders', async () => {
        const rawRate = '123456789012.123456789012'
        const write = await buildExpense(
            roomIn('EUR'),
            body({
                currency: 'BEER',
                amountMinor: '3001',
                manualFxRate: rawRate,
                splitMode: 'EXACT',
                exactShares: [
                    { memberId: 'ana', amountMinor: '1000' },
                    { memberId: 'bea', amountMinor: '1001' },
                    { memberId: 'caro', amountMinor: '1000' },
                ],
            }),
            undefined,
            tableOf({})
        )

        expect(write.fxRate).toBe(rawRate)
        expect(write.baseAmountMinor).toBe(370_493_823_825_382n)
        expect(write.shares.map((share) => share.amountMinor)).toEqual([
            123_456_789_012_123n,
            123_580_245_801_136n,
            123_456_789_012_123n,
        ])
        expect(sumShares(write.shares)).toBe(write.baseAmountMinor)
    })

    it('requires a manual rate for a new custom pair, even if a rate table contains the ticker', async () => {
        await expect(
            buildExpense(
                roomIn('EUR'),
                body({ currency: 'BEER', amountMinor: '10000' }),
                undefined,
                tableOf({ ...STATIC_USD_PER_UNIT, BEER: 99 })
            )
        ).rejects.toMatchObject({ code: 'MANUAL_FX_RATE_REQUIRED', status: 400 })
    })

    it('never permits a manual value to override catalog FX or an identity rate', async () => {
        await expect(
            buildExpense(roomIn('EUR'), body({ currency: 'USD', manualFxRate: '7' }), undefined, STATIC_TABLE)
        ).rejects.toMatchObject({ code: 'MANUAL_FX_RATE_NOT_ALLOWED', status: 400 })
        await expect(
            buildExpense(roomIn('BEER'), body({ currency: 'BEER', manualFxRate: '7' }), undefined, STATIC_TABLE)
        ).rejects.toMatchObject({ code: 'MANUAL_FX_RATE_NOT_ALLOWED', status: 400 })

        const identity = await buildExpense(
            roomIn('BEER'),
            body({ currency: 'BEER', amountMinor: '1234' }),
            undefined,
            STATIC_TABLE
        )
        expect(identity.fxRate).toBe('1.000000000000')
        expect(identity.baseAmountMinor).toBe(1234n)
    })

    it('refuses malformed direct-domain rates as a 400 instead of storing or pricing them', async () => {
        for (const manualFxRate of ['0', '1e3', '0.0000000000001', '1000000000000']) {
            await expect(
                buildExpense(roomIn('EUR'), body({ currency: 'BEER', manualFxRate }), undefined, STATIC_TABLE)
            ).rejects.toMatchObject({ code: 'MANUAL_FX_RATE_INVALID', status: 400 })
        }
    })

    it('refuses a custom expense whose positive amount converts to zero room-minor units', async () => {
        await expect(
            buildExpense(
                roomIn('EUR'),
                body({ currency: 'BEER', amountMinor: '1', manualFxRate: '0.000000000001' }),
                undefined,
                tableOf({})
            )
        ).rejects.toMatchObject({ code: 'MANUAL_FX_RATE_INVALID', status: 400 })
    })

    it('keeps the frozen rate when omitted on edit and reprices only for an explicit change', async () => {
        const room = roomIn('EUR')
        const created = await buildExpense(
            room,
            body({ currency: 'BEER', amountMinor: '10000', manualFxRate: '5' }),
            undefined,
            STATIC_TABLE
        )

        const renamed = await buildExpense(
            room,
            body({ currency: 'BEER', amountMinor: '10000', description: 'renamed' }),
            rowOf(created),
            tableOf({})
        )
        expect(renamed.fxRate).toBe(created.fxRate)
        expect(renamed.baseAmountMinor).toBe(created.baseAmountMinor)
        expect(renamed.shares).toEqual(created.shares)

        const larger = await buildExpense(
            room,
            body({ currency: 'BEER', amountMinor: '12000' }),
            rowOf(renamed),
            tableOf({})
        )
        expect(larger.fxRate).toBe(created.fxRate)
        expect(larger.baseAmountMinor).toBe(60_000n)

        const repriced = await buildExpense(
            room,
            body({ currency: 'BEER', amountMinor: '12000', manualFxRate: '6' }),
            rowOf(larger),
            tableOf({})
        )
        expect(repriced.fxRate).toBe('6.000000000000')
        expect(repriced.baseAmountMinor).toBe(72_000n)

        // A different textual spelling that freezes to the same rate is not a
        // money change and therefore carries the authoritative stored total.
        const same = await buildExpense(
            room,
            body({ currency: 'BEER', amountMinor: '12000', manualFxRate: '6.000000000000' }),
            rowOf(repriced),
            tableOf({})
        )
        expect(same.baseAmountMinor).toBe(repriced.baseAmountMinor)
    })

    it('requires a new agreement when an edit changes to a different invented currency', async () => {
        const room = roomIn('EUR')
        const created = await buildExpense(room, body({ currency: 'BEER', manualFxRate: '5' }), undefined, STATIC_TABLE)
        await expect(
            buildExpense(room, body({ currency: 'SODA' }), rowOf(created), STATIC_TABLE)
        ).rejects.toMatchObject({ code: 'MANUAL_FX_RATE_REQUIRED', status: 400 })

        const changed = await buildExpense(
            room,
            body({ currency: 'SODA', manualFxRate: '2.5' }),
            rowOf(created),
            STATIC_TABLE
        )
        expect(changed.fxRate).toBe('2.500000000000')
        expect(changed.baseAmountMinor).toBe(25_000n)
    })
})

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
                        staticTableFor(to)
                    )
                    const edited = await buildExpense(
                        room,
                        body({
                            currency: from,
                            amountMinor: amountMinor.toString(),
                            description: 'Dinner (split with Caro)',
                        }),
                        rowOf(created),
                        staticTableFor(to)
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
        const table = tableOf({ BHD: 2.65, JPY: 0.0064 }, 'JPY')
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

describe('weighted expense modes', () => {
    it('apportions percentage basis points exactly and persists the weights', async () => {
        const write = await buildExpense(
            roomIn('USD'),
            body({
                amountMinor: '1001',
                splitMode: 'PERCENTAGE',
                weightedShares: [
                    { memberId: 'ana', weight: '3333' },
                    { memberId: 'bea', weight: '3333' },
                    { memberId: 'caro', weight: '3334' },
                ],
            }),
            undefined,
            STATIC_TABLE
        )

        expect(write.splitMode).toBe('PERCENTAGE')
        expect(write.shares.map((share) => share.amountMinor)).toEqual([334n, 333n, 334n])
        expect(write.shares.map((share) => share.splitWeight)).toEqual([3333n, 3333n, 3334n])
        expect(write.shares.every((share) => share.enteredAmountMinor === null)).toBe(true)
        expect(sumShares(write.shares)).toBe(write.baseAmountMinor)
    })

    it('apportions arbitrary shares exactly by relative integer weight', async () => {
        const write = await buildExpense(
            roomIn('USD'),
            body({
                amountMinor: '1001',
                splitMode: 'SHARES',
                weightedShares: [
                    { memberId: 'ana', weight: '1' },
                    { memberId: 'bea', weight: '2' },
                    { memberId: 'caro', weight: '3' },
                ],
            }),
            undefined,
            STATIC_TABLE
        )

        expect(write.shares.map((share) => share.amountMinor)).toEqual([167n, 334n, 500n])
        expect(write.shares.map((share) => share.splitWeight)).toEqual([1n, 2n, 3n])
        expect(sumShares(write.shares)).toBe(write.baseAmountMinor)
    })

    it('requires percentage weights to total exactly 10000 basis points', async () => {
        await expect(
            buildExpense(
                roomIn('USD'),
                body({
                    splitMode: 'PERCENTAGE',
                    weightedShares: [
                        { memberId: 'ana', weight: '4999' },
                        { memberId: 'bea', weight: '5000' },
                    ],
                }),
                undefined,
                STATIC_TABLE
            )
        ).rejects.toMatchObject({ code: 'PERCENTAGES_DO_NOT_ADD_UP', status: 400 })
    })

    it('requires at least one positive weighted participant', async () => {
        await expect(
            buildExpense(roomIn('USD'), body({ splitMode: 'SHARES', weightedShares: [] }), undefined, STATIC_TABLE)
        ).rejects.toMatchObject({ code: 'WEIGHTED_SHARES_REQUIRED', status: 400 })
        await expect(
            buildExpense(
                roomIn('USD'),
                body({ splitMode: 'SHARES', weightedShares: [{ memberId: 'ana', weight: '0' }] }),
                undefined,
                STATIC_TABLE
            )
        ).rejects.toMatchObject({ code: 'SPLIT_WEIGHT_NOT_POSITIVE', status: 400 })
    })

    it('rejects duplicate and out-of-room weighted participants', async () => {
        await expect(
            buildExpense(
                roomIn('USD'),
                body({
                    splitMode: 'SHARES',
                    weightedShares: [
                        { memberId: 'ana', weight: '1' },
                        { memberId: 'ana', weight: '2' },
                    ],
                }),
                undefined,
                STATIC_TABLE
            )
        ).rejects.toMatchObject({ code: 'DUPLICATE_PARTICIPANT', status: 400 })
        await expect(
            buildExpense(
                roomIn('USD'),
                body({ splitMode: 'SHARES', weightedShares: [{ memberId: 'outsider', weight: '1' }] }),
                undefined,
                STATIC_TABLE
            )
        ).rejects.toMatchObject({ code: 'NOT_A_MEMBER', status: 400 })
    })

    it('rejects split payload fields that do not belong to the selected mode', async () => {
        await expect(
            buildExpense(
                roomIn('USD'),
                body({ splitMode: 'EQUAL', weightedShares: [{ memberId: 'ana', weight: '1' }] }),
                undefined,
                STATIC_TABLE
            )
        ).rejects.toMatchObject({ code: 'SPLIT_FIELDS_DO_NOT_MATCH_MODE', status: 400 })
        await expect(
            buildExpense(
                roomIn('USD'),
                body({
                    splitMode: 'SHARES',
                    exactShares: [{ memberId: 'ana', amountMinor: '10000' }],
                    weightedShares: [{ memberId: 'ana', weight: '1' }],
                }),
                undefined,
                STATIC_TABLE
            )
        ).rejects.toMatchObject({ code: 'SPLIT_FIELDS_DO_NOT_MATCH_MODE', status: 400 })
    })

    it('re-saving a weighted split is deterministic and does not move its total', async () => {
        const weighted = {
            currency: 'THB',
            amountMinor: '300012',
            splitMode: 'SHARES' as const,
            weightedShares: [
                { memberId: 'ana', weight: '7' },
                { memberId: 'bea', weight: '5' },
                { memberId: 'caro', weight: '3' },
            ],
        }
        const created = await buildExpense(roomIn('EUR'), body(weighted), undefined, STATIC_TABLE)
        const edited = await buildExpense(
            roomIn('EUR'),
            body({ ...weighted, description: 'renamed' }),
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
                        staticTableFor(to)
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
                        staticTableFor(to)
                    )
                    // First edit changes the amount, so it converts. Second repeats it, so it
                    // carries forward. The two must agree or every re-save walks the balance.
                    const first = await buildExpense(
                        room,
                        body({ currency: from, amountMinor: amountMinor.toString() }),
                        rowOf(created),
                        staticTableFor(to)
                    )
                    const second = await buildExpense(
                        room,
                        body({ currency: from, amountMinor: amountMinor.toString() }),
                        rowOf(first),
                        staticTableFor(to)
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
                        staticTableFor(to)
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
                        staticTableFor(to)
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
