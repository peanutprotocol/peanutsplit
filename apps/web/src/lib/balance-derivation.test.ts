/**
 * The derivation has exactly one job: agree with the server, to the cent, always.
 *
 * So the headline test here is not a hand-written example — it is a property. Randomised
 * rooms (members × expenses × shares × settlements, including soft-deleted rows and
 * foreign-currency expenses) are run through the REAL server fold, `toRoomState()` from
 * `src/server/roomState.ts`, and then every member's client-side derivation is checked
 * against the balance the server just computed. No second re-implementation of the maths
 * lives in this file, deliberately: a re-implementation can drift with the thing it is
 * meant to police, the actual server function cannot.
 */

import { describe, expect, it } from 'vitest'
import { toRoomState, type RoomWithRelations } from '@/server/roomState'
import type { ApiExpense, ApiSettlement, RoomState } from './api-types'
import { deriveBalance, derivePair } from './balance-derivation'

// ─── fixtures ────────────────────────────────────────────────────────────────

const ROOM_CURRENCY = 'EUR'
const iso = (day: number, minute = 0) => new Date(Date.UTC(2026, 6, day, 12, minute)).toISOString()

interface ExpenseSpec {
    id: string
    description?: string
    paidById: string
    amountMinor?: string
    currency?: string
    baseAmountMinor: string
    shares: [memberId: string, amountMinor: string, entered?: string][]
    date?: string
    deletedAt?: string
}

interface SettlementSpec {
    id: string
    fromId: string
    toId: string
    amountMinor: string
    createdAt?: string
    deletedAt?: string
}

/** A RoomState as the wire would carry it, minus the parts no derivation reads. */
const state = (
    members: string[],
    expenses: ExpenseSpec[] = [],
    settlements: SettlementSpec[] = [],
    suggestedTransfers: RoomState['suggestedTransfers'] = []
): RoomState => ({
    room: {
        id: 'room-1',
        slug: 'ski-trip-x7k2m9',
        name: 'Ski trip',
        emoji: null,
        currency: ROOM_CURRENCY,
        coverUrl: null,
        createdAt: iso(1),
        archivedAt: null,
    },
    members: members.map((id) => ({ id, name: id.toUpperCase(), createdAt: iso(1) })),
    expenses: expenses.map((expense, index) => ({
        id: expense.id,
        description: expense.description ?? expense.id,
        amountMinor: expense.amountMinor ?? expense.baseAmountMinor,
        currency: expense.currency ?? ROOM_CURRENCY,
        baseAmountMinor: expense.baseAmountMinor,
        fxRate: '1',
        splitMode: 'EQUAL',
        paidById: expense.paidById,
        createdById: null,
        date: expense.date ?? iso(2 + index),
        category: null,
        createdAt: expense.date ?? iso(2 + index),
        shares: expense.shares.map(([memberId, amountMinor, entered]) => ({
            memberId,
            amountMinor,
            enteredAmountMinor: entered ?? null,
        })),
        ...(expense.deletedAt ? { deletedAt: expense.deletedAt } : {}),
    })) as ApiExpense[],
    settlements: settlements.map((settlement, index) => ({
        id: settlement.id,
        fromId: settlement.fromId,
        toId: settlement.toId,
        createdById: null,
        amountMinor: settlement.amountMinor,
        method: 'cash',
        note: null,
        createdAt: settlement.createdAt ?? iso(20 + index),
        ...(settlement.deletedAt ? { deletedAt: settlement.deletedAt } : {}),
    })) as ApiSettlement[],
    balances: Object.fromEntries(members.map((id) => [id, '0'])),
    suggestedTransfers,
})

// ─── the property ────────────────────────────────────────────────────────────

/** Deterministic PRNG — a failing seed is reproducible, which a Math.random() suite is not. */
function mulberry32(seed: number): () => number {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6d2b79f5) >>> 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
    }
}

const pick = <T>(rng: () => number, items: readonly T[]): T => items[Math.floor(rng() * items.length)]
const between = (rng: () => number, low: number, high: number): number => low + Math.floor(rng() * (high - low + 1))

/**
 * Split `total` into `count` parts that sum to it EXACTLY — the invariant the server
 * guarantees (`baseAmountMinor` always equals the sum of the shares), reproduced here so
 * the fixtures are rooms that could actually exist.
 */
function randomParts(rng: () => number, total: bigint, count: number): bigint[] {
    const cuts = Array.from({ length: count - 1 }, () => BigInt(Math.floor(rng() * Number(total)))).sort((a, b) =>
        a === b ? 0 : a < b ? -1 : 1
    )
    const bounds = [0n, ...cuts, total]
    return Array.from({ length: count }, (_, index) => bounds[index + 1] - bounds[index])
}

/** A room as Prisma hands it to `toRoomState`, deleted rows and all. */
function randomRoom(rng: () => number, seed: number) {
    const members = Array.from({ length: between(rng, 2, 5) }, (_, index) => ({
        id: `m${seed}-${index}`,
        name: `Member ${index}`,
        createdAt: new Date(Date.UTC(2026, 6, 1, 0, index)),
    }))

    const expenses = Array.from({ length: between(rng, 0, 6) }, (_, index) => {
        const participants = members.filter(() => rng() < 0.7)
        if (participants.length === 0) participants.push(pick(rng, members))
        const baseAmountMinor = BigInt(between(rng, 1, 250_000))
        const foreign = rng() < 0.3
        const parts = randomParts(rng, baseAmountMinor, participants.length)
        return {
            id: `e${seed}-${index}`,
            description: `Expense ${index}`,
            amountMinor: foreign ? BigInt(between(rng, 1, 250_000)) : baseAmountMinor,
            currency: foreign ? 'CHF' : ROOM_CURRENCY,
            baseAmountMinor,
            fxRate: '1.037000000000',
            splitMode: foreign && rng() < 0.5 ? 'EXACT' : 'EQUAL',
            paidById: pick(rng, members).id,
            createdById: null,
            date: new Date(Date.UTC(2026, 6, between(rng, 1, 20), 12, index)),
            category: null,
            createdAt: new Date(Date.UTC(2026, 6, between(rng, 1, 20), 12, index)),
            // A fifth of the rows are soft-deleted: they must vanish on both sides.
            deletedAt: rng() < 0.2 ? new Date(Date.UTC(2026, 6, 25)) : null,
            shares: participants.map((member, position) => ({
                memberId: member.id,
                amountMinor: parts[position],
                enteredAmountMinor: rng() < 0.5 ? parts[position] : null,
            })),
        }
    })

    const settlements = Array.from({ length: between(rng, 0, 4) }, (_, index) => {
        const from = pick(rng, members)
        const to = pick(
            rng,
            members.filter((member) => member.id !== from.id)
        )
        return {
            id: `s${seed}-${index}`,
            fromId: from.id,
            toId: to.id,
            createdById: null,
            amountMinor: BigInt(between(rng, 1, 120_000)),
            method: 'cash',
            note: null,
            createdAt: new Date(Date.UTC(2026, 6, between(rng, 1, 20), 18, index)),
            deletedAt: rng() < 0.2 ? new Date(Date.UTC(2026, 6, 25)) : null,
        }
    })

    return {
        id: `room-${seed}`,
        slug: `room-${seed}`,
        name: 'Ski trip',
        emoji: null,
        currency: ROOM_CURRENCY,
        coverUrl: null,
        createdAt: new Date(Date.UTC(2026, 6, 1)),
        archivedAt: null,
        members,
        expenses,
        settlements,
    }
}

/**
 * What the API query does before `toRoomState` ever sees the room: `roomArgs` selects
 * `where: { deletedAt: null }` on both expenses and settlements. Applying it here is what
 * makes the fixture a faithful stand-in for a real response.
 */
const asServerWouldLoad = (room: ReturnType<typeof randomRoom>): RoomWithRelations =>
    ({
        ...room,
        expenses: room.expenses.filter((expense) => expense.deletedAt === null),
        settlements: room.settlements.filter((settlement) => settlement.deletedAt === null),
    }) as unknown as RoomWithRelations

describe('deriveBalance — property: the client mirrors the server', () => {
    it('derives exactly the balance the server computed, for 300 randomised rooms', () => {
        for (let seed = 1; seed <= 300; seed++) {
            const room = randomRoom(mulberry32(seed), seed)
            const wire = toRoomState(asServerWouldLoad(room))

            let sum = 0n
            for (const member of wire.members) {
                const derived = deriveBalance(wire, member.id)
                // The message names the seed so a failure is reproducible in one line.
                expect(`${seed}:${member.id}=${derived.totalMinor}`).toBe(
                    `${seed}:${member.id}=${wire.balances[member.id]}`
                )
                sum += BigInt(derived.totalMinor)
            }
            // Money has to come from somewhere: the room nets to zero or the fold is wrong.
            expect(`${seed}:${sum}`).toBe(`${seed}:0`)
        }
    })

    it('reports every row that touched the member, and nothing else', () => {
        const room = randomRoom(mulberry32(99), 99)
        const wire = toRoomState(asServerWouldLoad(room))
        const live = new Set([
            ...wire.expenses.map((expense) => expense.id),
            ...wire.settlements.map((settlement) => settlement.id),
        ])

        for (const member of wire.members) {
            const { lines } = deriveBalance(wire, member.id)
            const expected =
                wire.expenses.filter((expense) => expense.paidById === member.id).length +
                wire.expenses.filter((expense) => expense.shares.some((share) => share.memberId === member.id)).length +
                wire.settlements.filter(
                    (settlement) => settlement.fromId === member.id || settlement.toId === member.id
                ).length
            expect(lines.length).toBe(expected)
            // A deleted row cannot sneak in under a live row's key.
            for (const line of lines) expect(live.has(line.key.split(':')[1])).toBe(true)
        }
    })
})

// ─── the fold, line by line ──────────────────────────────────────────────────

describe('deriveBalance', () => {
    it('credits what you paid and debits your share of it', () => {
        const wire = state(
            ['a', 'b', 'c'],
            [
                {
                    id: 'e1',
                    description: 'Dinner',
                    paidById: 'a',
                    baseAmountMinor: '1000',
                    shares: [
                        ['a', '334'],
                        ['b', '333'],
                        ['c', '333'],
                    ],
                },
            ]
        )

        const ana = deriveBalance(wire, 'a')
        expect(ana.lines.map((line) => [line.kind, line.amountMinor])).toEqual([
            ['paid', '1000'],
            ['share', '-334'],
        ])
        expect(ana.totalMinor).toBe('666')
        expect(deriveBalance(wire, 'b').totalMinor).toBe('-333')
    })

    it('attributes a share line to whoever fronted it', () => {
        const wire = state(
            ['a', 'b'],
            [{ id: 'e1', description: 'Taxi', paidById: 'a', baseAmountMinor: '900', shares: [['b', '900']] }]
        )
        const [line] = deriveBalance(wire, 'b').lines
        expect(line).toMatchObject({ kind: 'share', title: 'Taxi', partyName: 'A', amountMinor: '-900' })
    })

    it('adds what you handed over and subtracts what you were handed', () => {
        const wire = state(['a', 'b'], [], [{ id: 's1', fromId: 'b', toId: 'a', amountMinor: '500' }])
        expect(deriveBalance(wire, 'b').lines[0]).toMatchObject({
            kind: 'settlement-sent',
            title: null,
            partyName: 'A',
            amountMinor: '500',
        })
        expect(deriveBalance(wire, 'a').lines[0]).toMatchObject({
            kind: 'settlement-received',
            partyName: 'B',
            amountMinor: '-500',
        })
    })

    it('runs chronologically, oldest first, regardless of the order on the wire', () => {
        const wire = state(
            ['a', 'b'],
            [
                { id: 'late', paidById: 'a', baseAmountMinor: '100', shares: [['a', '100']], date: iso(9) },
                { id: 'early', paidById: 'a', baseAmountMinor: '100', shares: [['a', '100']], date: iso(3) },
            ],
            [{ id: 'mid', fromId: 'a', toId: 'b', amountMinor: '50', createdAt: iso(5) }]
        )
        expect(deriveBalance(wire, 'a').lines.map((line) => line.key)).toEqual([
            'paid:early',
            'share:early',
            'sent:mid',
            'paid:late',
            'share:late',
        ])
    })

    it('shows the base amount, with what was typed as the original, for a foreign expense', () => {
        const wire = state(
            ['a', 'b'],
            [
                {
                    id: 'e1',
                    paidById: 'a',
                    currency: 'CHF',
                    amountMinor: '10000',
                    baseAmountMinor: '10370',
                    shares: [
                        ['a', '6222', '6000'],
                        ['b', '4148', '4000'],
                    ],
                },
            ]
        )
        const [paid, share] = deriveBalance(wire, 'a').lines
        // The balance is made of the base amount — the original is the receipt beside it.
        expect(paid).toMatchObject({ amountMinor: '10370', original: { amountMinor: '10000', currency: 'CHF' } })
        expect(share).toMatchObject({ amountMinor: '-6222', original: { amountMinor: '6000', currency: 'CHF' } })
    })

    it('has no original to show for an expense already in the room currency', () => {
        const wire = state(['a'], [{ id: 'e1', paidById: 'a', baseAmountMinor: '500', shares: [['a', '500', '500']] }])
        expect(deriveBalance(wire, 'a').lines.every((line) => line.original === null)).toBe(true)
    })

    it('skips the optimistic pending row, so the sheet always agrees with the card', () => {
        // The exact shape `useAddExpense` puts in the cache: payer named, shares still zero,
        // `balances` untouched server truth. Folding it in would credit A twice.
        const wire = state(
            ['a', 'b'],
            [
                {
                    id: 'pending-1753700000000',
                    paidById: 'a',
                    baseAmountMinor: '4000',
                    shares: [
                        ['a', '0'],
                        ['b', '0'],
                    ],
                },
            ]
        )
        wire.balances = { a: '0', b: '0' }
        expect(deriveBalance(wire, 'a').lines).toEqual([])
        expect(deriveBalance(wire, 'a').totalMinor).toBe(wire.balances.a)
    })

    it('drops a soft-deleted row if one ever reaches the client', () => {
        const wire = state(
            ['a', 'b'],
            [
                {
                    id: 'e1',
                    paidById: 'a',
                    baseAmountMinor: '1000',
                    shares: [
                        ['a', '500'],
                        ['b', '500'],
                    ],
                    deletedAt: iso(9),
                },
            ],
            [{ id: 's1', fromId: 'b', toId: 'a', amountMinor: '500', deletedAt: iso(9) }]
        )
        expect(deriveBalance(wire, 'a').lines).toEqual([])
        expect(deriveBalance(wire, 'b').totalMinor).toBe('0')
    })

    it('derives nothing for an id that is not on the roster', () => {
        const wire = state(['a'], [{ id: 'e1', paidById: 'a', baseAmountMinor: '100', shares: [['ghost', '100']] }])
        expect(deriveBalance(wire, 'ghost')).toEqual({ memberId: 'ghost', lines: [], totalMinor: '0' })
    })

    it('gives a member with nothing on them an empty sheet at zero', () => {
        expect(deriveBalance(state(['a', 'b']), 'a')).toEqual({ memberId: 'a', lines: [], totalMinor: '0' })
    })
})

// ─── the pair view ───────────────────────────────────────────────────────────

describe('derivePair', () => {
    /**
     * The decision this test documents: a suggested transfer is NOT a pairwise debt, so the
     * pair view shows both members' full balances rather than inventing a shared history.
     *
     * The room below is the proof. A paid for B, C paid for nobody's benefit but their own —
     * A and C never share an expense — and yet the greedy simplification pairs C with A,
     * because it settles the biggest debtor against the biggest creditor. Any "expenses you
     * two shared" derivation of that payment would come out at zero against a real transfer.
     */
    const wire = state(
        ['a', 'b', 'c'],
        [
            { id: 'e1', description: 'Dinner', paidById: 'a', baseAmountMinor: '9000', shares: [['b', '9000']] },
            { id: 'e2', description: 'Taxi', paidById: 'b', baseAmountMinor: '3000', shares: [['c', '3000']] },
        ],
        [],
        [
            { fromId: 'b', toId: 'a', amountMinor: '6000' },
            { fromId: 'c', toId: 'a', amountMinor: '3000' },
        ]
    )

    it('returns both complete derivations and the transfer that links them', () => {
        const pair = derivePair(wire, 'c', 'a')
        expect(pair.transferMinor).toBe('3000')
        expect(pair.direction).toBe('sends')
        expect(pair.self.totalMinor).toBe('-3000')
        expect(pair.other.totalMinor).toBe('9000')
    })

    it('does not pretend the payment came from a shared expense', () => {
        const pair = derivePair(wire, 'c', 'a')
        const shared = pair.self.lines.filter((line) => line.partyName === 'A')
        // C's only line is a share of an expense B paid for — nothing ties C to A at all,
        // and the suggested €30 is still real. That gap is why the pair view is two sheets.
        expect(shared).toEqual([])
        expect(pair.self.lines.map((line) => line.partyName)).toEqual(['B'])
    })

    it('reads the direction from the other side too, and reports no transfer when unpaired', () => {
        expect(derivePair(wire, 'a', 'c').direction).toBe('receives')
        expect(derivePair(wire, 'b', 'c')).toMatchObject({ transferMinor: null, direction: null })
    })
})
