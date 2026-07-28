/**
 * THE cache-seeding convention, tested without a renderer.
 *
 * `MutationObserver` is react-query's framework-agnostic core — the same object
 * `useMutation` drives — so the mutation options can be exercised exactly as the
 * drawer would, against a real QueryClient, with no DOM.
 */
import { MutationObserver, QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NETWORK_ERROR_CODE } from './api'
import type { ExpenseInput, RoomState } from './api-types'
import { queueSnapshot, setQueuePerformer, setQueueStorage } from './offline-queue'
import { addExpenseMutationOptions, roomKey } from './queries'

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

const SLUG = 'ski-trip-aaa'

const roomState = (expenseIds: string[] = ['e1']): RoomState => ({
    room: {
        id: 'r1',
        slug: SLUG,
        name: 'Ski trip',
        emoji: '🎿',
        currency: 'EUR',
        coverUrl: null,
        createdAt: '2026-07-01T00:00:00.000Z',
        archivedAt: null,
    },
    members: [
        { id: 'ana', name: 'Ana', createdAt: '2026-07-01T00:00:00.000Z' },
        { id: 'bea', name: 'Bea', createdAt: '2026-07-01T00:00:00.000Z' },
    ],
    expenses: expenseIds.map((id) => ({
        id,
        description: 'Lift pass',
        amountMinor: '10000',
        currency: 'EUR',
        baseAmountMinor: '10000',
        fxRate: '1',
        splitMode: 'EQUAL' as const,
        paidById: 'ana',
        createdById: 'ana',
        date: '2026-07-01T00:00:00.000Z',
        category: null,
        createdAt: '2026-07-01T00:00:00.000Z',
        shares: [
            { memberId: 'ana', amountMinor: '5000', enteredAmountMinor: null },
            { memberId: 'bea', amountMinor: '5000', enteredAmountMinor: null },
        ],
    })),
    settlements: [],
    balances: { ana: '5000', bea: '-5000' },
    suggestedTransfers: [{ fromId: 'bea', toId: 'ana', amountMinor: '5000' }],
})

const input: ExpenseInput = {
    description: 'Dinner',
    amountMinor: '6000',
    currency: 'EUR',
    paidById: 'bea',
    splitMode: 'EQUAL',
}

const respondWith = (status: number, body: unknown) =>
    vi.fn().mockResolvedValue({
        ok: status < 400,
        status,
        text: () => Promise.resolve(JSON.stringify(body)),
    } as unknown as Response)

const addExpense = (queryClient: QueryClient) =>
    new MutationObserver(queryClient, addExpenseMutationOptions(queryClient, SLUG, 'token-1')).mutate(input)

let queryClient: QueryClient

beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } })
    setQueueStorage(memoryStorage())
    setQueuePerformer(null)
})

afterEach(() => {
    vi.unstubAllGlobals()
    setQueueStorage(null)
    queryClient.clear()
})

describe('adding an expense', () => {
    it('seeds the room cache from the response, in one hop', async () => {
        const served = roomState(['e1', 'e2'])
        vi.stubGlobal('fetch', respondWith(201, served))

        await addExpense(queryClient)

        expect(queryClient.getQueryData<RoomState>(roomKey(SLUG))).toEqual(served)
    })

    it('shows the row immediately and replaces it with the server truth', async () => {
        queryClient.setQueryData(roomKey(SLUG), roomState())
        const served = roomState(['e2', 'e1'])
        let seenMidFlight: RoomState | undefined
        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation(async () => {
                seenMidFlight = queryClient.getQueryData<RoomState>(roomKey(SLUG))
                return { ok: true, status: 201, text: () => Promise.resolve(JSON.stringify(served)) } as Response
            })
        )

        await addExpense(queryClient)

        expect(seenMidFlight?.expenses[0].id.startsWith('pending-')).toBe(true)
        expect(queryClient.getQueryData<RoomState>(roomKey(SLUG))).toEqual(served)
    })

    it('rolls the optimistic row back when the server refuses the write', async () => {
        const before = roomState()
        queryClient.setQueryData(roomKey(SLUG), before)
        vi.stubGlobal('fetch', respondWith(400, { error: { code: 'AMOUNT_NOT_POSITIVE', message: 'nope' } }))

        await expect(addExpense(queryClient)).rejects.toThrow()

        expect(queryClient.getQueryData<RoomState>(roomKey(SLUG))).toEqual(before)
        expect(queueSnapshot()).toEqual([])
    })
})

describe('adding an expense with no network', () => {
    const offline = () => vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    it('queues the write and resolves with the room exactly as it was', async () => {
        const before = roomState()
        queryClient.setQueryData(roomKey(SLUG), before)
        offline()

        await expect(addExpense(queryClient)).resolves.toEqual(before)

        // No balance moved, no placeholder left seeded in the cache — the queued
        // row is merged in at read time by `useRoomState`, from the queue.
        expect(queryClient.getQueryData<RoomState>(roomKey(SLUG))).toEqual(before)
        expect(queueSnapshot()).toHaveLength(1)
        expect(queueSnapshot()[0].endpoint).toBe(`/api/rooms/${SLUG}/expenses`)
        expect(queueSnapshot()[0].token).toBe('token-1')
    })

    it('fails honestly when there is no cached room to resolve with', async () => {
        offline()

        const failure = await addExpense(queryClient).catch((error) => error)

        expect(failure.code).toBe(NETWORK_ERROR_CODE)
        expect(queueSnapshot()).toEqual([])
    })
})
