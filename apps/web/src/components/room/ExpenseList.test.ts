import { afterEach, describe, expect, it } from 'vitest'
import type { ApiExpense, ExpenseInput } from '@/lib/api-types'
import {
    OFFLINE_EQUAL_ROSTER_UNKNOWN,
    PENDING_ITEM_PREFIX,
    queueSnapshot,
    setQueuePerformer,
    setQueueStorage,
    type QueuedWrite,
} from '@/lib/offline-queue'
import { getExpensePersonalPosition, retryBlockedQueuedWrite } from './ExpenseList'

const expense = (patch: Partial<ApiExpense> = {}): ApiExpense => ({
    id: 'expense',
    description: 'Pizza',
    amountMinor: '4000',
    currency: 'USD',
    baseAmountMinor: '4000',
    fxRate: '1',
    splitMode: 'EQUAL',
    paidById: 'ana',
    createdById: 'ana',
    date: '2026-08-03T12:00:00.000Z',
    category: null,
    createdAt: '2026-08-03T12:00:00.000Z',
    shares: [
        {
            memberId: 'ana',
            amountMinor: '2000',
            enteredAmountMinor: null,
            splitWeight: null,
        },
        {
            memberId: 'bea',
            amountMinor: '2000',
            enteredAmountMinor: null,
            splitWeight: null,
        },
    ],
    reactions: [],
    ...patch,
})

describe('the compact expense personal position', () => {
    const members = ['ana', 'bea', 'marco']

    it.each([
        {
            name: 'payer lends everyone else their shares',
            row: expense(),
            meId: 'ana',
            expected: { direction: 'lent', amountMinor: '2000', currency: 'USD' },
        },
        {
            name: 'non-payer borrows their own share',
            row: expense(),
            meId: 'bea',
            expected: { direction: 'borrowed', amountMinor: '2000', currency: 'USD' },
        },
        {
            name: 'self-only spending is a neutral total rather than lent zero',
            row: expense({
                shares: [
                    {
                        memberId: 'ana',
                        amountMinor: '4000',
                        enteredAmountMinor: null,
                        splitWeight: null,
                    },
                ],
            }),
            meId: 'ana',
            expected: { direction: 'total', amountMinor: '4000', currency: 'USD' },
        },
        {
            name: 'a payer excluded from the split lent the full base amount',
            row: expense({
                shares: [
                    {
                        memberId: 'bea',
                        amountMinor: '4000',
                        enteredAmountMinor: null,
                        splitWeight: null,
                    },
                ],
            }),
            meId: 'ana',
            expected: { direction: 'lent', amountMinor: '4000', currency: 'USD' },
        },
        {
            name: 'an uninvolved room member sees the total',
            row: expense(),
            meId: 'marco',
            expected: { direction: 'total', amountMinor: '4000', currency: 'USD' },
        },
        {
            name: 'an invalid cached identity sees the total',
            row: expense(),
            meId: 'missing',
            expected: { direction: 'total', amountMinor: '4000', currency: 'USD' },
        },
        {
            name: 'rounding stays in integer minor units',
            row: expense({
                amountMinor: '100',
                baseAmountMinor: '100',
                shares: [
                    { memberId: 'ana', amountMinor: '33', enteredAmountMinor: null, splitWeight: null },
                    { memberId: 'bea', amountMinor: '67', enteredAmountMinor: null, splitWeight: null },
                ],
            }),
            meId: 'ana',
            expected: { direction: 'lent', amountMinor: '67', currency: 'USD' },
        },
        {
            name: 'amounts beyond Number safe range stay exact',
            row: expense({
                amountMinor: '90071992547409930',
                baseAmountMinor: '90071992547409930',
                shares: [
                    { memberId: 'ana', amountMinor: '30', enteredAmountMinor: null, splitWeight: null },
                    {
                        memberId: 'bea',
                        amountMinor: '90071992547409900',
                        enteredAmountMinor: null,
                        splitWeight: null,
                    },
                ],
            }),
            meId: 'ana',
            expected: { direction: 'lent', amountMinor: '90071992547409900', currency: 'USD' },
        },
    ])('$name', ({ row, meId, expected }) => {
        expect(getExpensePersonalPosition(row, 'USD', meId, members, false)).toEqual(expected)
    })

    it('uses the entered amount and currency for an unsaved foreign expense', () => {
        const row = expense({ amountMinor: '1234', currency: 'CHF', baseAmountMinor: '9999', shares: [] })

        expect(getExpensePersonalPosition(row, 'USD', 'ana', members, true)).toEqual({
            direction: 'total',
            amountMinor: '1234',
            currency: 'CHF',
        })
    })
})

describe('the Retry button on a blocked draft', () => {
    const memoryStorage = (): Storage => {
        const map = new Map<string, string>()
        return {
            get length() {
                return map.size
            },
            key: (index: number) => [...map.keys()][index] ?? null,
            getItem: (key: string) => map.get(key) ?? null,
            setItem: (key: string, value: string) => void map.set(key, value),
            removeItem: (key: string) => void map.delete(key),
            clear: () => map.clear(),
        } as Storage
    }

    const body: ExpenseInput = {
        description: 'Dinner',
        amountMinor: '6000',
        currency: 'EUR',
        paidById: 'bea',
        splitMode: 'EQUAL',
    }

    const legacy: QueuedWrite = {
        clientKey: 'legacy-key',
        slug: 'ski-trip-aaa',
        endpoint: '/api/rooms/ski-trip-aaa/expenses',
        method: 'POST',
        body,
        token: 'old-token',
        addedAt: 1_700_000_000_000,
    }

    /** A device holding one legacy draft, with `broken` refusing every write. */
    const deviceHolding = (draft: QueuedWrite, broken = false): QueuedWrite => {
        const store = memoryStorage()
        store.setItem(`${PENDING_ITEM_PREFIX}${draft.clientKey}`, JSON.stringify(draft))
        if (broken)
            store.setItem = () => {
                throw new DOMException('quota exceeded', 'QuotaExceededError')
            }
        setQueueStorage(store)
        setQueuePerformer(null)
        return queueSnapshot()[0]
    }

    afterEach(() => {
        setQueueStorage(null)
        setQueuePerformer(null)
    })

    it('confirms the reviewed roster in the same operation that unblocks the draft', () => {
        const write = deviceHolding(legacy)
        expect(write.blocked?.code).toBe(OFFLINE_EQUAL_ROSTER_UNKNOWN)

        expect(
            retryBlockedQueuedWrite(write, {
                token: 'current-token',
                activeMemberIds: ['ana', 'bea'],
                needsRosterConfirmation: true,
            })
        ).toBe(true)

        expect(queueSnapshot()[0].body.participantIds).toEqual(['ana', 'bea'])
        expect(queueSnapshot()[0].blocked).toBeUndefined()
        expect(queueSnapshot()[0].token).toBe('current-token')
    })

    /**
     * The screen turns this false into a toast. Before it was a swallowed
     * storage error reported as success: the drawer closed, nothing was queued
     * for sending, and the row went on saying "waiting to send" indefinitely.
     */
    it('answers false when the device cannot keep the confirmation, and stays blocked', () => {
        const write = deviceHolding(legacy, true)

        expect(
            retryBlockedQueuedWrite(write, {
                token: 'current-token',
                activeMemberIds: ['ana', 'bea'],
                needsRosterConfirmation: true,
            })
        ).toBe(false)

        expect(queueSnapshot()[0].blocked?.code).toBe(OFFLINE_EQUAL_ROSTER_UNKNOWN)
        expect(queueSnapshot()[0].body.participantIds).toBeUndefined()
    })
})
