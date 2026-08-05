/**
 * "Adding you to these will cost you €12.40." That sentence is the whole latecomer flow, and it
 * is shown BEFORE anybody taps — so if it is wrong, the person agreed to a number that never
 * existed.
 *
 * `latecomer.test.ts` covers the predicate: which earlier rows a new member should be in. This
 * file covers the ARITHMETIC of the promise, as a property. Randomised rooms are run through the
 * real server fold (`toRoomState`), reviewed with the real client review (`latecomerReview`), then
 * rewritten with the real server share function (`equalShares` — the one
 * `changeEqualExpenseParticipant` calls), and the balance that comes out is compared with the one
 * the banner promised.
 *
 * Nothing is re-implemented: every number in here comes from the code that produces it in
 * production. A re-implementation would drift with the thing it is meant to police.
 */
import { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { balancesOf, toRoomState, type RoomWithRelations } from '@/server/roomState'
import { equalShares } from '@/server/split'
import { latecomerReview, projectedBalanceMinor, selectedImpactMinor, suggestedExpenseIds } from '@/lib/latecomer'

// ─── generator ───────────────────────────────────────────────────────────────

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

interface Row {
    id: string
    paidById: string
    baseAmountMinor: bigint
    createdAt: Date
    splitMode: 'EQUAL' | 'EXACT'
    shares: { memberId: string; amountMinor: bigint }[]
}

/**
 * A room where the roster grew over time — the only shape the latecomer flow has anything to say
 * about. Members join minute by minute; each expense is written at a moment and split between the
 * people who were there, sometimes all of them and sometimes a subset.
 */
function growingRoom(rng: () => number, seed: number) {
    const memberCount = between(rng, 3, 6)
    const members = Array.from({ length: memberCount }, (_, index) => ({
        id: `m${seed}-${index}`,
        name: `Member ${index}`,
        avatar: null,
        avatarPalette: null,
        createdAt: new Date(Date.UTC(2026, 6, 1, 0, index * 10)),
        canRemove: false,
    }))

    const expenses: Row[] = Array.from({ length: between(rng, 1, 8) }, (_, index) => {
        // Written somewhere in the middle of the roster's growth, never at a member's own minute:
        // a tie is a documented skip, and this property is about the rows that DO get offered.
        const writtenAtMinute = between(rng, 1, memberCount * 10 - 1)
        const createdAt = new Date(Date.UTC(2026, 6, 1, 0, writtenAtMinute, 30))
        const presentThen = members.filter((member) => member.createdAt.getTime() <= createdAt.getTime())
        // A subset sometimes, so the generator produces `optional` rows as well as `suggested` ones.
        const participants = presentThen.filter(() => rng() < 0.85)
        if (participants.length === 0) participants.push(presentThen[0])

        const baseAmountMinor = BigInt(between(rng, 1, 400_000))
        const equal = rng() < 0.8
        // Equal rows are divided by the real `equalShares`; EXACT rows are numbers somebody chose,
        // which the review must never re-divide — so the first participant carries the lot.
        const shares = equal
            ? equalShares(
                  baseAmountMinor,
                  participants.map((member) => member.id)
              ).map((share) => ({ memberId: share.memberId, amountMinor: share.amountMinor }))
            : participants.map((member, position) => ({
                  memberId: member.id,
                  amountMinor: position === 0 ? baseAmountMinor : 0n,
              }))

        return {
            id: `e${seed}-${index}`,
            paidById: pick(rng, presentThen).id,
            baseAmountMinor,
            createdAt,
            splitMode: equal ? ('EQUAL' as const) : ('EXACT' as const),
            shares,
        }
    })

    return { members, expenses }
}

/** The rows, dressed as the Prisma payload `toRoomState` expects. */
const asRoom = (built: ReturnType<typeof growingRoom>): RoomWithRelations =>
    ({
        id: 'room-1',
        slug: 'ski-trip-x7k2m9',
        name: 'Ski trip',
        emoji: null,
        currency: 'EUR',
        coverUrl: null,
        theme: null,
        createdAt: new Date(Date.UTC(2026, 6, 1)),
        members: built.members,
        expenses: built.expenses.map((expense) => ({
            ...expense,
            description: expense.id,
            amountMinor: expense.baseAmountMinor,
            currency: 'EUR',
            fxRate: new Prisma.Decimal(1),
            createdById: null,
            date: expense.createdAt,
            category: null,
            deletedAt: null,
            shares: expense.shares.map((share) => ({ ...share, enteredAmountMinor: null, splitWeight: null })),
            reactions: [],
        })),
        settlements: [],
    }) as unknown as RoomWithRelations

const SEEDS = 200

// ─── the properties ──────────────────────────────────────────────────────────

describe('the catch-up promise — property over randomised rooms', () => {
    it('charges the latecomer exactly what the banner said it would, for every reviewed room', () => {
        let reviewed = 0
        for (let seed = 1; seed <= SEEDS; seed++) {
            const built = growingRoom(mulberry32(seed), seed)
            const room = asRoom(built)
            const state = toRoomState(room)

            for (const member of built.members) {
                const review = latecomerReview(state, member.id)
                if (!review) continue
                const selected = new Set(suggestedExpenseIds(review))
                if (selected.size === 0) continue
                reviewed++

                const before = balancesOf(room)
                const promised = selectedImpactMinor(review, selected)

                // The rewrite the server actually performs: current participants plus the target,
                // re-divided by the same `equalShares` the route calls.
                const after = balancesOf({
                    ...room,
                    expenses: room.expenses.map((expense) =>
                        selected.has(expense.id)
                            ? {
                                  ...expense,
                                  shares: equalShares(expense.baseAmountMinor, [
                                      ...expense.shares.map((share) => share.memberId),
                                      member.id,
                                  ]),
                              }
                            : expense
                    ),
                })

                const label = `${seed}:${member.id}`
                expect(`${label}=${after.get(member.id)}`).toBe(
                    `${label}=${projectedBalanceMinor((before.get(member.id) ?? 0n).toString(), promised)}`
                )
                // Somebody has to be relieved of exactly what the latecomer took on.
                expect(`${label}:net=${[...after.values()].reduce((a, b) => a + b, 0n)}`).toBe(`${label}:net=0`)
            }
        }
        // A property that never fired would be a green test proving nothing.
        expect(reviewed).toBeGreaterThan(50)
    })

    it('never offers a row that was not an equal split, and never guesses its impact', () => {
        for (let seed = 1; seed <= SEEDS; seed++) {
            const built = growingRoom(mulberry32(seed), seed)
            const state = toRoomState(asRoom(built))
            const byId = new Map(state.expenses.map((expense) => [expense.id, expense]))

            for (const member of built.members) {
                const review = latecomerReview(state, member.id)
                if (!review) continue
                for (const item of review.items) {
                    const expense = byId.get(item.expense.id)!
                    if (item.kind === 'manual') {
                        expect(item.impactMinor).toBeNull()
                    } else {
                        // Only equal rows carry a number, and only rows they were absent from.
                        expect(expense.splitMode).toBe('EQUAL')
                        expect(expense.shares.some((share) => share.memberId === member.id)).toBe(false)
                        expect(item.impactMinor).not.toBeNull()
                    }
                }
            }
        }
    })

    it('promises the floor share, which is what the re-division actually hands the newcomer', () => {
        for (let seed = 1; seed <= SEEDS; seed++) {
            const built = growingRoom(mulberry32(seed), seed)
            const room = asRoom(built)
            const state = toRoomState(room)

            for (const member of built.members) {
                const review = latecomerReview(state, member.id)
                if (!review) continue
                for (const item of review.items) {
                    if (item.impactMinor === null) continue
                    const participants = [...item.expense.shares.map((share) => share.memberId), member.id]
                    const rebuilt = equalShares(BigInt(item.expense.baseAmountMinor), participants)
                    const theirs = rebuilt.find((share) => share.memberId === member.id)!
                    expect(`${seed}:${item.expense.id}=${item.impactMinor}`).toBe(
                        `${seed}:${item.expense.id}=${theirs.amountMinor}`
                    )
                }
            }
        }
    })

    it('is resumable — once the rows are rewritten there is nothing left to review', () => {
        for (let seed = 1; seed <= SEEDS; seed++) {
            const built = growingRoom(mulberry32(seed), seed)
            const room = asRoom(built)
            const state = toRoomState(room)

            for (const member of built.members) {
                const review = latecomerReview(state, member.id)
                if (!review) continue
                const selected = new Set(suggestedExpenseIds(review))
                if (selected.size === 0) continue

                const rewritten = toRoomState({
                    ...room,
                    expenses: room.expenses.map((expense) =>
                        selected.has(expense.id)
                            ? {
                                  ...expense,
                                  shares: equalShares(expense.baseAmountMinor, [
                                      ...expense.shares.map((share) => share.memberId),
                                      member.id,
                                  ]).map((share) => ({ ...share, splitWeight: null })),
                              }
                            : expense
                    ),
                } as RoomWithRelations)

                const again = latecomerReview(rewritten, member.id)
                const stillSuggested = again ? suggestedExpenseIds(again) : []
                expect(`${seed}:${member.id}=${stillSuggested.filter((id) => selected.has(id)).length}`).toBe(
                    `${seed}:${member.id}=0`
                )
            }
        }
    })
})
