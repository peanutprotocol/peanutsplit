/**
 * THE cache-seeding convention, tested without a renderer.
 *
 * `MutationObserver` is react-query's framework-agnostic core — the same object
 * `useMutation` drives — so the mutation options can be exercised exactly as the
 * drawer would, against a real QueryClient, with no DOM.
 */
import { MutationObserver, QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EXPENSE_WRITE_TIMEOUT_MS, NETWORK_ERROR_CODE } from './api'
import type { ExpenseInput, RoomState } from './api-types'
import { queueSnapshot, setQueuePerformer, setQueueStorage } from './offline-queue'
import { addExpenseMutationOptions, addMemberMutationOptions, claimMemberMutationOptions, roomKey } from './queries'

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
        theme: null,
        createdAt: '2026-07-01T00:00:00.000Z',
        archivedAt: null,
    },
    members: [
        { id: 'ana', name: 'Ana', avatar: null, createdAt: '2026-07-01T00:00:00.000Z' },
        { id: 'bea', name: 'Bea', avatar: null, createdAt: '2026-07-01T00:00:00.000Z' },
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
        reactions: [],
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

const addMember = (queryClient: QueryClient) =>
    new MutationObserver(queryClient, addMemberMutationOptions(queryClient, SLUG)).mutate({ name: 'Carla' })

const claimMember = (queryClient: QueryClient) =>
    new MutationObserver(queryClient, claimMemberMutationOptions(queryClient, SLUG)).mutate({ memberId: 'bea' })

let queryClient: QueryClient

beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } })
    setQueueStorage(memoryStorage())
    setQueuePerformer(null)
})

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    setQueueStorage(null)
    queryClient.clear()
})

describe('adding an expense', () => {
    it('seeds the room cache from the response, in one hop', async () => {
        const served = roomState(['e1', 'e2'])
        const fetchMock = respondWith(201, served)
        vi.stubGlobal('fetch', fetchMock)

        await addExpense(queryClient)

        expect(queryClient.getQueryData<RoomState>(roomKey(SLUG))).toEqual(served)
        const sent = JSON.parse(fetchMock.mock.calls[0][1].body)
        expect(sent.clientKey).toMatch(/^[A-Za-z0-9-]{16,64}$/)
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
    const offline = () => {
        const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
        vi.stubGlobal('fetch', fetchMock)
        return fetchMock
    }

    it('queues the write and resolves with the room exactly as it was', async () => {
        const before = roomState()
        queryClient.setQueryData(roomKey(SLUG), before)
        const fetchMock = offline()

        await expect(addExpense(queryClient)).resolves.toEqual(before)

        // No balance moved, no placeholder left seeded in the cache — the queued
        // row is merged in at read time by `useRoomState`, from the queue.
        expect(queryClient.getQueryData<RoomState>(roomKey(SLUG))).toEqual(before)
        expect(queueSnapshot()).toHaveLength(1)
        expect(queueSnapshot()[0].endpoint).toBe(`/api/rooms/${SLUG}/expenses`)
        expect(queueSnapshot()[0].token).toBe('token-1')
        const firstAttempt = JSON.parse(fetchMock.mock.calls[0][1].body)
        expect(queueSnapshot()[0].clientKey).toBe(firstAttempt.clientKey)
        expect(queueSnapshot()[0].body.clientKey).toBe(firstAttempt.clientKey)
    })

    it('fails honestly when there is no cached room to resolve with', async () => {
        offline()

        const failure = await addExpense(queryClient).catch((error) => error)

        expect(failure.code).toBe(NETWORK_ERROR_CODE)
        expect(queueSnapshot()).toEqual([])
    })

    it('queues a timed-out first attempt with the exact same client key', async () => {
        vi.useFakeTimers()
        const before = roomState()
        queryClient.setQueryData(roomKey(SLUG), before)
        const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
            return new Promise<Response>((_resolve, reject) => {
                const signal = init?.signal
                if (!signal) return
                signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), {
                    once: true,
                })
            })
        })
        vi.stubGlobal('fetch', fetchMock)

        const result = addExpense(queryClient)
        await vi.advanceTimersByTimeAsync(EXPENSE_WRITE_TIMEOUT_MS)
        await expect(result).resolves.toEqual(before)

        const firstAttempt = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
        expect(queueSnapshot()).toHaveLength(1)
        expect(queueSnapshot()[0].clientKey).toBe(firstAttempt.clientKey)
        expect(queueSnapshot()[0].body.clientKey).toBe(firstAttempt.clientKey)
    })
})

describe('adding somebody who has not tapped the link yet', () => {
    /**
     * The organiser types four names in from the share sheet. The HTTP response
     * itself is token-free, and the projection remains explicit so neither an
     * identity envelope nor a future response field drifts into room state.
     */
    it('requests a token-free roster addition and keeps its identity envelope out of the cache', async () => {
        const state = {
            ...roomState(),
            members: [...roomState().members, { id: 'cai', name: 'Carla', createdAt: '2026-07-02T00:00:00.000Z' }],
        }
        const served = { ...state, memberId: 'cai' }
        const fetchMock = respondWith(201, served)
        vi.stubGlobal('fetch', fetchMock)

        const kept = await addMember(queryClient)
        const cached = queryClient.getQueryData<RoomState>(roomKey(SLUG))

        expect(kept).toEqual({ memberId: 'cai', state })
        expect(cached).toEqual(state)
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ name: 'Carla', intent: 'add' })
        expect(cached).not.toHaveProperty('memberId')
        expect(cached).not.toHaveProperty('memberToken')
    })

    it('still sanitizes an overbroad or rolling-deploy response', async () => {
        const state = {
            ...roomState(),
            members: [...roomState().members, { id: 'cai', name: 'Carla', createdAt: '2026-07-02T00:00:00.000Z' }],
        }
        vi.stubGlobal('fetch', respondWith(201, { ...state, memberId: 'cai', memberToken: 'legacy-token-for-carla' }))

        const kept = await addMember(queryClient)
        const cached = queryClient.getQueryData<RoomState>(roomKey(SLUG))

        expect(JSON.stringify(kept)).not.toContain('legacy-token-for-carla')
        expect(JSON.stringify(cached)).not.toContain('legacy-token-for-carla')
    })
})

describe('claiming an existing roster entry', () => {
    it('returns the usable token to the caller but seeds only token-free room state', async () => {
        const state = roomState()
        const served = { ...state, memberId: 'bea', memberToken: 'secret-token-for-bea' }
        const fetchMock = respondWith(200, served)
        vi.stubGlobal('fetch', fetchMock)

        const claimed = await claimMember(queryClient)
        const cached = queryClient.getQueryData<RoomState>(roomKey(SLUG))

        expect(claimed.memberId).toBe('bea')
        expect(claimed.memberToken).toBe('secret-token-for-bea')
        expect(cached).toEqual(state)
        expect(JSON.stringify(cached)).not.toContain('secret-token-for-bea')
        expect(fetchMock.mock.calls[0][0]).toBe(`/api/rooms/${SLUG}/members/bea/claim`)
    })
})
