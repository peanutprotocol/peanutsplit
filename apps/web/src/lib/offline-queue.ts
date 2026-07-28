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
import { TOAST_MS } from './toasts'

export const PENDING_KEY = 'ps:pending'

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
    const rows = queued.map((item) => queuedExpenseRow(item, state))
    return { ...state, expenses: [...rows, ...state.expenses] }
}

/** `pending-<clientKey>` — the prefix the expense list already treats as "not
 *  saved yet", the suffix so a row keeps its identity across renders. */
export const queuedExpenseId = (clientKey: string): string => `pending-${clientKey}`

/**
 * True for a row this module put on screen, as opposed to an in-flight
 * optimistic one — both wear the `pending-` prefix, and only one of them is
 * going to sit there until the signal comes back.
 *
 * WIRING LEFT FOR THE LIST'S OWNER (ExpenseList.tsx is not this branch's to
 * touch): the row already renders dimmed and untappable for anything
 * `pending-…`. What is missing is the sentence that says why. In ExpenseList:
 *
 *     const queued = useQueuedWrites(slug)   // slug is on state.room.slug
 *     … isQueuedExpenseId(expense.id, queued) && <span>{t('offline.rowHint')}</span>
 *
 * `offline.rowLabel` (short, for a badge) and `offline.rowHint` (the full
 * sentence) are already in all three catalogs.
 */
export const isQueuedExpenseId = (expenseId: string, queued: readonly QueuedWrite[]): boolean =>
    queued.some((item) => queuedExpenseId(item.clientKey) === expenseId)

function queuedExpenseRow(item: QueuedWrite, state: RoomState): ApiExpense {
    const input = item.body
    const participants =
        input.splitMode === 'EXACT'
            ? (input.exactShares ?? []).map((share) => share.memberId)
            : (input.participantIds ?? state.members.map((member) => member.id))

    return {
        id: queuedExpenseId(item.clientKey),
        description: input.description,
        amountMinor: input.amountMinor,
        currency: input.currency,
        // No FX has been applied — the row shows the entered amount and no
        // conversion line, exactly like the optimistic path.
        baseAmountMinor: input.amountMinor,
        fxRate: '1',
        splitMode: input.splitMode,
        paidById: input.paidById,
        createdById: null,
        date: input.date ?? new Date(item.addedAt).toISOString(),
        category: input.category ?? null,
        createdAt: new Date(item.addedAt).toISOString(),
        // Nobody can react to an expense that has not reached the server yet.
        reactions: [],
        shares: participants.map((memberId) => ({ memberId, amountMinor: '0', enteredAmountMinor: null })),
    }
}

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
        snapshot = parseQueue(store.getItem(PENDING_KEY))
    } catch {
        snapshot = []
    }
    return snapshot
}

function writeQueue(items: QueuedWrite[]): void {
    snapshot = items
    const store = storage()
    if (store) {
        try {
            if (items.length === 0) store.removeItem(PENDING_KEY)
            else store.setItem(PENDING_KEY, JSON.stringify(items))
        } catch {
            // Quota, or a private-mode Storage that accepts reads and refuses
            // writes. The in-memory snapshot still drains this session.
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

const newClientKey = (): string => {
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

    const item: QueuedWrite = {
        clientKey: newClientKey(),
        slug: input.slug,
        endpoint: input.endpoint,
        method: 'POST',
        body: input.body,
        token: input.token ?? null,
        addedAt: Date.now(),
    }

    const { items, dropped } = appendQueued(queueSnapshot(), item)
    writeQueue(items)
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

export function setQueuePerformer(next: QueuePerformer | null): void {
    performer = next
}

let draining = false

/**
 * Drain now. Safe to call from anywhere and as often as you like: it is a no-op
 * with an empty queue, no performer registered, or a drain already in flight.
 * The re-entrancy guard matters — every successful mutation asks for a drain,
 * and a drain's own successes are mutations.
 */
export async function drainPending(): Promise<DrainSummary | null> {
    if (draining || !performer) return null
    const items = queueSnapshot()
    if (items.length === 0) return null

    draining = true
    try {
        const summary = await drainQueue(items, performer)
        writeQueue(summary.remaining)
        if (summary.sent.length > 0) notify({ kind: 'sent', count: summary.sent.length })
        if (summary.dropped.length > 0) notify({ kind: 'dropped-rejected', count: summary.dropped.length })
        return summary
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
