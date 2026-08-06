import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError, NETWORK_ERROR_CODE } from './api'
import type { ExpenseInput, RoomState } from './api-types'
import {
    MAX_QUEUED,
    PENDING_ITEM_PREFIX,
    PENDING_KEY,
    RETRY_BASE_MS,
    appendQueued,
    drainPending,
    drainQueue,
    discardQueuedWrite,
    enqueueWrite,
    isOfflineFailure,
    isQueuedExpenseId,
    isQueueable,
    mergeQueuedExpenses,
    parseQueue,
    queueRetryDelay,
    queueSnapshot,
    queuedParticipantIds,
    refreshQueueSnapshot,
    remapQueuedExpenseParticipant,
    remapQueuedExpensePayer,
    retryBlockedWrite,
    setQueuePerformer,
    setQueueStorage,
    subscribeToQueueNotices,
    updateBlockedWrite,
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
                { memberId: 'ana', amountMinor: '5000', enteredAmountMinor: null, splitWeight: null },
                { memberId: 'bea', amountMinor: '5000', enteredAmountMinor: null, splitWeight: null },
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

    it('never evicts blocked drafts; a new draft is refused when every slot needs review', () => {
        const blocked = Array.from({ length: MAX_QUEUED }, (_, i) =>
            item({
                clientKey: `blocked-${i}`,
                blocked: { code: 'MEMBER_FORMER', blockedAt: 1_700_000_000_000 + i },
            })
        )
        const incoming = item({ clientKey: 'incoming' })
        const result = appendQueued(blocked, incoming)

        expect(result.items).toEqual(blocked)
        expect(result.dropped).toEqual([incoming])
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

    it('blocks membership refusals for review instead of deleting the money draft', () => {
        for (const code of ['MEMBER_FORMER', 'MEMBER_TOKEN_INVALID', 'NOT_A_MEMBER']) {
            expect(verdictFor(apiError(403, code))).toBe('block')
        }
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
        expect(summary).toEqual({ remaining: [], sent: [], dropped: [], blocked: [] })
    })

    it('keeps a new block as a per-room ordering barrier without starving another room', async () => {
        const sameRoomLater = item({ clientKey: 'a2', addedAt: 2 })
        const otherRoom = item({
            clientKey: 'b1',
            slug: 'beach-trip-bbb',
            endpoint: '/api/rooms/beach-trip-bbb/expenses',
            addedAt: 3,
        })
        const attempted: string[] = []
        const summary = await drainQueue([item({ clientKey: 'a1' }), sameRoomLater, otherRoom], async (queued) => {
            attempted.push(queued.clientKey)
            if (queued.clientKey === 'a1') throw apiError(403, 'MEMBER_FORMER')
        })

        expect(attempted).toEqual(['a1', 'b1'])
        expect(summary.blocked.map((queued) => queued.clientKey)).toEqual(['a1'])
        expect(summary.remaining.map((queued) => queued.clientKey)).toEqual(['a2'])
        expect(summary.sent.map((queued) => queued.clientKey)).toEqual(['b1'])
        expect(summary.blocked[0].body).toEqual(item().body)
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

    it('replaces only the queued write’s matching optimistic row', () => {
        const server = state()
        const withOptimistic = {
            ...server,
            expenses: [
                { ...server.expenses[0], id: 'pending-k1' },
                { ...server.expenses[0], id: 'pending-other' },
                ...server.expenses,
            ],
        }
        const merged = mergeQueuedExpenses(withOptimistic, [item({ clientKey: 'k1' })])

        expect(merged.expenses.filter((expense) => expense.id === 'pending-k1')).toHaveLength(1)
        expect(merged.expenses[0].id).toBe('pending-k1')
        expect(merged.expenses[1].id).toBe('pending-other')
        expect(merged.expenses.slice(2)).toEqual(server.expenses)
    })

    it('suppresses the queued row once the replay response already contains its client key', () => {
        const server = state()
        const replayed = {
            ...server,
            expenses: [{ ...server.expenses[0], id: 'k1', description: 'Dinner' }, ...server.expenses],
        }
        const merged = mergeQueuedExpenses(replayed, [item({ clientKey: 'k1' })])

        expect(merged.expenses.filter((expense) => expense.id === 'pending-k1')).toHaveLength(0)
        expect(merged.expenses.filter((expense) => expense.id === 'k1')).toHaveLength(1)
        expect(merged.expenses).toEqual(replayed.expenses)
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

    it('keeps weighted participants and their original weights on queued rows', () => {
        const percentage = mergeQueuedExpenses(state(), [
            item({
                body: input({
                    splitMode: 'PERCENTAGE',
                    weightedShares: [
                        { memberId: 'ana', weight: '2500' },
                        { memberId: 'bea', weight: '7500' },
                    ],
                }),
            }),
        ])
        expect(percentage.expenses[0].shares).toEqual([
            { memberId: 'ana', amountMinor: '0', enteredAmountMinor: null, splitWeight: '2500' },
            { memberId: 'bea', amountMinor: '0', enteredAmountMinor: null, splitWeight: '7500' },
        ])

        const shares = mergeQueuedExpenses(state(), [
            item({
                body: input({
                    splitMode: 'SHARES',
                    weightedShares: [{ memberId: 'bea', weight: '3' }],
                }),
            }),
        ])
        expect(shares.expenses[0].shares).toEqual([
            { memberId: 'bea', amountMinor: '0', enteredAmountMinor: null, splitWeight: '3' },
        ])
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

describe('reviewing member roles without changing money', () => {
    it('remaps EQUAL payer and participants and refuses a duplicate target', () => {
        const original = input({ paidById: 'former-payer', participantIds: ['active-a', 'former-b'] })
        const payer = remapQueuedExpensePayer(original, 'active-c')
        const remapped = remapQueuedExpenseParticipant(payer, 'former-b', 'active-c')!

        expect(remapped).toMatchObject({ paidById: 'active-c', participantIds: ['active-a', 'active-c'] })
        expect(remapQueuedExpenseParticipant(original, 'former-b', 'active-a')).toBeNull()
    })

    it('remaps EXACT identity only and preserves every entered amount', () => {
        const original = input({
            splitMode: 'EXACT',
            exactShares: [
                { memberId: 'active-a', amountMinor: '1234' },
                { memberId: 'former-b', amountMinor: '4766' },
            ],
        })
        const remapped = remapQueuedExpenseParticipant(original, 'former-b', 'active-c')!

        expect(remapped.exactShares).toEqual([
            { memberId: 'active-a', amountMinor: '1234' },
            { memberId: 'active-c', amountMinor: '4766' },
        ])
        expect(remapped.amountMinor).toBe(original.amountMinor)
    })

    it.each([
        ['PERCENTAGE' as const, [{ memberId: 'former-b', weight: '3750' }]],
        ['SHARES' as const, [{ memberId: 'former-b', weight: '7' }]],
    ])('remaps %s identity only and preserves its original weight', (splitMode, weightedShares) => {
        const original = input({ splitMode, weightedShares })
        const remapped = remapQueuedExpenseParticipant(original, 'former-b', 'active-c')!

        expect(remapped.weightedShares).toEqual([{ memberId: 'active-c', weight: weightedShares[0].weight }])
        expect(queuedParticipantIds(remapped)).toEqual(['active-c'])
    })

    it('persists a reviewed body across restart while retaining the block and client key', () => {
        const blocked = item({
            clientKey: 'reviewed-key',
            body: input({ paidById: 'former-payer' }),
            blocked: { code: 'MEMBER_FORMER', blockedAt: Date.now() },
        })
        storage.setItem(`${PENDING_ITEM_PREFIX}${blocked.clientKey}`, JSON.stringify(blocked))
        refreshQueueSnapshot()

        expect(updateBlockedWrite(blocked.clientKey, remapQueuedExpensePayer(blocked.body, 'active-payer'))).toBe(true)
        setQueueStorage(storage)

        expect(queueSnapshot()[0]).toMatchObject({
            clientKey: 'reviewed-key',
            body: { clientKey: 'reviewed-key', paidById: 'active-payer', amountMinor: '6000' },
            blocked: { code: 'MEMBER_FORMER' },
        })
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

    it('keeps a custom currency manual rate intact for replay', () => {
        const queued = enqueueWrite({
            slug: 'ski-trip-aaa',
            endpoint: '/api/rooms/ski-trip-aaa/expenses',
            method: 'POST',
            body: input({ currency: 'BEER', amountMinor: '4', manualFxRate: '2.5' }),
        })

        expect(queued?.body.manualFxRate).toBe('2.5')
        expect(queueSnapshot()[0].body).toMatchObject({ currency: 'BEER', manualFxRate: '2.5' })
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
        setQueuePerformer(async (queued) => void sent.push((queued.body as ExpenseInput).description ?? ''))

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

    it('returns to the short backoff when a retry makes partial progress', async () => {
        const scheduled: Array<{ callback: () => void; delay: number }> = []
        vi.stubGlobal('window', {
            setTimeout: (callback: () => void, delay: number) => {
                scheduled.push({ callback, delay })
                return scheduled.length
            },
            clearTimeout: vi.fn(),
        })
        const first = enqueueWrite({
            slug: 'ski-trip-aaa',
            endpoint: '/api/rooms/ski-trip-aaa/expenses',
            method: 'POST',
            body: input({ description: 'Dinner' }),
        })!
        const second = enqueueWrite({
            slug: 'ski-trip-aaa',
            endpoint: '/api/rooms/ski-trip-aaa/expenses',
            method: 'POST',
            body: input({ description: 'Taxi' }),
        })!
        setQueuePerformer(async () => {
            throw networkError()
        })

        await drainPending()
        expect(scheduled.map((entry) => entry.delay)).toEqual([RETRY_BASE_MS])

        setQueuePerformer(async (queued) => {
            if (queued.clientKey === second.clientKey) throw networkError()
        })
        scheduled[0].callback()
        await vi.waitFor(() => expect(scheduled).toHaveLength(2))

        expect(scheduled[1].delay).toBe(RETRY_BASE_MS)
        expect(queueSnapshot().map((queued) => queued.clientKey)).toEqual([second.clientKey])
        expect(queueSnapshot().some((queued) => queued.clientKey === first.clientKey)).toBe(false)
    })

    it('drops an item the server refused and says why it disappeared', async () => {
        enqueueWrite({
            slug: 'ski-trip-aaa',
            endpoint: '/api/rooms/ski-trip-aaa/expenses',
            method: 'POST',
            body: input(),
        })
        setQueuePerformer(async () => {
            throw apiError(409, 'EXPENSE_DELETED')
        })

        await drainPending()

        expect(queueSnapshot()).toEqual([])
        expect(notices.at(-1)).toEqual({ kind: 'dropped-rejected', count: 1 })
    })

    it('persists a member-blocked draft across restart without retry spin or data loss', async () => {
        const setTimeout = vi.fn((_callback: () => void, _delay?: number) => 42)
        vi.stubGlobal('window', { setTimeout, clearTimeout: vi.fn() })
        const first = enqueueWrite({
            slug: 'ski-trip-aaa',
            endpoint: '/api/rooms/ski-trip-aaa/expenses',
            method: 'POST',
            body: input({ description: 'Dinner', amountMinor: '987654321' }),
            token: 'old-token',
        })!
        enqueueWrite({
            slug: 'ski-trip-aaa',
            endpoint: '/api/rooms/ski-trip-aaa/expenses',
            method: 'POST',
            body: input({ description: 'Later taxi' }),
        })
        const attempted: string[] = []
        setQueuePerformer(async (queued) => {
            attempted.push(queued.clientKey)
            if (queued.clientKey === first.clientKey) throw apiError(403, 'MEMBER_FORMER')
        })

        await drainPending()

        expect(attempted).toEqual([first.clientKey])
        expect(setTimeout).not.toHaveBeenCalled()
        expect(queueSnapshot()[0]).toMatchObject({
            clientKey: first.clientKey,
            token: 'old-token',
            body: { description: 'Dinner', amountMinor: '987654321' },
            blocked: { code: 'MEMBER_FORMER' },
        })
        expect(storage.getItem(`${PENDING_ITEM_PREFIX}${first.clientKey}`)).toContain('987654321')

        // A new module snapshot reads the blocked metadata and complete body
        // from storage rather than relying on this session's memory.
        setQueueStorage(storage)
        expect(queueSnapshot()[0]).toMatchObject({
            clientKey: first.clientKey,
            body: { description: 'Dinner', amountMinor: '987654321' },
            blocked: { code: 'MEMBER_FORMER' },
        })
        expect(notices.at(-1)).toEqual({ kind: 'blocked-member', count: 1 })
    })

    it('retries with the currently claimed token and clears only after success', async () => {
        const blocked = item({
            clientKey: 'blocked-token',
            token: 'rotated-away',
            blocked: { code: 'MEMBER_TOKEN_INVALID', blockedAt: Date.now() },
        })
        storage.setItem(`${PENDING_ITEM_PREFIX}${blocked.clientKey}`, JSON.stringify(blocked))
        refreshQueueSnapshot()

        expect(
            updateBlockedWrite(blocked.clientKey, remapQueuedExpensePayer(blocked.body, 'reviewed-active-payer'))
        ).toBe(true)
        expect(retryBlockedWrite(blocked.clientKey, 'current-token')).toBe(true)
        expect(queueSnapshot()[0]).toMatchObject({ clientKey: blocked.clientKey, token: 'current-token' })
        expect(queueSnapshot()[0].blocked).toBeUndefined()

        const sent: QueuedWrite[] = []
        setQueuePerformer(async (queued) => void sent.push(queued))
        await drainPending()
        expect(sent[0]).toMatchObject({
            clientKey: 'blocked-token',
            token: 'current-token',
            endpoint: '/api/rooms/ski-trip-aaa/expenses',
            slug: 'ski-trip-aaa',
            body: { clientKey: 'blocked-token', paidById: 'reviewed-active-payer', amountMinor: '6000' },
        })
        expect(queueSnapshot()).toEqual([])
    })

    it('re-blocks a reviewed target that became Former during send without changing the edited body', async () => {
        const reviewed = item({
            clientKey: 'race-review',
            token: 'current-token',
            body: input({ paidById: 'active-at-review', clientKey: 'race-review' }),
            blocked: { code: 'MEMBER_FORMER', blockedAt: Date.now() - 1 },
        })
        storage.setItem(`${PENDING_ITEM_PREFIX}${reviewed.clientKey}`, JSON.stringify(reviewed))
        refreshQueueSnapshot()
        setQueuePerformer(async () => {
            throw apiError(400, 'MEMBER_FORMER')
        })

        retryBlockedWrite(reviewed.clientKey, 'new-current-token')
        await vi.waitFor(() => expect(queueSnapshot()[0]?.blocked?.code).toBe('MEMBER_FORMER'))

        expect(queueSnapshot()[0]).toMatchObject({
            clientKey: 'race-review',
            token: 'new-current-token',
            body: { clientKey: 'race-review', paidById: 'active-at-review', amountMinor: '6000' },
            blocked: { code: 'MEMBER_FORMER' },
        })
    })

    it('sends the next same-room draft only after explicit discard removes the barrier', async () => {
        const blocked = item({
            clientKey: 'blocked-first',
            blocked: { code: 'NOT_A_MEMBER', blockedAt: Date.now() },
        })
        const later = item({ clientKey: 'later', addedAt: blocked.addedAt + 1 })
        storage.setItem(`${PENDING_ITEM_PREFIX}${blocked.clientKey}`, JSON.stringify(blocked))
        storage.setItem(`${PENDING_ITEM_PREFIX}${later.clientKey}`, JSON.stringify(later))
        refreshQueueSnapshot()
        const sent: string[] = []
        setQueuePerformer(async (queued) => void sent.push(queued.clientKey))

        expect(discardQueuedWrite(blocked.clientKey)).toBe(true)
        await vi.waitFor(() => expect(queueSnapshot()).toEqual([]))
        expect(sent).toEqual(['later'])
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
