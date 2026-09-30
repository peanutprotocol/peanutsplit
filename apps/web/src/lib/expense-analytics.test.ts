import { MutationObserver, QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExpenseCreateResult, ExpenseInput } from './api-types'
import { addExpenseMutationOptions, type ExpenseRequestRef } from './queries/expenses'
import { replayQueuedExpense } from './queries/offline'
import { queueSnapshot, setQueuePerformer, setQueueStorage } from './offline-queue'
import { roomKey } from './queries/core'

const posthog = vi.hoisted(() => ({ capture: vi.fn(), init: vi.fn() }))
vi.mock('posthog-js', () => ({ default: posthog }))

const slug = 'private-trip-link'
const roomPseudonym = 'safe-room-pseudonym'
const input: ExpenseInput = {
    description: 'Private dinner',
    amountMinor: '6000',
    currency: 'GBP',
    paidById: 'private-member',
    splitMode: 'EQUAL',
    clientKey: 'k-legacy-client-key-123456',
}
const response = (activation = false, clientKey = input.clientKey!): ExpenseCreateResult => ({
    room: {
        id: 'private-room-id',
        slug,
        analyticsKey: roomPseudonym,
        name: 'Private trip',
        emoji: null,
        currency: 'EUR',
        coverUrl: null,
        theme: null,
        createdAt: '2026-09-01T00:00:00.000Z',
    },
    members: [],
    expenses: [
        {
            id: clientKey,
            description: input.description!,
            amountMinor: input.amountMinor,
            currency: input.currency,
            baseAmountMinor: '7000',
            fxRate: '1.1667',
            splitMode: input.splitMode,
            paidById: input.paidById!,
            createdById: null,
            date: '2026-09-01T00:00:00.000Z',
            category: null,
            createdAt: '2026-09-01T12:34:56.000Z',
            shares: [],
            reactions: [],
        },
    ],
    settlements: [],
    balances: {},
    suggestedTransfers: [],
    createdFirstSharedBalance: activation,
})
const success = (result = response()): Response =>
    ({
        ok: true,
        status: 201,
        text: async () => JSON.stringify(result),
    }) as Response

let client: QueryClient
beforeEach(() => {
    vi.clearAllMocks()
    const storage = new Map<string, string>()
    const localStorage = {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
            storage.set(key, value)
        },
        removeItem: (key: string) => {
            storage.delete(key)
        },
        get length() {
            return storage.size
        },
        key: (index: number) => [...storage.keys()][index] ?? null,
        clear: () => storage.clear(),
    }
    vi.stubGlobal('window', { localStorage, setTimeout, clearTimeout })
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test')
    client = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } })
    setQueueStorage(localStorage)
    setQueuePerformer(null)
    client.setQueryData(roomKey(slug), response())
})
afterEach(() => {
    client.clear()
    setQueueStorage(null)
    setQueuePerformer(null)
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
})
const save = () => new MutationObserver(client, addExpenseMutationOptions(client, slug)).mutate(input)

describe('acknowledged expense analytics', () => {
    it('waits for acknowledgement and sends only safe expense facts', async () => {
        let acknowledge!: (value: Response) => void
        vi.stubGlobal(
            'fetch',
            vi.fn(
                () =>
                    new Promise<Response>((resolve) => {
                        acknowledge = resolve
                    })
            )
        )
        const pending = save()
        await vi.waitFor(() => expect(acknowledge).toBeTypeOf('function'))
        expect(posthog.capture).not.toHaveBeenCalled()
        acknowledge(success())
        await pending
        expect(posthog.capture.mock.calls).toEqual([
            [
                'expense_added',
                { room: roomPseudonym, splitMode: 'EQUAL', foreign: true },
                expect.objectContaining({
                    uuid: expect.stringMatching(
                        /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
                    ),
                    timestamp: new Date('2026-09-01T12:34:56.000Z'),
                }),
            ],
        ])
        const sent = JSON.stringify(posthog.capture.mock.calls)
        for (const privateValue of [slug, input.description, input.amountMinor, input.paidById]) {
            expect(sent).not.toContain(privateValue)
        }
    })

    it('does not count a queued draft and counts its successful replay once', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
        const queued = await save()
        expect(queued.queuedLocally).toBe(true)
        expect(posthog.capture).not.toHaveBeenCalled()
        expect(queueSnapshot()).toHaveLength(1)
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(success(response(true))))
        const replayed = await replayQueuedExpense(queueSnapshot()[0])
        expect(posthog.capture.mock.calls).toEqual([
            [
                'expense_added',
                { room: roomPseudonym, splitMode: 'EQUAL', foreign: true },
                expect.objectContaining({
                    uuid: expect.stringMatching(
                        /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
                    ),
                    timestamp: new Date('2026-09-01T12:34:56.000Z'),
                }),
            ],
        ])
        expect(replayed).not.toHaveProperty('createdFirstSharedBalance')
    })

    it('does not count a failed replay', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
        await save()
        await expect(replayQueuedExpense(queueSnapshot()[0])).rejects.toThrow()
        expect(posthog.capture).not.toHaveBeenCalled()
    })

    it('does not count a server rejection', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: false,
                status: 400,
                text: async () => JSON.stringify({ error: { code: 'INVALID_AMOUNT', message: 'invalid amount' } }),
            })
        )
        await expect(save()).rejects.toThrow('invalid amount')
        expect(posthog.capture).not.toHaveBeenCalled()
        expect(queueSnapshot()).toHaveLength(0)
    })

    it('counts one acknowledgement when a committed staged-payer request loses its response', async () => {
        const sentKeys: string[] = []
        vi.stubGlobal(
            'fetch',
            vi.fn(async (_url: string, options: RequestInit) => {
                sentKeys.push(JSON.parse(options.body as string).clientKey)
                if (sentKeys.length === 1) throw new TypeError('response lost')
                return success(response(true, sentKeys.at(-1)))
            })
        )
        const requestRef: ExpenseRequestRef = { current: null }
        const observer = new MutationObserver(client, addExpenseMutationOptions(client, slug, undefined, requestRef))
        const staged = { ...input, clientKey: undefined, paidById: undefined, newPaidByName: 'Private person' }
        await expect(observer.mutate(staged)).rejects.toThrow()
        expect(posthog.capture).not.toHaveBeenCalled()
        await observer.mutate(staged)
        expect(sentKeys[1]).toBe(sentKeys[0])
        expect(posthog.capture.mock.calls.map(([event]) => event)).toEqual(['expense_added'])
    })
    it('reuses both the UUID and server timestamp when a legacy queue record is replayed again', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
        await save()
        const item = queueSnapshot()[0]
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(success()))
        await replayQueuedExpense(item)
        await replayQueuedExpense(item)
        expect(posthog.capture).toHaveBeenCalledTimes(2)
        expect(posthog.capture.mock.calls[1]).toEqual(posthog.capture.mock.calls[0])
        expect(posthog.capture.mock.calls[0][2].timestamp).toEqual(new Date(response().expenses[0].createdAt))
        expect(posthog.capture.mock.calls[0][2].uuid).not.toBe(item.clientKey)
    })

    it('does not invent a new event for an acknowledged expense that has since been deleted', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(success({ ...response(), expenses: [] })))
        await save()
        expect(posthog.capture).not.toHaveBeenCalled()
    })

    it('keeps an acknowledged save successful when event hashing fails', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(success()))
        vi.stubGlobal('crypto', { subtle: { digest: vi.fn().mockRejectedValue(new Error('unavailable')) } })
        const result = await save()
        expect(result.queuedLocally).toBe(false)
        expect(queueSnapshot()).toHaveLength(0)
        expect(posthog.capture).not.toHaveBeenCalled()
    })
})
