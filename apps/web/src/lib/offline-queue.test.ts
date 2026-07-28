import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError, NETWORK_ERROR_CODE } from './api'
import type { ExpenseInput, RoomState } from './api-types'
import {
    MAX_QUEUED,
    PENDING_ITEM_PREFIX,
    PENDING_KEY,
    appendQueued,
    drainPending,
    drainQueue,
    enqueueWrite,
    isOfflineFailure,
    isQueuedExpenseId,
    isQueueable,
    mergeQueuedExpenses,
    parseQueue,
    queueRetryDelay,
    queueSnapshot,
    refreshQueueSnapshot,
    setQueuePerformer,
    setQueueStorage,
    subscribeToQueueNotices,
    verdictFor,
    type QueueNotice,
    type QueuedWrite,
} from './offline-queue'

/** localStorage, minus the DOM. The queue's rules are pure; this is the only
 *  state they sit on. */
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

let storage: Storage

const input = (overrides: Partial<ExpenseInput> = {}): ExpenseInput => ({
    description: 'Dinner',
    amountMinor: '6000',
    currency: 'EUR',
    paidById: 'bea',
    splitMode: 'EQUAL',
    ...overrides,
})

const item = (overrides: Partial<QueuedWrite> = {}): QueuedWrite => ({
    clientKey: 'key-1',
    slug: 'ski-trip-aaa',
    endpoint: '/api/rooms/ski-trip-aaa/expenses',
    method: 'POST',
    body: input(),
    token: 'token-1',
    addedAt: 1_700_000_000_000,
    ...overrides,
})

const apiError = (status: number, code = 'VALIDATION_ERROR') => new ApiRequestError(status, code, 'nope')
const networkError = () => new ApiRequestError(0, NETWORK_ERROR_CODE, 'offline')

const state = (): RoomState => ({
    room: {
        id: 'r1',
        slug: 'ski-trip-aaa',
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
    expenses: [
        {
            id: 'e1',
            description: 'Lift pass',
            amountMinor: '10000',
            currency: 'EUR',
            baseAmountMinor: '10000',
            fxRate: '1',
            splitMode: 'EQUAL',
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
        },
    ],
    settlements: [],
    balances: { ana: '5000', bea: '-5000' },
    suggestedTransfers: [{ fromId: 'bea', toId: 'ana', amountMinor: '5000' }],
})

beforeEach(() => {
    storage = memoryStorage()
    setQueueStorage(storage)
    setQueuePerformer(null)
})

afterEach(() => {
    setQueueStorage(null)
    setQueuePerformer(null)
    vi.unstubAllGlobals()
})

describe('what may be queued', () => {
    it('queues a room expense create and nothing else', () => {
        expect(isQueueable('/api/rooms/ski-trip-aaa/expenses', 'POST')).toBe(true)
        // Edits and deletes would silently overwrite somebody else's change.
        expect(isQueueable('/api/rooms/ski-trip-aaa/expenses/e1', 'PATCH')).toBe(false)
        expect(isQueueable('/api/rooms/ski-trip-aaa/expenses/e1', 'DELETE')).toBe(false)
        // A replayed settlement is a double payment recorded as fact.
        expect(isQueueable('/api/rooms/ski-trip-aaa/settlements', 'POST')).toBe(false)
        expect(isQueueable('/api/expenses/e1/restore', 'POST')).toBe(false)
        expect(isQueueable('/api/rooms/ski-trip-aaa/members', 'POST')).toBe(false)
        expect(isQueueable('/api/rooms', 'POST')).toBe(false)
        expect(isQueueable('/api/rooms/ski-trip-aaa/expenses', 'GET')).toBe(false)
    })

    it('only a transport failure counts as offline', () => {
        expect(isOfflineFailure(networkError())).toBe(true)
        expect(isOfflineFailure(apiError(400))).toBe(false)
        expect(isOfflineFailure(apiError(500, 'INTERNAL'))).toBe(false)
        expect(isOfflineFailure(new Error('boom'))).toBe(false)
        expect(isOfflineFailure(undefined)).toBe(false)
    })
})

describe('reading a queue back off the device', () => {
    it('survives every shape localStorage can hand back', () => {
        expect(parseQueue(null)).toEqual([])
        expect(parseQueue('')).toEqual([])
        expect(parseQueue('not json{')).toEqual([])
        expect(parseQueue('{"not":"an array"}')).toEqual([])
        expect(parseQueue('[1, null, "x"]')).toEqual([])
    })

    it('drops records that no longer look like a queued write', () => {
        const good = item()
        const raw = JSON.stringify([good, { ...item({ clientKey: 'key-2' }), body: undefined }])
        expect(parseQueue(raw)).toEqual([good])
    })

    it('re-checks the create-only rule on read, not just on write', () => {
        // A record written by an older build, or hand-edited, must not become a
        // replayed settlement just because it is sitting in storage.
        const smuggled = item({ endpoint: '/api/rooms/ski-trip-aaa/settlements' })
        expect(parseQueue(JSON.stringify([smuggled]))).toEqual([])
    })

    it('reads the legacy array and migrates it without losing the next append', () => {
        const legacy = item({ clientKey: 'legacy', body: input({ description: 'Old build' }) })
        storage.setItem(PENDING_KEY, JSON.stringify([legacy]))
        expect(queueSnapshot()).toEqual([legacy])

        const appended = enqueueWrite({
            slug: 'ski-trip-aaa',
            endpoint: '/api/rooms/ski-trip-aaa/expenses',
            method: 'POST',
            body: input({ description: 'New build' }),
        })!

        expect(storage.getItem(PENDING_KEY)).toBeNull()
        expect(storage.getItem(`${PENDING_ITEM_PREFIX}legacy`)).not.toBeNull()
        expect(storage.getItem(`${PENDING_ITEM_PREFIX}${appended.clientKey}`)).not.toBeNull()
        expect(queueSnapshot().map((queued) => queued.body.description)).toEqual(['Old build', 'New build'])
    })
})

describe('the cap', () => {
    it('appends under the cap without dropping anything', () => {
        const { items, dropped } = appendQueued([item({ clientKey: 'a' })], item({ clientKey: 'b' }))
        expect(items.map((i) => i.clientKey)).toEqual(['a', 'b'])
        expect(dropped).toEqual([])
    })

    it('drops the oldest at the cap and reports what fell off', () => {
        const full = Array.from({ length: MAX_QUEUED }, (_, i) => item({ clientKey: `k${i}` }))
        const { items, dropped } = appendQueued(full, item({ clientKey: 'newest' }))
        expect(items).toHaveLength(MAX_QUEUED)
        expect(items[0].clientKey).toBe('k1')
        expect(items[MAX_QUEUED - 1].clientKey).toBe('newest')
        expect(dropped.map((i) => i.clientKey)).toEqual(['k0'])
    })

    it('reports every record dropped when the stored queue was already over the cap', () => {
        const over = Array.from({ length: MAX_QUEUED + 3 }, (_, i) => item({ clientKey: `k${i}` }))
        const { items, dropped } = appendQueued(over, item({ clientKey: 'newest' }))
        expect(items).toHaveLength(MAX_QUEUED)
        expect(dropped).toHaveLength(4)
    })
})

describe('what to do with a refusal', () => {
    it('drops a write the room will never accept', () => {
        for (const status of [400, 404, 409, 422]) expect(verdictFor(apiError(status))).toBe('drop')
    })

    it('keeps a write the other end merely could not take right now', () => {
        // 429 especially: dropping a real expense because the rate limiter said
        // "slow down" would destroy the data the queue exists to protect.
        expect(verdictFor(apiError(429, 'RATE_LIMITED'))).toBe('stop')
        expect(verdictFor(apiError(500, 'INTERNAL'))).toBe('stop')
        expect(verdictFor(apiError(503, 'INTERNAL'))).toBe('stop')
        expect(verdictFor(networkError())).toBe('stop')
        expect(verdictFor(new Error('who knows'))).toBe('stop')
    })
})

describe('draining', () => {
    const three = [item({ clientKey: 'a' }), item({ clientKey: 'b' }), item({ clientKey: 'c' })]

    it('sends in order, one at a time, each item once', async () => {
        const seen: string[] = []
        const summary = await drainQueue(three, async (queued) => {
            seen.push(queued.clientKey)
        })
        expect(seen).toEqual(['a', 'b', 'c'])
        expect(summary.sent.map((i) => i.clientKey)).toEqual(['a', 'b', 'c'])
        expect(summary.remaining).toEqual([])
        expect(summary.dropped).toEqual([])
    })

    it('drops a rejected item and carries on with the rest', async () => {
        const summary = await drainQueue(three, async (queued) => {
            if (queued.clientKey === 'b') throw apiError(409)
        })
        expect(summary.sent.map((i) => i.clientKey)).toEqual(['a', 'c'])
        expect(summary.dropped.map((i) => i.clientKey)).toEqual(['b'])
        expect(summary.remaining).toEqual([])
    })

    it('stops at the first network failure and keeps everything from there', async () => {
        const attempted: string[] = []
        const summary = await drainQueue(three, async (queued) => {
            attempted.push(queued.clientKey)
            if (queued.clientKey === 'b') throw networkError()
        })
        // 'c' is never even attempted — a queue that keeps hammering while
        // offline is a battery bug.
        expect(attempted).toEqual(['a', 'b'])
        expect(summary.sent.map((i) => i.clientKey)).toEqual(['a'])
        expect(summary.remaining.map((i) => i.clientKey)).toEqual(['b', 'c'])
    })

    it('an empty queue is a no-op, not a special case', async () => {
        const perform = vi.fn()
        const summary = await drainQueue([], perform)
        expect(perform).not.toHaveBeenCalled()
        expect(summary).toEqual({ remaining: [], sent: [], dropped: [] })
    })
})

describe('queued rows on screen', () => {
    it('leaves a state with nothing queued exactly as the server sent it', () => {
        const server = state()
        expect(mergeQueuedExpenses(server, [])).toBe(server)
    })

    it('shows the queued expense without moving a single balance', () => {
        const server = state()
        const merged = mergeQueuedExpenses(server, [item({ clientKey: 'k1' })])

        expect(merged.expenses).toHaveLength(2)
        expect(merged.expenses[0].id).toBe('pending-k1')
        expect(merged.expenses[0].description).toBe('Dinner')
        // The whole point: a queued expense has not happened yet.
        expect(merged.balances).toEqual(server.balances)
        expect(merged.suggestedTransfers).toEqual(server.suggestedTransfers)
        expect(merged.expenses[0].shares.every((share) => share.amountMinor === '0')).toBe(true)
    })

    it('splits an EQUAL row across everyone and an EXACT row across who was named', () => {
        const equal = mergeQueuedExpenses(state(), [item()])
        expect(equal.expenses[0].shares.map((s) => s.memberId)).toEqual(['ana', 'bea'])

        const exact = mergeQueuedExpenses(state(), [
            item({
                body: input({
                    splitMode: 'EXACT',
                    exactShares: [{ memberId: 'ana', amountMinor: '6000' }],
                }),
            }),
        ])
        expect(exact.expenses[0].shares.map((s) => s.memberId)).toEqual(['ana'])
    })

    it('shows no conversion line for a queued foreign expense — no FX has happened', () => {
        const merged = mergeQueuedExpenses(state(), [item({ body: input({ currency: 'CHF', amountMinor: '5500' }) })])
        expect(merged.expenses[0].currency).toBe('CHF')
        expect(merged.expenses[0].baseAmountMinor).toBe('5500')
        expect(merged.expenses[0].fxRate).toBe('1')
    })

    it('knows which rows on screen are its own', () => {
        const queued = [item({ clientKey: 'k1' })]
        expect(isQueuedExpenseId('pending-k1', queued)).toBe(true)
        // An in-flight optimistic row is somebody else's business.
        expect(isQueuedExpenseId('pending-1700000000', queued)).toBe(false)
        expect(isQueuedExpenseId('e1', queued)).toBe(false)
    })
})

describe('the queue end to end', () => {
    const notices: QueueNotice[] = []
    let unsubscribe: () => void

    beforeEach(() => {
        notices.length = 0
        unsubscribe = subscribeToQueueNotices((notice) => notices.push(notice))
    })

    afterEach(() => unsubscribe())

    it('holds a create, tells the user, and persists it for the next boot', () => {
        const queued = enqueueWrite({
            slug: 'ski-trip-aaa',
            endpoint: '/api/rooms/ski-trip-aaa/expenses',
            method: 'POST',
            body: input(),
            token: 'token-1',
        })

        expect(queued).not.toBeNull()
        expect(queueSnapshot()).toHaveLength(1)
        expect(queued?.body.clientKey).toBe(queued?.clientKey)
        expect(storage.getItem(PENDING_KEY)).toBeNull()
        expect(storage.getItem(`${PENDING_ITEM_PREFIX}${queued!.clientKey}`)).not.toBeNull()
        expect(notices).toEqual([{ kind: 'queued' }])
    })

    it('preserves an append from another tab even when this tab cached the old queue', () => {
        expect(queueSnapshot()).toEqual([])
        const other = item({
            clientKey: 'other-tab-key',
            body: input({ description: 'Other tab' }),
            addedAt: Date.now() - 1,
        })
        storage.setItem(`${PENDING_ITEM_PREFIX}${other.clientKey}`, JSON.stringify(other))

        enqueueWrite({
            slug: 'ski-trip-aaa',
            endpoint: '/api/rooms/ski-trip-aaa/expenses',
            method: 'POST',
            body: input({ description: 'This tab' }),
        })
        refreshQueueSnapshot()

        expect(queueSnapshot().map((queued) => queued.body.description)).toEqual(['Other tab', 'This tab'])
    })

    it('refuses to hold anything but a create', () => {
        const queued = enqueueWrite({
            slug: 'ski-trip-aaa',
            endpoint: '/api/rooms/ski-trip-aaa/settlements',
            method: 'POST',
            body: input(),
        })
        expect(queued).toBeNull()
        expect(queueSnapshot()).toEqual([])
        expect(notices).toEqual([])
    })

    it('says so out loud when the cap drops the oldest expense', () => {
        for (let i = 0; i < MAX_QUEUED + 1; i++) {
            enqueueWrite({
                slug: 'ski-trip-aaa',
                endpoint: '/api/rooms/ski-trip-aaa/expenses',
                method: 'POST',
                body: input({ description: `Round ${i}` }),
            })
        }
        expect(queueSnapshot()).toHaveLength(MAX_QUEUED)
        expect(notices.filter((n) => n.kind === 'dropped-full')).toEqual([{ kind: 'dropped-full', count: 1 }])
    })

    it('does nothing without a way to send and nothing with an empty queue', async () => {
        expect(await drainPending()).toBeNull()

        setQueuePerformer(async () => {})
        expect(await drainPending()).toBeNull()
    })

    it('sends what it held, clears storage, and reports the count', async () => {
        for (const description of ['Dinner', 'Taxi']) {
            enqueueWrite({
                slug: 'ski-trip-aaa',
                endpoint: '/api/rooms/ski-trip-aaa/expenses',
                method: 'POST',
                body: input({ description }),
            })
        }
        const sent: string[] = []
        setQueuePerformer(async (queued) => void sent.push((queued.body as ExpenseInput).description))

        const summary = await drainPending()

        expect(sent).toEqual(['Dinner', 'Taxi'])
        expect(summary?.sent).toHaveLength(2)
        expect(queueSnapshot()).toEqual([])
        expect(storage.getItem(PENDING_KEY)).toBeNull()
        expect(notices.at(-1)).toEqual({ kind: 'sent', count: 2 })
    })

    it('keeps an item the network refused, so the next drain retries it', async () => {
        enqueueWrite({
            slug: 'ski-trip-aaa',
            endpoint: '/api/rooms/ski-trip-aaa/expenses',
            method: 'POST',
            body: input(),
        })
        setQueuePerformer(async () => {
            throw networkError()
        })

        await drainPending()

        expect(queueSnapshot()).toHaveLength(1)
        expect(notices.some((n) => n.kind === 'sent')).toBe(false)
    })

    it('schedules one bounded backoff after a transient failure', async () => {
        const setTimeout = vi.fn((_callback: () => void, _delay?: number) => 42)
        const clearTimeout = vi.fn()
        vi.stubGlobal('window', { setTimeout, clearTimeout })
        enqueueWrite({
            slug: 'ski-trip-aaa',
            endpoint: '/api/rooms/ski-trip-aaa/expenses',
            method: 'POST',
            body: input(),
        })
        setQueuePerformer(async () => {
            throw networkError()
        })

        await drainPending()
        await drainPending()

        expect(setTimeout).toHaveBeenCalledOnce()
        expect(setTimeout.mock.calls[0][1]).toBe(5_000)
        expect(queueRetryDelay(0)).toBe(5_000)
        expect(queueRetryDelay(1)).toBe(10_000)
        expect(queueRetryDelay(6)).toBe(300_000)
        expect(queueRetryDelay(20)).toBe(300_000)
    })

    it('drops an item the server refused and says why it disappeared', async () => {
        enqueueWrite({
            slug: 'ski-trip-aaa',
            endpoint: '/api/rooms/ski-trip-aaa/expenses',
            method: 'POST',
            body: input(),
        })
        setQueuePerformer(async () => {
            throw apiError(409, 'ROOM_ARCHIVED')
        })

        await drainPending()

        expect(queueSnapshot()).toEqual([])
        expect(notices.at(-1)).toEqual({ kind: 'dropped-rejected', count: 1 })
    })

    /**
     * The window is wide open in practice: `seed` asks for a drain after every
     * successful mutation, so a slow save has a whole round trip during which
     * `enqueueWrite` can append. Writing the drain's own `remaining` back
     * unconditionally erased whatever arrived — the expense and its row, with no
     * toast and no trace, which is precisely the loss this module exists to
     * prevent.
     */
    describe('a write that arrives mid-drain', () => {
        /** A performer that stops on the first item until the test lets it go. */
        const gated = () => {
            let release!: () => void
            const started = new Promise<void>((resolve) => {
                setQueuePerformer(async () => {
                    resolve()
                    await gate
                })
            })
            const gate = new Promise<void>((resolve) => {
                release = resolve
            })
            return { started, release }
        }

        const queue = (description: string) =>
            enqueueWrite({
                slug: 'ski-trip-aaa',
                endpoint: '/api/rooms/ski-trip-aaa/expenses',
                method: 'POST',
                body: input({ description }),
            })

        it('survives a drain that succeeds', async () => {
            queue('Dinner')
            const { started, release } = gated()

            const draining = drainPending()
            await started
            queue('Taxi')
            release()
            await draining

            expect(queueSnapshot().map((held) => (held.body as ExpenseInput).description)).toEqual(['Taxi'])
        })

        it('survives a drain that stops on a refusal', async () => {
            queue('Dinner')
            let started!: () => void
            const hasStarted = new Promise<void>((resolve) => {
                started = resolve
            })
            let release!: () => void
            const gate = new Promise<void>((resolve) => {
                release = resolve
            })
            setQueuePerformer(async () => {
                started()
                await gate
                throw networkError()
            })

            const draining = drainPending()
            await hasStarted
            queue('Taxi')
            release()
            await draining

            // The refused item is kept AND the newcomer is still there — the
            // stop verdict must not be a licence to forget.
            expect(queueSnapshot().map((held) => (held.body as ExpenseInput).description)).toEqual(['Dinner', 'Taxi'])
        })
    })

    it('never drains twice at once — every success asks for a drain, including its own', async () => {
        enqueueWrite({
            slug: 'ski-trip-aaa',
            endpoint: '/api/rooms/ski-trip-aaa/expenses',
            method: 'POST',
            body: input(),
        })
        let inFlight = 0
        let overlapped = false
        setQueuePerformer(async () => {
            inFlight += 1
            if (inFlight > 1) overlapped = true
            await drainPending()
            inFlight -= 1
        })

        await drainPending()

        expect(overlapped).toBe(false)
    })
})
