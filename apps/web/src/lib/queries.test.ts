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
import type { CatchUpExpenseInput, ExpenseCreateResult, ExpenseInput, RoomState } from './api-types'
import { queueSnapshot, setQueuePerformer, setQueueStorage } from './offline-queue'
import {
    addExpenseMutationOptions,
    addMemberMutationOptions,
    catchUpExpenseMutationOptions,
    claimMemberMutationOptions,
    removedQueueSlugs,
    roomKey,
    type ExpenseRequestRef,
} from './queries'

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
            { memberId: 'ana', amountMinor: '5000', enteredAmountMinor: null, splitWeight: null },
            { memberId: 'bea', amountMinor: '5000', enteredAmountMinor: null, splitWeight: null },
        ],
    })),
    settlements: [],
    balances: { ana: '5000', bea: '-5000' },
    suggestedTransfers: [{ fromId: 'bea', toId: 'ana', amountMinor: '5000' }],
})

const expenseResult = (state: RoomState, createdFirstSharedBalance = false): ExpenseCreateResult => ({
    ...state,
    createdFirstSharedBalance,
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

const catchUpInput: CatchUpExpenseInput & { expenseId: string } = {
    expenseId: 'e1',
    action: 'add',
    memberId: 'bea',
    expectedDescription: 'Lift pass',
    expectedAmountMinor: '10000',
    expectedBaseAmountMinor: '10000',
    expectedCurrency: 'EUR',
    expectedFxRate: '1',
    expectedPaidById: 'ana',
    expectedDate: '2026-07-01T00:00:00.000Z',
    expectedCategory: null,
    expectedParticipantIds: ['ana'],
}

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

describe('cross-tab queue removals', () => {
    const queued = (clientKey: string, slug: string) => ({
        clientKey,
        slug,
        endpoint: `/api/rooms/${slug}/expenses`,
        method: 'POST' as const,
        body: input,
        token: null,
        addedAt: 1,
    })

    it('finds rooms removed from the legacy array without refetching retained writes', () => {
        const removed = queued('removed-key', 'old-room')
        const retained = queued('retained-key', 'current-room')

        expect(
            removedQueueSlugs({
                key: 'ps:pending',
                oldValue: JSON.stringify([removed, retained]),
                newValue: JSON.stringify([retained]),
            })
        ).toEqual(['old-room'])
    })

    it('targets a removed per-item record and treats a storage clear as all active rooms', () => {
        const removed = queued('removed-key', 'item-room')

        expect(
            removedQueueSlugs({
                key: 'ps:pending:removed-key',
                oldValue: JSON.stringify(removed),
                newValue: null,
            })
        ).toEqual(['item-room'])
        expect(removedQueueSlugs({ key: null, oldValue: null, newValue: null })).toBeNull()
    })
})

describe('adding an expense', () => {
    it('seeds the room cache from the response, in one hop', async () => {
        const state = roomState(['e1', 'e2'])
        const served = expenseResult(state, true)
        const fetchMock = respondWith(201, served)
        vi.stubGlobal('fetch', fetchMock)

        await expect(addExpense(queryClient)).resolves.toEqual(served)

        expect(queryClient.getQueryData<RoomState>(roomKey(SLUG))).toEqual(state)
        expect(queryClient.getQueryData<RoomState>(roomKey(SLUG))).not.toHaveProperty('createdFirstSharedBalance')
        const sent = JSON.parse(fetchMock.mock.calls[0][1].body)
        expect(sent.clientKey).toMatch(/^[A-Za-z0-9-]{16,64}$/)
    })

    it('shows the row immediately and replaces it with the server truth', async () => {
        queryClient.setQueryData(roomKey(SLUG), roomState())
        const state = roomState(['e2', 'e1'])
        const served = expenseResult(state)
        let seenMidFlight: RoomState | undefined
        let sentClientKey: string | undefined
        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation(async (_url: string | URL | Request, init?: RequestInit) => {
                seenMidFlight = queryClient.getQueryData<RoomState>(roomKey(SLUG))
                sentClientKey = (JSON.parse(init?.body as string) as ExpenseInput).clientKey
                return { ok: true, status: 201, text: () => Promise.resolve(JSON.stringify(served)) } as Response
            })
        )

        await addExpense(queryClient)

        expect(seenMidFlight?.expenses[0].id).toBe(`pending-${sentClientKey}`)
        expect(queryClient.getQueryData<RoomState>(roomKey(SLUG))).toEqual(state)
    })

    it('rolls the optimistic row back when the server refuses the write', async () => {
        const before = roomState()
        queryClient.setQueryData(roomKey(SLUG), before)
        vi.stubGlobal('fetch', respondWith(400, { error: { code: 'AMOUNT_NOT_POSITIVE', message: 'nope' } }))

        await expect(addExpense(queryClient)).rejects.toThrow()

        expect(queryClient.getQueryData<RoomState>(roomKey(SLUG))).toEqual(before)
        expect(queueSnapshot()).toEqual([])
    })

    it('reuses one key when a staged-payer write committed but its first response was lost', async () => {
        const requestRef: ExpenseRequestRef = { current: null }
        const staged: ExpenseInput = {
            description: 'Dinner',
            amountMinor: '4000',
            currency: 'EUR',
            newPaidByName: 'Carla',
            splitMode: 'EQUAL',
        }
        const sent: Array<ExpenseInput & { clientKey: string }> = []
        vi.stubGlobal(
            'fetch',
            vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
                const body = JSON.parse(init?.body as string) as ExpenseInput & { clientKey: string }
                sent.push(body)
                if (sent.length === 1) {
                    // The server committed this key, but the phone never saw
                    // the response. A staged payer cannot be queued, so the
                    // drawer stays open and sends the same draft again.
                    throw new TypeError('response lost after commit')
                }
                const served = expenseResult(roomState([body.clientKey]), true)
                return {
                    ok: true,
                    status: 201,
                    text: () => Promise.resolve(JSON.stringify(served)),
                } as Response
            })
        )
        const observer = new MutationObserver(
            queryClient,
            addExpenseMutationOptions(queryClient, SLUG, 'token-1', requestRef)
        )

        await expect(observer.mutate(staged)).rejects.toMatchObject({ code: NETWORK_ERROR_CODE })
        await expect(observer.mutate(staged)).resolves.toEqual(expenseResult(roomState([sent[0].clientKey]), true))

        expect(sent).toHaveLength(2)
        expect(sent[1].clientKey).toBe(sent[0].clientKey)
        expect(requestRef.current).toBeNull()
        expect(queueSnapshot()).toEqual([])
    })

    it('mints a new key after the draft materially changes', async () => {
        const requestRef: ExpenseRequestRef = { current: null }
        const sent: Array<ExpenseInput & { clientKey: string }> = []
        vi.stubGlobal(
            'fetch',
            vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
                sent.push(JSON.parse(init?.body as string) as ExpenseInput & { clientKey: string })
                throw new TypeError('offline')
            })
        )
        const observer = new MutationObserver(
            queryClient,
            addExpenseMutationOptions(queryClient, SLUG, 'token-1', requestRef)
        )
        const staged: ExpenseInput = {
            description: 'Dinner',
            amountMinor: '4000',
            currency: 'EUR',
            newPaidByName: 'Carla',
            splitMode: 'EQUAL',
        }

        await expect(observer.mutate(staged)).rejects.toMatchObject({ code: NETWORK_ERROR_CODE })
        await expect(observer.mutate({ ...staged, amountMinor: '5000' })).rejects.toMatchObject({
            code: NETWORK_ERROR_CODE,
        })

        expect(sent[1].clientKey).not.toBe(sent[0].clientKey)
    })

    it('mints a new key when only the manual exchange rate changes', async () => {
        const requestRef: ExpenseRequestRef = { current: null }
        const sent: Array<ExpenseInput & { clientKey: string }> = []
        vi.stubGlobal(
            'fetch',
            vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
                sent.push(JSON.parse(init?.body as string) as ExpenseInput & { clientKey: string })
                throw new TypeError('offline')
            })
        )
        const observer = new MutationObserver(
            queryClient,
            addExpenseMutationOptions(queryClient, SLUG, 'token-1', requestRef)
        )
        const custom: ExpenseInput = {
            description: 'Round',
            amountMinor: '4',
            currency: 'BEER',
            manualFxRate: '2.5',
            newPaidByName: 'Carla',
            splitMode: 'EQUAL',
        }

        await expect(observer.mutate(custom)).rejects.toMatchObject({ code: NETWORK_ERROR_CODE })
        await expect(observer.mutate({ ...custom, manualFxRate: '3' })).rejects.toMatchObject({
            code: NETWORK_ERROR_CODE,
        })

        expect(sent[1].clientKey).not.toBe(sent[0].clientKey)
    })

    it('mints a new key when only weighted shares change', async () => {
        const requestRef: ExpenseRequestRef = { current: null }
        const sent: Array<ExpenseInput & { clientKey: string }> = []
        vi.stubGlobal(
            'fetch',
            vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
                sent.push(JSON.parse(init?.body as string) as ExpenseInput & { clientKey: string })
                throw new TypeError('offline')
            })
        )
        const observer = new MutationObserver(
            queryClient,
            addExpenseMutationOptions(queryClient, SLUG, 'token-1', requestRef)
        )
        const staged: ExpenseInput = {
            description: 'Dinner',
            amountMinor: '4000',
            currency: 'EUR',
            newPaidByName: 'Carla',
            splitMode: 'PERCENTAGE',
            weightedShares: [
                { memberId: 'ana', weight: '2500' },
                { memberId: 'bea', weight: '7500' },
            ],
        }

        await expect(observer.mutate(staged)).rejects.toMatchObject({ code: NETWORK_ERROR_CODE })
        await expect(
            observer.mutate({
                ...staged,
                weightedShares: [
                    { memberId: 'ana', weight: '5000' },
                    { memberId: 'bea', weight: '5000' },
                ],
            })
        ).rejects.toMatchObject({ code: NETWORK_ERROR_CODE })

        expect(sent[1].clientKey).not.toBe(sent[0].clientKey)
    })
})

describe('catching up an expense', () => {
    it('seeds only the nested room state from the command response', async () => {
        const state = roomState(['e1', 'e2'])
        const served = { changed: true, state }
        vi.stubGlobal('fetch', respondWith(200, served))
        const result = await new MutationObserver(
            queryClient,
            catchUpExpenseMutationOptions(queryClient, SLUG, 'token-1')
        ).mutate(catchUpInput)

        expect(result).toEqual(served)
        expect(queryClient.getQueryData<RoomState>(roomKey(SLUG))).toEqual(state)
        expect(queryClient.getQueryData(roomKey(SLUG))).not.toHaveProperty('changed')
        expect(queryClient.getQueryData(roomKey(SLUG))).not.toHaveProperty('state')
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

        await expect(addExpense(queryClient)).resolves.toEqual(expenseResult(before))

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

    it('removes only its own optimistic row when another save is still pending', async () => {
        const before = roomState()
        const unrelated = { ...before.expenses[0], id: 'pending-another-save' }
        queryClient.setQueryData(roomKey(SLUG), { ...before, expenses: [unrelated, ...before.expenses] })
        const fetchMock = offline()

        await addExpense(queryClient)

        const firstAttempt = JSON.parse(fetchMock.mock.calls[0][1].body)
        const cached = queryClient.getQueryData<RoomState>(roomKey(SLUG))!
        expect(cached.expenses.map((expense) => expense.id)).toEqual(['pending-another-save', 'e1'])
        expect(queueSnapshot()[0].clientKey).toBe(firstAttempt.clientKey)
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
        await expect(result).resolves.toEqual(expenseResult(before))

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
