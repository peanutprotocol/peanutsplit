import { describe, expect, it } from 'vitest'
import type { ApiExpense, ApiMember, ExpenseInput, RoomState } from './api-types'
import { backfillPatch, backfillableFor, latecomerOffer, runBackfill } from './latecomer'

const iso = (minute: number) => new Date(Date.UTC(2026, 6, 1, 12, minute)).toISOString()

const member = (id: string, minute: number): ApiMember => ({
    id,
    name: id.toUpperCase(),
    avatar: null,
    createdAt: iso(minute),
})

const expense = (
    id: string,
    minute: number,
    shareHolders: string[],
    overrides: Partial<ApiExpense> = {}
): ApiExpense => ({
    id,
    description: 'Dinner',
    amountMinor: '6000',
    currency: 'EUR',
    baseAmountMinor: '6000',
    fxRate: '1',
    splitMode: 'EQUAL',
    paidById: shareHolders[0],
    createdById: shareHolders[0],
    date: iso(minute),
    category: null,
    createdAt: iso(minute),
    shares: shareHolders.map((memberId) => ({ memberId, amountMinor: '3000', enteredAmountMinor: null })),
    reactions: [],
    ...overrides,
})

const room = (members: ApiMember[], expenses: ApiExpense[]): RoomState => ({
    room: {
        id: 'r1',
        slug: 'ski-trip-aaa',
        name: 'Ski trip',
        emoji: null,
        currency: 'EUR',
        coverUrl: null,
        theme: null,
        createdAt: iso(0),
        archivedAt: null,
    },
    members,
    expenses,
    settlements: [],
    balances: Object.fromEntries(members.map((m) => [m.id, '0'])),
    suggestedTransfers: [],
})

// Ana and Bea from the start; Dani arrives at minute 30.
const ana = member('ana', 0)
const bea = member('bea', 1)
const dani = member('dani', 30)

describe('backfillableFor', () => {
    it('offers an EQUAL expense that was everyone in the room at the time', () => {
        const state = room([ana, bea, dani], [expense('e1', 10, ['ana', 'bea'])])
        expect(backfillableFor(state, 'dani').map((e) => e.id)).toEqual(['e1'])
    })

    it('never offers an EXACT split — somebody chose those numbers', () => {
        const exact = expense('e1', 10, ['ana', 'bea'], { splitMode: 'EXACT' })
        expect(backfillableFor(room([ana, bea, dani], [exact]), 'dani')).toEqual([])
    })

    it('leaves an expense written after they joined alone — that omission was a choice', () => {
        const afterwards = expense('e1', 40, ['ana', 'bea'])
        expect(backfillableFor(room([ana, bea, dani], [afterwards]), 'dani')).toEqual([])
    })

    /** The set test rather than the count test. Cai joined before Dani; one
     *  earlier dinner skipped Cai, so its three shares are not "everyone then". */
    it('leaves an expense that was already a subset of the room', () => {
        const cai = member('cai', 20)
        const dinnerWithoutCai = expense('e1', 25, ['ana', 'bea'])
        const state = room([ana, bea, cai, dani], [dinnerWithoutCai])
        expect(backfillableFor(state, 'dani')).toEqual([])
        // …and the count alone would have said yes: two shares, two members
        // before Dani would have been wrong anyway, but three members existed.
        expect(dinnerWithoutCai.shares).toHaveLength(2)
        expect(state.members.filter((m) => m.createdAt <= dinnerWithoutCai.createdAt)).toHaveLength(3)
    })

    it('drops out once the share is already there — which is what makes it resumable', () => {
        const alreadyFixed = expense('e1', 10, ['ana', 'bea', 'dani'])
        expect(backfillableFor(room([ana, bea, dani], [alreadyFixed]), 'dani')).toEqual([])
    })

    it('ignores rows the server has never seen', () => {
        const queued = expense('pending-1', 10, ['ana', 'bea'])
        expect(backfillableFor(room([ana, bea, dani], [queued]), 'dani')).toEqual([])
    })

    it('says nothing about somebody who was there from the start', () => {
        expect(backfillableFor(room([ana, bea, dani], [expense('e1', 10, ['ana', 'bea'])]), 'ana')).toEqual([])
    })
})

describe('latecomerOffer', () => {
    it('is null for a room where nobody arrived late', () => {
        expect(latecomerOffer(room([ana, bea], [expense('e1', 10, ['ana', 'bea'])]))).toBeNull()
        expect(latecomerOffer(undefined)).toBeNull()
    })

    it('offers the newest joiner who is missing from something', () => {
        const cai = member('cai', 20)
        const state = room([ana, bea, cai, dani], [expense('e1', 10, ['ana', 'bea'])])
        const offer = latecomerOffer(state)
        // Cai is missing from e1 too, but Dani arrived last and one question at a
        // time is a decision somebody can make.
        expect(offer?.member.id).toBe('dani')
        expect(offer?.expenses.map((e) => e.id)).toEqual(['e1'])
    })
})

describe('backfillPatch', () => {
    it('names the existing share holders plus the one person, and nothing else moves', () => {
        const row = expense('e1', 10, ['ana', 'bea'], { currency: 'CHF', amountMinor: '10000', category: 'Food' })

        expect(backfillPatch(row, 'dani')).toEqual({
            description: 'Dinner',
            amountMinor: '10000',
            currency: 'CHF',
            paidById: 'ana',
            splitMode: 'EQUAL',
            participantIds: ['ana', 'bea', 'dani'],
            date: iso(10),
            category: 'Food',
        })
    })

    /** The reason the list is spelled out. Two latecomers, and omitting
     *  `participantIds` would have pulled the other one in as well. */
    it('adds exactly one person even when two joined late', () => {
        const cai = member('cai', 20)
        const state = room([ana, bea, cai, dani], [expense('e1', 10, ['ana', 'bea'])])
        const offer = latecomerOffer(state)!

        expect(backfillPatch(offer.expenses[0], offer.member.id).participantIds).toEqual(['ana', 'bea', 'dani'])
        expect(cai.id).toBe('cai')
    })
})

describe('runBackfill', () => {
    const first = expense('e1', 10, ['ana', 'bea'])
    const second = expense('e2', 12, ['ana', 'bea'])
    const start = room([ana, bea, dani], [first, second])

    /**
     * The loop over a room a test can move UNDER it, which is what the room's own
     * eight-second poll does between two PATCHes in the real one. `between` is
     * called after each write lands and its return value becomes what the next
     * iteration reads.
     */
    const run = async (options: { between?: (written: number) => RoomState | undefined } = {}) => {
        let live = start
        const sent: { id: string; input: ExpenseInput }[] = []
        await runBackfill({
            memberId: 'dani',
            expenseIds: backfillableFor(start, 'dani').map((e) => e.id),
            read: () => live,
            patch: async (id, input) => {
                sent.push({ id, input })
            },
            onWrote: (written) => {
                live = options.between?.(written) ?? live
            },
            stopped: () => false,
        })
        return sent
    }

    it('sends one patch per pinned expense while nothing moves', async () => {
        const sent = await run()
        expect(sent.map((s) => s.id)).toEqual(['e1', 'e2'])
        expect(sent[0].input.participantIds).toEqual(['ana', 'bea', 'dani'])
    })

    it('skips a row somebody switched to EXACT while the run was working down the list', async () => {
        // The clobber this guards: the pinned payload says EQUAL, so writing it
        // would rewrite the numbers they had just typed.
        const sent = await run({
            between: (written) =>
                written === 1 ? room([ana, bea, dani], [first, { ...second, splitMode: 'EXACT' }]) : undefined,
        })
        expect(sent.map((s) => s.id)).toEqual(['e1'])
    })

    it('skips a row somebody added another person to, rather than dropping them', async () => {
        // `participantIds` is spelled out from the snapshot, so the pinned patch
        // would have named ana + bea + dani and quietly removed Eve.
        const eve = member('eve', 40)
        const withEve = {
            ...second,
            shares: [...second.shares, { memberId: 'eve', amountMinor: '2000', enteredAmountMinor: null }],
        }
        const sent = await run({
            between: (written) => (written === 1 ? room([ana, bea, dani, eve], [first, withEve]) : undefined),
        })
        expect(sent.map((s) => s.id)).toEqual(['e1'])
    })

    it('carries an amount edited mid-run instead of writing the pinned one back', async () => {
        const sent = await run({
            between: (written) =>
                written === 1 ? room([ana, bea, dani], [first, { ...second, amountMinor: '9900' }]) : undefined,
        })
        expect(sent.map((s) => s.id)).toEqual(['e1', 'e2'])
        expect(sent[1].input.amountMinor).toBe('9900')
    })
})
