'use client'

/**
 * The offline write queue.
 *
 * A split is written in the places with the worst connectivity anyone
 * encounters: a ski lift queue, a basement restaurant, a festival field. Today a
 * failed save is simply lost — the drawer shows "could not reach the server" and
 * whoever typed it has to remember the number.
 *
 * ONLY EXPENSE CREATES ARE QUEUEABLE. Everything else stays fail-fast, and the
 * line is money, not effort:
 *
 *   - A create replayed into a room that changed while you were offline is still
 *     the same true fact: this person paid this amount for this thing. Worst
 *     case it lands late.
 *   - An edit or a delete replayed onto an expense someone else already edited
 *     silently overwrites their change, with no conflict anywhere.
 *   - A settlement is the dangerous one. "Ana paid Bea €40" queued on a phone in
 *     a tunnel, while Ana pays Bea in cash at the table and someone records it
 *     there, is a double payment recorded as fact. Money says no.
 *
 * The queue is per device (localStorage), survives a reload and a PWA restart,
 * and is drained sequentially — never in parallel, so the room's history keeps
 * the order the person actually typed things in.
 */

import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ApiRequestError, NETWORK_ERROR_CODE } from './api'
import type { ApiExpense, ExpenseInput, RoomState } from './api-types'
import { PENDING_ID_PREFIX } from './pending'
import { TOAST_MS } from './toasts'

export const PENDING_KEY = 'ps:pending'
/** One storage key per write makes cross-tab appends atomic. The old array key
 *  remains readable for upgrades, but new writes never share one overwrite
 *  target. */
export const PENDING_ITEM_PREFIX = `${PENDING_KEY}:`

/** Web Locks is the atomic cross-tab owner where the browser supports it. The
 *  localStorage lease is a fallback for older engines; clientKey idempotency on
 *  the server remains the correctness backstop if a lease expires mid-request. */
const DRAIN_LOCK_NAME = 'peanut-split:pending-expenses'
const DRAIN_LEASE_KEY = 'ps:pending-owner'
const DRAIN_LEASE_MS = 60_000

export const RETRY_BASE_MS = 5_000
export const RETRY_MAX_MS = 5 * 60_000

/** Thirty is already a whole evening of receipts. Past that, the honest failure
 *  is to drop the oldest and say so — an unbounded queue is a localStorage quota
 *  error later, which fails silently and takes everything with it. */
export const MAX_QUEUED = 30

export interface QueuedWrite {
    /** Stable id minted at enqueue. Also what the placeholder row is keyed on, so
     *  a re-render never re-mints a row and re-triggers the list animation. */
    clientKey: string
    /** Derivable from `endpoint`, but parsing a URL back into a room is a worse
     *  way to answer "which room's screen shows this". */
    slug: string
    endpoint: string
    method: 'POST'
    body: ExpenseInput
    token: string | null
    addedAt: number
}

// ─── pure rules ─────────────────────────────────────────────────────────────

/** POST to a room's expense collection, and nothing else. See the header. */
export const isQueueable = (endpoint: string, method: string): boolean =>
    method === 'POST' && /^\/api\/rooms\/[^/]+\/expenses$/.test(endpoint)

/** Only a transport failure queues. A 4xx is the server saying the write is
 *  wrong, and retrying it in ten minutes will not make it right. */
export const isOfflineFailure = (error: unknown): boolean =>
    error instanceof ApiRequestError && (error.code === NETWORK_ERROR_CODE || error.status === 0)

/** Tolerates every shape localStorage can hand back — another tab's format, a
 *  half-written value, hand-edited JSON. A queue that throws on read would take
 *  the room screen down with it. */
export function parseQueue(raw: string | null): QueuedWrite[] {
    if (!raw) return []
    let parsed: unknown
    try {
        parsed = JSON.parse(raw)
    } catch {
        return []
    }
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isQueuedWrite)
}

function isQueuedWrite(value: unknown): value is QueuedWrite {
    if (typeof value !== 'object' || value === null) return false
    const item = value as Record<string, unknown>
    return (
        typeof item.clientKey === 'string' &&
        typeof item.slug === 'string' &&
        typeof item.endpoint === 'string' &&
        item.method === 'POST' &&
        typeof item.body === 'object' &&
        item.body !== null &&
        typeof item.addedAt === 'number' &&
        isQueueable(item.endpoint, item.method)
    )
}

/** Append under the cap. Returns whatever fell off the front so the caller can
 *  tell the user — a silent drop of somebody's dinner is not acceptable. */
export function appendQueued(
    items: readonly QueuedWrite[],
    item: QueuedWrite
): { items: QueuedWrite[]; dropped: QueuedWrite[] } {
    const next = [...items, item]
    const overflow = Math.max(0, next.length - MAX_QUEUED)
    return { items: next.slice(overflow), dropped: next.slice(0, overflow) }
}

export type DrainVerdict = 'drop' | 'stop'

/**
 * What to do with an item the server refused.
 *
 * 4xx (except 429) → drop: the room moved on. The member was removed, the room
 * was archived, the payload no longer validates. Replaying it forever would mean
 * a permanently stuck queue and a placeholder row that never resolves.
 *
 * 429, 5xx, transport failure → keep and stop draining: nothing about the write
 * is wrong, the other end is just unavailable. Dropping a real expense because
 * the rate limiter said "slow down" would be the queue destroying the exact data
 * it exists to protect.
 */
export function verdictFor(error: unknown): DrainVerdict {
    if (error instanceof ApiRequestError) {
        if (error.status === 429) return 'stop'
        if (error.status >= 400 && error.status < 500) return 'drop'
    }
    return 'stop'
}

export interface DrainSummary {
    /** What is still queued, in order. */
    remaining: QueuedWrite[]
    sent: QueuedWrite[]
    /** Refused by the server and given up on. */
    dropped: QueuedWrite[]
}

/**
 * Replay in order, one at a time, each item exactly once per drain.
 *
 * Sequential rather than parallel for two reasons: the writes are rate-limited
 * per IP, and a room's expense list reads better when it lands in the order it
 * was typed. The first "stop" verdict ends the drain with everything after it
 * untouched — a queue that keeps hammering while offline is a battery bug.
 */
export async function drainQueue(
    items: readonly QueuedWrite[],
    perform: (item: QueuedWrite) => Promise<unknown>
): Promise<DrainSummary> {
    const sent: QueuedWrite[] = []
    const dropped: QueuedWrite[] = []

    for (let i = 0; i < items.length; i++) {
        const item = items[i]
        try {
            await perform(item)
            sent.push(item)
        } catch (error) {
            if (verdictFor(error) === 'drop') {
                dropped.push(item)
                continue
            }
            return { remaining: items.slice(i), sent, dropped }
        }
    }

    return { remaining: [], sent, dropped }
}

/**
 * The queued rows, merged into a RoomState for display only.
 *
 * Balances, shares and totals are left exactly as the server sent them: a queued
 * expense has not happened yet, and moving the sheet for it would be the one
 * thing this whole app promises not to do. The row is the same `pending-…` shape
 * the optimistic add already produces, so the list renders it dimmed and
 * untappable without knowing the queue exists.
 */
export function mergeQueuedExpenses(state: RoomState, queued: readonly QueuedWrite[]): RoomState {
    if (queued.length === 0) return state
    const savedIds = new Set(
        state.expenses.filter((expense) => !expense.id.startsWith(PENDING_ID_PREFIX)).map((expense) => expense.id)
    )
    const waiting = queued.filter((item) => !savedIds.has(item.clientKey))
    const queuedIds = new Set(queued.map((item) => queuedExpenseId(item.clientKey)))
    const rows = waiting.map((item) =>
        draftExpenseRow(item.body, {
            id: queuedExpenseId(item.clientKey),
            at: item.addedAt,
            members: state.members,
        })
    )
    // Replace only this queue's optimistic rows. Another save may still be in flight, and stripping
    // every `pending-…` row would make that unrelated expense disappear. A replay response can
    // arrive while its storage record still exists; in that brief overlap the authoritative id is
    // the client key, so `waiting` suppresses the stale queued placeholder as well.
    return { ...state, expenses: [...rows, ...state.expenses.filter((expense) => !queuedIds.has(expense.id))] }
}

/** `pending-<clientKey>` — the prefix the expense list already treats as "not
 *  saved yet", the suffix so a row keeps its identity across renders. */
export const queuedExpenseId = (clientKey: string): string => `${PENDING_ID_PREFIX}${clientKey}`

/**
 * The row a not-yet-saved expense renders as — the one shape, for both paths
 * that need one.
 *
 * There are exactly two: the optimistic add (`queries.ts`, in flight) and the
 * offline queue (below, waiting for signal). They produce the same fourteen
 * fields for the same reason, and they were two hand-written copies until a
 * change to one of them had to be applied to the other by hand.
 *
 * `at` is when the row was made — the queue passes the enqueue time so a row
 * that has been waiting an hour still says so.
 */
export function draftExpenseRow(
    input: ExpenseInput,
    context: { id: string; at: number; members: readonly { id: string }[] }
): ApiExpense {
    const participants =
        input.splitMode === 'EXACT'
            ? (input.exactShares ?? []).map((share) => share.memberId)
            : input.splitMode === 'PERCENTAGE' || input.splitMode === 'SHARES'
              ? (input.weightedShares ?? []).map((share) => share.memberId)
              : (input.participantIds ?? context.members.map((member) => member.id))
    const splitWeights = new Map((input.weightedShares ?? []).map((share) => [share.memberId, share.weight]))

    return {
        id: context.id,
        description: input.description ?? '',
        amountMinor: input.amountMinor,
        currency: input.currency,
        // No FX applied yet — the row shows the entered amount and no conversion
        // line, because the server is the only thing that knows the rate.
        baseAmountMinor: input.amountMinor,
        fxRate: '1',
        splitMode: input.splitMode,
        paidById: input.paidById ?? '',
        createdById: null,
        date: input.date ?? new Date(context.at).toISOString(),
        category: input.category ?? null,
        createdAt: new Date(context.at).toISOString(),
        // Shares are zeroed, not guessed: a draft moves no money, and the
        // authoritative RoomState brings the real split back in one commit.
        shares: participants.map((memberId) => ({
            memberId,
            amountMinor: '0',
            enteredAmountMinor: null,
            splitWeight: splitWeights.get(memberId) ?? null,
        })),
        // Nobody can react to an expense that has not reached the server yet.
        reactions: [],
    }
}

/** True for a row this module put on screen, as opposed to an in-flight
 *  optimistic one — both wear the `pending-` prefix, and only one of them is
 *  going to sit there until the signal comes back, which is what earns it the
 *  explanatory line the list renders. */
export const isQueuedExpenseId = (expenseId: string, queued: readonly QueuedWrite[]): boolean =>
    queued.some((item) => queuedExpenseId(item.clientKey) === expenseId)

// ─── storage ────────────────────────────────────────────────────────────────

let storageOverride: Storage | null = null

/** Test seam. The queue's rules are pure; this is the one line of state they sit
 *  on, and a node test has no localStorage. */
export function setQueueStorage(storage: Storage | null): void {
    storageOverride = storage
    snapshot = null
    notifyChanged()
}

const storage = (): Storage | null => {
    if (storageOverride) return storageOverride
    try {
        if (typeof window === 'undefined') return null
        return window.localStorage ?? null
    } catch {
        // Safari in lockdown / private mode throws on access, not on use.
        return null
    }
}

/**
 * Cached because `useSyncExternalStore` compares snapshots by identity: parsing
 * localStorage afresh on every render would return a new array every time and
 * spin React forever.
 */
let snapshot: QueuedWrite[] | null = null

export function queueSnapshot(): QueuedWrite[] {
    if (snapshot) return snapshot
    const store = storage()
    if (!store) {
        snapshot = []
        return snapshot
    }
    try {
        snapshot = readStoredQueue(store)
    } catch {
        snapshot = []
    }
    return snapshot
}

function readStoredQueue(store: Storage): QueuedWrite[] {
    const byKey = new Map(parseQueue(store.getItem(PENDING_KEY)).map((item) => [item.clientKey, item]))
    for (let index = 0; index < store.length; index++) {
        const key = store.key(index)
        if (!key?.startsWith(PENDING_ITEM_PREFIX)) continue
        const raw = store.getItem(key)
        const parsed = parseQueue(raw === null ? null : `[${raw}]`)[0]
        if (parsed) byKey.set(parsed.clientKey, parsed)
    }
    return [...byKey.values()].sort((a, b) => a.addedAt - b.addedAt || a.clientKey.localeCompare(b.clientKey))
}

function persistQueuedItem(item: QueuedWrite): { items: QueuedWrite[]; dropped: QueuedWrite[] } {
    const store = storage()
    if (!store) return appendQueued(snapshot ?? [], item)
    try {
        // Migrate legacy array records first. Independent item keys mean another
        // tab can append between any two operations without either tab replacing
        // the other's whole queue.
        for (const queued of readStoredQueue(store)) {
            store.setItem(`${PENDING_ITEM_PREFIX}${queued.clientKey}`, JSON.stringify(queued))
        }
        store.setItem(`${PENDING_ITEM_PREFIX}${item.clientKey}`, JSON.stringify(item))
        store.removeItem(PENDING_KEY)

        const all = readStoredQueue(store)
        const overflow = Math.max(0, all.length - MAX_QUEUED)
        const dropped = all.slice(0, overflow)
        for (const queued of dropped) store.removeItem(`${PENDING_ITEM_PREFIX}${queued.clientKey}`)
        return { items: all.slice(overflow), dropped }
    } catch {
        // Quota, or a private-mode Storage that accepts reads and refuses
        // writes. The in-memory snapshot still drains this session.
        return appendQueued(snapshot ?? [], item)
    }
}

function removeQueuedItems(items: readonly QueuedWrite[]): QueuedWrite[] {
    const removed = new Set(items.map((item) => item.clientKey))
    const store = storage()
    if (!store) return (snapshot ?? []).filter((item) => !removed.has(item.clientKey))
    try {
        for (const key of removed) store.removeItem(`${PENDING_ITEM_PREFIX}${key}`)
        const legacy = parseQueue(store.getItem(PENDING_KEY)).filter((item) => !removed.has(item.clientKey))
        if (legacy.length === 0) store.removeItem(PENDING_KEY)
        else store.setItem(PENDING_KEY, JSON.stringify(legacy))
        return readStoredQueue(store)
    } catch {
        return (snapshot ?? []).filter((item) => !removed.has(item.clientKey))
    }
}

/** Refresh after another tab changes one of the per-write storage keys. With no
 *  readable storage (private mode), preserve the in-memory queue rather than
 *  erasing the only copy. */
export function refreshQueueSnapshot(): void {
    const store = storage()
    if (store) {
        try {
            snapshot = readStoredQueue(store)
        } catch {
            // Keep the last in-memory snapshot.
        }
    }
    notifyChanged()
}

// ─── change + notice subscriptions ──────────────────────────────────────────

const changeListeners = new Set<() => void>()

export function subscribeToQueue(listener: () => void): () => void {
    changeListeners.add(listener)
    return () => changeListeners.delete(listener)
}

const notifyChanged = (): void => {
    for (const listener of changeListeners) listener()
}

/**
 * Things the user has to be told, emitted rather than toasted here: this module
 * has no locale and no toast host, and giving it either would drag next-intl and
 * sonner into every import of the queue's pure rules.
 */
export type QueueNotice =
    | { kind: 'queued' }
    | { kind: 'dropped-full'; count: number }
    | { kind: 'dropped-rejected'; count: number }
    | { kind: 'sent'; count: number }

const noticeListeners = new Set<(notice: QueueNotice) => void>()

export function subscribeToQueueNotices(listener: (notice: QueueNotice) => void): () => void {
    noticeListeners.add(listener)
    return () => noticeListeners.delete(listener)
}

const notify = (notice: QueueNotice): void => {
    for (const listener of noticeListeners) listener(notice)
}

// ─── the queue itself ───────────────────────────────────────────────────────

export const createClientKey = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
    return `k-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

/**
 * Take responsibility for a write the network refused. Returns the queued record
 * so the caller can tell the difference between "held" and "throw it at the
 * user", or null when this write is not one of the queueable kinds.
 */
export function enqueueWrite(input: {
    slug: string
    endpoint: string
    method: string
    body: ExpenseInput
    token?: string | null
}): QueuedWrite | null {
    if (!isQueueable(input.endpoint, input.method)) return null

    const store = storage()
    const current = (() => {
        if (!store) return queueSnapshot()
        try {
            return readStoredQueue(store)
        } catch {
            return queueSnapshot()
        }
    })()
    snapshot = current
    const clientKey = input.body.clientKey ?? createClientKey()
    const item: QueuedWrite = {
        clientKey,
        slug: input.slug,
        endpoint: input.endpoint,
        method: 'POST',
        // Keep the key inside the request too. The outer copy keys the local row;
        // the body copy is what makes the server recognize a replay after the
        // first response was lost.
        body: { ...input.body, clientKey },
        token: input.token ?? null,
        // Millisecond clocks tie under two quick saves. Preserve this tab's
        // actual enqueue order; other tabs use the key as a deterministic
        // tiebreaker when their clocks genuinely tie.
        addedAt: Math.max(Date.now(), (current.at(-1)?.addedAt ?? 0) + 1),
    }

    const { items, dropped } = persistQueuedItem(item)
    snapshot = items
    notifyChanged()
    notify({ kind: 'queued' })
    if (dropped.length > 0) notify({ kind: 'dropped-full', count: dropped.length })
    return item
}

/**
 * How a queued write is actually sent. Registered by `queries.ts` rather than
 * imported, because performing one means seeding the room cache with the
 * RoomState that comes back — and the queue must not depend on react-query to
 * hold a list of JSON bodies.
 */
export type QueuePerformer = (item: QueuedWrite) => Promise<unknown>

let performer: QueuePerformer | null = null
let retryTimer: number | null = null
let retryAttempt = 0

/** Exponential retry with a hard five-minute ceiling. */
export const queueRetryDelay = (attempt: number): number =>
    Math.min(RETRY_BASE_MS * 2 ** Math.max(0, attempt), RETRY_MAX_MS)

const cancelRetry = (): void => {
    if (retryTimer !== null && typeof window !== 'undefined') window.clearTimeout(retryTimer)
    retryTimer = null
    retryAttempt = 0
}

const scheduleRetry = (): void => {
    if (retryTimer !== null || typeof window === 'undefined') return
    const delay = queueRetryDelay(retryAttempt)
    retryAttempt += 1
    retryTimer = window.setTimeout(() => {
        retryTimer = null
        requestDrain()
    }, delay)
}

export function setQueuePerformer(next: QueuePerformer | null): void {
    performer = next
    if (!next) cancelRetry()
}

let draining = false

interface DrainLease {
    ownerId: string
    nonce: string
    expiresAt: number
}

type Ownership<T> = { acquired: true; value: T } | { acquired: false }

let ownerId: string | null = null
const queueOwnerId = (): string => {
    ownerId ??= createClientKey()
    return ownerId
}

const parseLease = (raw: string | null): DrainLease | null => {
    if (!raw) return null
    try {
        const parsed = JSON.parse(raw) as Partial<DrainLease>
        if (
            typeof parsed.ownerId === 'string' &&
            typeof parsed.nonce === 'string' &&
            typeof parsed.expiresAt === 'number'
        ) {
            return parsed as DrainLease
        }
    } catch {
        // A malformed lease is an expired lease.
    }
    return null
}

async function withStorageLease<T>(run: () => Promise<T>): Promise<Ownership<T>> {
    const store = storage()
    if (!store) return { acquired: true, value: await run() }

    const mine = queueOwnerId()
    const now = Date.now()
    let lease: DrainLease
    try {
        const current = parseLease(store.getItem(DRAIN_LEASE_KEY))
        if (current && current.ownerId !== mine && current.expiresAt > now) return { acquired: false }

        lease = {
            ownerId: mine,
            nonce: createClientKey(),
            expiresAt: now + DRAIN_LEASE_MS,
        }
        store.setItem(DRAIN_LEASE_KEY, JSON.stringify(lease))
        if (parseLease(store.getItem(DRAIN_LEASE_KEY))?.nonce !== lease.nonce) return { acquired: false }
    } catch {
        // If storage itself is unavailable, the tabs cannot share a queue
        // either. The in-tab guard is sufficient for the in-memory fallback.
        return { acquired: true, value: await run() }
    }

    // Keep the callback outside the storage catch. A callback failure belongs to
    // the drain and must propagate once; treating it as a lease failure would
    // execute the same write sequence a second time.
    try {
        return { acquired: true, value: await run() }
    } finally {
        try {
            if (parseLease(store.getItem(DRAIN_LEASE_KEY))?.nonce === lease.nonce) {
                store.removeItem(DRAIN_LEASE_KEY)
            }
        } catch {
            // Losing storage during cleanup only lets this lease expire
            // naturally. It must never replace the callback's result or error.
        }
    }
}

async function withDrainOwnership<T>(run: () => Promise<T>): Promise<Ownership<T>> {
    if (typeof navigator !== 'undefined' && navigator.locks) {
        return navigator.locks.request(DRAIN_LOCK_NAME, { ifAvailable: true }, async (lock) =>
            lock ? { acquired: true, value: await run() } : { acquired: false }
        )
    }
    return withStorageLease(run)
}

/**
 * Drain now. Safe to call from anywhere and as often as you like: it is a no-op
 * with an empty queue, no performer registered, or a drain already in flight.
 * The re-entrancy guard matters — every successful mutation asks for a drain,
 * and a drain's own successes are mutations.
 */
export async function drainPending(): Promise<DrainSummary | null> {
    if (draining || !performer) return null

    draining = true
    try {
        const owned = await withDrainOwnership(async () => {
            // The provider can unmount between requesting and receiving the
            // cross-tab lock. Do not call through a performer it just removed.
            const activePerformer = performer
            if (!activePerformer) return null

            refreshQueueSnapshot()
            const items = queueSnapshot()
            if (items.length === 0) {
                cancelRetry()
                return null
            }

            const summary = await drainQueue(items, activePerformer)
            // Remove only writes this drain actually sent or rejected. Every
            // record has its own storage key, so another tab can append while a
            // network request is in flight without sharing an overwrite target.
            snapshot = removeQueuedItems([...summary.sent, ...summary.dropped])
            notifyChanged()
            // Any forward progress means the connection is not in the same
            // failure streak. Give the first retained item the short retry
            // again instead of inheriting a five-minute delay from an older one.
            if (summary.sent.length > 0 || summary.dropped.length > 0) retryAttempt = 0
            if (snapshot.length > 0) scheduleRetry()
            else cancelRetry()
            if (summary.sent.length > 0) notify({ kind: 'sent', count: summary.sent.length })
            if (summary.dropped.length > 0) notify({ kind: 'dropped-rejected', count: summary.dropped.length })
            return summary
        })
        if (!owned.acquired) {
            // Another tab owns this pass. Try later in case that tab closes
            // before it drains; if it succeeds, its storage removals cancel the
            // practical need for this timer.
            scheduleRetry()
            return null
        }
        return owned.value
    } finally {
        draining = false
    }
}

/** Fire-and-forget drain for call sites that are not async (a mutation's
 *  `onSuccess`, an event listener). */
export const requestDrain = (): void => {
    void drainPending().catch((err) => console.warn('[split] queue drain failed', err))
}

// ─── react ──────────────────────────────────────────────────────────────────

/** The server snapshot is `[]`: nothing is queued on a device the server has
 *  never met, and rendering a placeholder into the HTML would hydrate wrong. */
const SERVER_SNAPSHOT: QueuedWrite[] = []

/** What is still waiting to be sent for this room, oldest first. */
export function useQueuedWrites(slug: string): QueuedWrite[] {
    const all = useSyncExternalStore(subscribeToQueue, queueSnapshot, () => SERVER_SNAPSHOT)
    return useMemo(() => {
        const mine = all.filter((item) => item.slug === slug)
        // Identity matters downstream (it feeds a react-query `select`), so an
        // empty result is always the same empty array.
        return mine.length === 0 ? SERVER_SNAPSHOT : mine
    }, [all, slug])
}

/**
 * Turns queue notices into toasts, in the reader's language. Mounted once, at
 * the root — a queued expense is worth exactly one toast, not one per screen
 * that happens to be interested in the queue.
 */
export function useQueueNotices(): void {
    const t = useTranslations('offline')

    useEffect(() => {
        return subscribeToQueueNotices((notice) => {
            switch (notice.kind) {
                case 'queued':
                    // The state toast, not the default one: nothing on screen
                    // says "this is not saved yet" except the row's own label.
                    toast(t('queuedToast'), { duration: TOAST_MS.state })
                    return
                case 'dropped-full':
                    toast.error(t('fullToast', { count: notice.count }), { duration: TOAST_MS.actionable })
                    return
                case 'dropped-rejected':
                    // "Add it again" is an instruction — it has to outlive the
                    // moment of reading it.
                    toast.error(t('rejectedToast', { count: notice.count }), { duration: TOAST_MS.actionable })
                    return
                case 'sent':
                    toast.success(t('sentToast', { count: notice.count }), { duration: TOAST_MS.state })
            }
        })
    }, [t])
}
