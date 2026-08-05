import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApiExpense, ApiMember, RoomState } from './api-types'
import {
    backfillableFor,
    catchUpExpenseInput,
    dismissLatecomerReview,
    isLatecomerReviewDismissed,
    latecomerReview,
    projectedBalanceMinor,
    runBackfill,
    selectedImpactMinor,
    suggestedExpenseIds,
} from './latecomer'

afterEach(() => vi.unstubAllGlobals())

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
    shares: shareHolders.map((memberId) => ({
        memberId,
        amountMinor: '3000',
        enteredAmountMinor: null,
        splitWeight: null,
    })),
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

    it.each(['EXACT', 'PERCENTAGE', 'SHARES'] as const)(
        'never offers a %s split — somebody chose that arithmetic',
        (splitMode) => {
            const deliberate = expense('e1', 10, ['ana', 'bea'], { splitMode })
            expect(backfillableFor(room([ana, bea, dani], [deliberate]), 'dani')).toEqual([])
        }
    )

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

describe('latecomerReview', () => {
    it('returns null for an empty history, so a new empty room gets no catch-up step', () => {
        expect(latecomerReview(room([ana, bea, dani], []), 'dani')).toBeNull()
    })

    it('shows actual earlier rows and classifies suggestions, equal subsets, and custom maths separately', () => {
        const cai = member('cai', 20)
        const exact = expense('exact', 27, ['ana', 'bea'], { splitMode: 'EXACT' })
        const subset = expense('subset', 25, ['ana', 'bea'])
        const wholeRoom = expense('whole', 10, ['ana', 'bea'])
        const afterJoin = expense('after', 40, ['ana', 'bea', 'cai'])
        const review = latecomerReview(room([ana, bea, cai, dani], [exact, subset, wholeRoom, afterJoin]), 'dani')!

        expect(review.member.id).toBe('dani')
        expect(review.items.map((item) => [item.expense.id, item.kind, item.impactMinor])).toEqual([
            ['exact', 'manual', null],
            ['subset', 'optional', '2000'],
            ['whole', 'suggested', '2000'],
        ])
        expect(suggestedExpenseIds(review)).toEqual(['whole'])
        expect(selectedImpactMinor(review, new Set(['whole', 'subset', 'exact']))).toBe('4000')
    })

    it('uses the server equal-split rounding position for the displayed impact', () => {
        const uneven = expense('odd', 10, ['ana', 'bea'], { baseAmountMinor: '1000' })
        const review = latecomerReview(room([ana, bea, dani], [uneven]), 'dani')!
        // The existing two are first and absorb the 1-cent residue; Dani is
        // appended last and receives floor(1000 / 3).
        expect(review.items[0].impactMinor).toBe('333')
    })

    it('keeps a whole-room row suggested after an earlier latecomer was caught up', () => {
        const eve = member('eve', 40)
        const changed = expense('changed', 10, ['ana', 'bea', 'eve'])
        const review = latecomerReview(room([ana, bea, dani, eve], [changed]), 'dani')!
        expect(review.items[0].kind).toBe('suggested')
    })

    it('keeps an equal subset optional when it also contains a later member', () => {
        const cai = member('cai', 5)
        const eve = member('eve', 40)
        const changed = expense('changed', 10, ['ana', 'bea', 'eve'])
        const review = latecomerReview(room([ana, bea, cai, dani, eve], [changed]), 'dani')!
        expect(review.items[0].kind).toBe('optional')
    })
})

describe('local review dismissal', () => {
    it('suppresses only the exact reviewed expense set on this device', () => {
        const values = new Map<string, string>()
        vi.stubGlobal('window', {
            localStorage: {
                getItem: (key: string) => values.get(key) ?? null,
                setItem: (key: string, value: string) => void values.set(key, value),
            },
        })
        const first = latecomerReview(room([ana, bea, dani], [expense('e1', 10, ['ana', 'bea'])]), 'dani')!
        const changed = latecomerReview(
            room([ana, bea, dani], [expense('e2', 12, ['ana', 'bea']), expense('e1', 10, ['ana', 'bea'])]),
            'dani'
        )!

        expect(isLatecomerReviewDismissed('ski-trip', first)).toBe(false)
        dismissLatecomerReview('ski-trip', first)
        expect(isLatecomerReviewDismissed('ski-trip', first)).toBe(true)
        expect(isLatecomerReviewDismissed('ski-trip', changed)).toBe(false)
    })
})

describe('projectedBalanceMinor', () => {
    it.each([
        ['5000', '2000', '3000'],
        ['1000', '2000', '-1000'],
        ['2000', '2000', '0'],
        ['-1000', '2000', '-3000'],
    ])('subtracts an added share from the current balance', (current, added, projected) => {
        expect(projectedBalanceMinor(current, added)).toBe(projected)
    })
})

describe('catchUpExpenseInput', () => {
    it('pins every editable reviewed field and the participant set', () => {
        const row = expense('e1', 10, ['ana', 'bea'], { category: 'food' })
        expect(catchUpExpenseInput(row, 'dani')).toEqual({
            action: 'add',
            memberId: 'dani',
            expectedDescription: 'Dinner',
            expectedAmountMinor: '6000',
            expectedBaseAmountMinor: '6000',
            expectedCurrency: 'EUR',
            expectedFxRate: '1',
            expectedPaidById: 'ana',
            expectedDate: iso(10),
            expectedCategory: 'food',
            expectedParticipantIds: ['ana', 'bea'],
        })
    })
})

describe('runBackfill', () => {
    const first = expense('e1', 10, ['ana', 'bea'])
    const second = expense('e2', 12, ['ana', 'bea'])
    const start = room([ana, bea, dani], [first, second])

    it('sends the exact reviewed snapshots in order', async () => {
        const reviewed = backfillableFor(start, 'dani')
        const sent: ApiExpense[] = []
        await runBackfill({
            memberId: 'dani',
            expenses: reviewed,
            patch: async (snapshot) => void sent.push(snapshot),
            onWrote: () => {},
            stopped: () => false,
        })
        expect(sent).toEqual(reviewed)
        expect(sent.map((snapshot) => snapshot.id)).toEqual(['e1', 'e2'])
    })

    it('stops between atomic commands without discarding the reviewed remainder', async () => {
        const sent: string[] = []
        await runBackfill({
            memberId: 'dani',
            expenses: [first, second],
            patch: async (snapshot) => void sent.push(snapshot.id),
            onWrote: () => {},
            stopped: () => sent.length === 1,
        })
        expect(sent).toEqual(['e1'])
    })

    it('marks a known review conflict skipped and continues with the exact next id', async () => {
        const sent: string[] = []
        const skipped: string[] = []
        await runBackfill({
            memberId: 'dani',
            expenses: [first, second],
            patch: async (snapshot) => {
                if (snapshot.id === 'e1') throw new Error('conflict')
                sent.push(snapshot.id)
            },
            onWrote: () => {},
            onSkipped: (id) => skipped.push(id),
            onPatchError: () => 'skip',
            stopped: () => false,
        })

        expect(skipped).toEqual(['e1'])
        expect(sent).toEqual(['e2'])
    })

    it('halts on a non-conflict failure without attempting later selected ids', async () => {
        const sent: string[] = []
        await expect(
            runBackfill({
                memberId: 'dani',
                expenses: [first, second],
                patch: async (snapshot) => {
                    sent.push(snapshot.id)
                    throw new Error('offline')
                },
                onWrote: () => {},
                onPatchError: () => 'throw',
                stopped: () => false,
            })
        ).rejects.toThrow('offline')
        expect(sent).toEqual(['e1'])
    })
})
