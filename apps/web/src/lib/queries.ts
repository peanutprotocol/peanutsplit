'use client'

import { useCallback, useEffect } from 'react'
import {
    useMutation,
    useQuery,
    useQueryClient,
    type QueryClient,
    type UseMutationOptions,
    type UseMutationResult,
} from '@tanstack/react-query'
import { api, expensesPath } from './api'
import type {
    ApiReaction,
    CreateRoomInput,
    CurrencyInfo,
    ExpenseInput,
    ImportRoomInput,
    RoomState,
    RoomStateWithMember,
    SettlementInput,
} from './api-types'
import { FALLBACK_CURRENCIES } from './money'
import {
    draftExpenseRow,
    enqueueWrite,
    isOfflineFailure,
    mergeQueuedExpenses,
    requestDrain,
    setQueuePerformer,
    useQueuedWrites,
    useQueueNotices,
} from './offline-queue'
import { PENDING_ID_PREFIX, savedExpenses } from './pending'
import { useRoomEvents } from './realtime'

export const roomKey = (slug: string) => ['room', slug] as const
export const currenciesKey = ['currencies'] as const

/** Every mutation returns the full RoomState, so the cache is seeded in one hop
 *  and no screen ever derives money client-side. */
const seed = (queryClient: QueryClient, slug: string, state: RoomState) => {
    queryClient.setQueryData(roomKey(slug), state)
    // A write that reached the server is the only proof of connectivity worth
    // acting on: `navigator.onLine` lies on captive portals and flaky mobile
    // data. So every success is also a chance to flush whatever the queue is
    // still holding. No-op when it is empty.
    requestDrain()
}

/**
 * How often the room is polled while the event stream is OPEN.
 *
 * NOT zero, and not "off". A socket's state is not evidence that its frames are
 * arriving: a proxy can hold a stream open and swallow everything on it, a
 * container can be replaced mid-write and lose the poke, and a phone waking up
 * reports OPEN on a socket the OS already killed. Polling stays on as the thing
 * that guarantees a room cannot sit silently wrong — it just stops being the
 * mechanism and becomes the floor.
 */
export const LIVE_POLL_MS = 45_000

/** With no stream, this is the mechanism again — the pre-SSE cadence, unchanged. */
export const FALLBACK_POLL_MS = 8_000

/**
 * A room fetch that cannot hang forever.
 *
 * The wake-from-sleep case is the reason: a request issued on a socket the OS
 * quietly killed while the phone was in a pocket never resolves and never
 * rejects, so the query sits in `fetching` and the screen shows stale money with
 * a spinner that spins until the tab is closed. The timeout turns that into an
 * ordinary failed fetch, which retries.
 */
export const ROOM_FETCH_TIMEOUT_MS = 8_000

const withTimeout = (signal: AbortSignal | undefined, ms: number): AbortSignal | undefined => {
    // `AbortSignal.any` is recent (iOS 17.4). Without it the query keeps
    // react-query's own signal and behaves exactly as it did before.
    if (typeof AbortSignal === 'undefined' || typeof AbortSignal.any !== 'function') return signal
    const timeout = AbortSignal.timeout(ms)
    return signal ? AbortSignal.any([signal, timeout]) : timeout
}

/** Static catalog. Seeded from the bundled table so first paint can format money. */
export function useCurrencies() {
    return useQuery({
        queryKey: currenciesKey,
        queryFn: ({ signal }) => api.currencies(signal),
        staleTime: 24 * 60 * 60 * 1000,
        initialData: FALLBACK_CURRENCIES as CurrencyInfo[],
    })
}

/**
 * THE room query. Someone else adding an expense on their phone should land on
 * yours without a refresh.
 *
 * Two mechanisms, in order of preference:
 *
 *  1. the room's event stream — the server pokes, this refetches, and the room
 *     updates in about the time the request takes;
 *  2. polling, which never goes away. It stretches to 45s while the stream is
 *     open and snaps back to 8s the moment it is not.
 *
 * Anything still queued on this device is merged in for display only, so an
 * expense saved offline stays visible (labelled, dimmed, not tappable) instead
 * of vanishing on the next successful refetch.
 */
export function useRoomState(slug: string) {
    const queryClient = useQueryClient()
    const queued = useQueuedWrites(slug)

    const onPoke = useCallback(() => {
        // Refetch, not a hand-built patch: the poke carries no payload and the
        // GET is the only thing allowed to say what the balances are.
        void queryClient.refetchQueries({ queryKey: roomKey(slug) })
    }, [queryClient, slug])

    const { connected } = useRoomEvents(slug, onPoke)

    const select = useCallback((state: RoomState) => mergeQueuedExpenses(state, queued), [queued])

    return useQuery({
        queryKey: roomKey(slug),
        queryFn: ({ signal }) => api.room(slug, withTimeout(signal, ROOM_FETCH_TIMEOUT_MS)),
        select,
        refetchInterval: connected ? LIVE_POLL_MS : FALLBACK_POLL_MS,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
            // A 404 is a real answer ("this split doesn't exist"), not a blip.
            const status = (error as { status?: number }).status
            if (status === 404) return false
            return failureCount < 2
        },
    })
}

/**
 * Boot the offline queue: how to send a held write, when to try, and how the
 * user hears about it. Mounted once, inside the QueryClientProvider.
 */
export function useOfflineQueueRunner(): void {
    const queryClient = useQueryClient()
    useQueueNotices()

    useEffect(() => {
        // A replayed write returns the same full RoomState a live one does, so
        // it seeds the cache through exactly the same path — the queue is a
        // delay in front of the write, never a second way to compute a room.
        setQueuePerformer(async (item) => {
            const state = await api.replayWrite(item)
            seed(queryClient, item.slug, state)
        })

        // Two triggers, because neither is reliable alone: `online` fires on a
        // laptop that rejoined wifi but not on a phone that regained signal
        // without ever having been "offline", and a cold boot covers the app
        // being killed while something was still queued.
        requestDrain()
        window.addEventListener('online', requestDrain)
        return () => {
            window.removeEventListener('online', requestDrain)
            setQueuePerformer(null)
        }
    }, [queryClient])
}

export function useCreateRoom(): UseMutationResult<RoomStateWithMember, Error, CreateRoomInput> {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: CreateRoomInput) => api.createRoom(input),
        onSuccess: (state) => seed(queryClient, state.room.slug, state),
    })
}

export function useJoinRoom(slug: string): UseMutationResult<RoomStateWithMember, Error, { name: string }> {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: { name: string }) => api.joinRoom(slug, input),
        onSuccess: (state) => seed(queryClient, slug, state),
    })
}

/** What `onMutate` hands `onError` so a failed add can be rolled back. */
interface AddExpenseContext {
    previous?: RoomState
}

/**
 * The cached room with any in-flight optimistic rows stripped out.
 *
 * Used as the resolved value when a write goes to the queue: handing back the
 * cache as-is would leave the `pending-…` placeholder from `onMutate` seeded
 * permanently, and it would then sit next to the queue's own row for the same
 * expense.
 */
const authoritativeState = (queryClient: QueryClient, slug: string): RoomState | undefined => {
    const cached = queryClient.getQueryData<RoomState>(roomKey(slug))
    if (!cached) return undefined
    return { ...cached, expenses: savedExpenses(cached.expenses) }
}

/**
 * Optimistic add: the row appears the instant you hit save, flagged pending, and
 * the authoritative RoomState (with real shares and balances) replaces it on
 * response. On failure the snapshot goes back — no ghost expense.
 *
 * Exported as options rather than only as a hook so the seeding contract is
 * testable without a renderer.
 */
export function addExpenseMutationOptions(
    queryClient: QueryClient,
    slug: string,
    token?: string | null
): UseMutationOptions<RoomState, Error, ExpenseInput, AddExpenseContext> {
    return {
        /**
         * The one write that survives having no network. On a transport failure
         * the expense goes into the device queue and this RESOLVES with the
         * unchanged room.
         *
         * Resolving a failed request is a deliberate call, and it is not a lie
         * about money: no balance moved, the row stays on screen marked as
         * waiting to send, and a toast says so. The alternative — rejecting —
         * makes the drawer show an error and throw away what the user typed,
         * which is how the amount actually gets lost. Everything not queueable
         * (edits, deletes, settlements) still rejects; see offline-queue.ts.
         */
        mutationFn: async (input: ExpenseInput): Promise<RoomState> => {
            try {
                return await api.addExpense(slug, input, token)
            } catch (error) {
                if (!isOfflineFailure(error)) throw error
                // No cached room to hand back (a save before the first GET
                // landed) — there is nothing honest to resolve with.
                const authoritative = authoritativeState(queryClient, slug)
                if (!authoritative) throw error
                const queued = enqueueWrite({
                    slug,
                    endpoint: expensesPath(slug),
                    method: 'POST',
                    body: input,
                    token,
                })
                if (!queued) throw error
                return authoritative
            }
        },
        onMutate: async (input: ExpenseInput) => {
            await queryClient.cancelQueries({ queryKey: roomKey(slug) })
            const previous = queryClient.getQueryData<RoomState>(roomKey(slug))
            if (previous) {
                const now = Date.now()
                queryClient.setQueryData<RoomState>(roomKey(slug), {
                    ...previous,
                    expenses: [
                        // The same row the offline queue paints, built by the
                        // same function — an in-flight write and a held one look
                        // identical to the list, and only one shape may exist.
                        draftExpenseRow(input, {
                            id: `${PENDING_ID_PREFIX}${now}`,
                            at: now,
                            members: previous.members,
                        }),
                        ...previous.expenses,
                    ],
                })
            }
            return { previous }
        },
        onError: (_error, _input, context) => {
            if (context?.previous) queryClient.setQueryData(roomKey(slug), context.previous)
        },
        onSuccess: (state) => seed(queryClient, slug, state),
    }
}

export function useAddExpense(slug: string, token?: string | null) {
    const queryClient = useQueryClient()
    return useMutation(addExpenseMutationOptions(queryClient, slug, token))
}

export function useUpdateExpense(slug: string, token?: string | null) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: ExpenseInput }) => api.updateExpense(slug, id, input, token),
        onSuccess: (state) => seed(queryClient, slug, state),
    })
}

export function useDeleteExpense(slug: string, token?: string | null) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.deleteExpense(slug, id, token),
        onSuccess: (state) => seed(queryClient, slug, state),
    })
}

export function useRestoreExpense(slug: string, token?: string | null) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.restoreExpense(id, token),
        onSuccess: (state) => seed(queryClient, slug, state),
    })
}

export function useAddSettlement(slug: string, token?: string | null) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: SettlementInput) => api.addSettlement(slug, input, token),
        onSuccess: (state) => seed(queryClient, slug, state),
    })
}

export function useDeleteSettlement(slug: string, token?: string | null) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.deleteSettlement(slug, id, token),
        onSuccess: (state) => seed(queryClient, slug, state),
    })
}

/**
 * Whether this deployment can read a bill photo or a typed line. One server
 * capability behind both, so it is asked once rather than compiled in — see
 * `api.modelStatus`.
 *
 * Cached for the session and never retried: a failed probe means "no model
 * features right now", and a button that flickers into existence on a background
 * refetch is worse than one that stays hidden until the next page load.
 *
 * The key carries no slug, because the answer does not depend on one — the route
 * reads an env var and ignores the room entirely. Keying per room meant probing
 * once per room a device opened, for a fact that is the same every time.
 *
 * `resolved` is why this returns a pair rather than a boolean: the drawer has to
 * tell "no, this deployment has no model" apart from "not back yet", or the row
 * of shortcuts materialises a beat after the sheet opens and shoves the whole
 * form down under the thumb already reaching for it.
 */
export function useModelStatus(slug: string): { enabled: boolean; resolved: boolean } {
    const { data, isPending } = useQuery({
        queryKey: ['model-enabled'] as const,
        queryFn: ({ signal }) => api.modelStatus(slug, signal),
        staleTime: 60 * 60 * 1000,
        retry: false,
        refetchOnWindowFocus: false,
    })
    return { enabled: data?.enabled ?? false, resolved: !isPending }
}

// ── delight wave ─────────────────────────────────────────────────────────────

/**
 * Repainting the room has to be instant: the whole point of a palette is that
 * you flick through them, and a 300ms round trip per swatch turns browsing into
 * waiting. So the cache takes the new key on the tap and the authoritative state
 * replaces it on response, with the snapshot going back on failure.
 */
export function useSetTheme(slug: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (theme: string | null) => api.setTheme(slug, theme),
        onMutate: async (theme) => {
            await queryClient.cancelQueries({ queryKey: roomKey(slug) })
            const previous = queryClient.getQueryData<RoomState>(roomKey(slug))
            if (previous) {
                queryClient.setQueryData<RoomState>(roomKey(slug), {
                    ...previous,
                    room: { ...previous.room, theme },
                })
            }
            return { previous }
        },
        onError: (_error, _theme, context) => {
            if (context?.previous) queryClient.setQueryData(roomKey(slug), context.previous)
        },
        onSuccess: (state) => seed(queryClient, slug, state),
    })
}

/** Both reaction mutations edit the same one place in the cache. Kept as a
 *  helper rather than repeated, because getting the expense id wrong in one of
 *  the two copies is a bug you only see when the row you tapped is not the row
 *  that moves. */
const patchReactions = (
    queryClient: ReturnType<typeof useQueryClient>,
    slug: string,
    expenseId: string,
    edit: (reactions: ApiReaction[]) => ApiReaction[]
): RoomState | undefined => {
    const previous = queryClient.getQueryData<RoomState>(roomKey(slug))
    if (previous) {
        queryClient.setQueryData<RoomState>(roomKey(slug), {
            ...previous,
            expenses: previous.expenses.map((expense) =>
                expense.id === expenseId ? { ...expense, reactions: edit(expense.reactions) } : expense
            ),
        })
    }
    return previous
}

interface ReactionVariables {
    expenseId: string
    emoji: string
    memberId: string
    memberToken: string
}

export function useAddReaction(slug: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({ expenseId, ...input }: ReactionVariables) => api.reactions.add(expenseId, input),
        onMutate: async ({ expenseId, emoji, memberId }) => {
            await queryClient.cancelQueries({ queryKey: roomKey(slug) })
            // Guarded: a double-tap must not paint two of the same pill, because
            // the server's unique key means the second one is never coming back.
            const previous = patchReactions(queryClient, slug, expenseId, (reactions) =>
                reactions.some((r) => r.emoji === emoji && r.memberId === memberId)
                    ? reactions
                    : [...reactions, { emoji, memberId }]
            )
            return { previous }
        },
        onError: (_error, _input, context) => {
            if (context?.previous) queryClient.setQueryData(roomKey(slug), context.previous)
        },
        onSuccess: (state) => seed(queryClient, slug, state),
    })
}

export function useRemoveReaction(slug: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({ expenseId, ...input }: ReactionVariables) => api.reactions.remove(expenseId, input),
        onMutate: async ({ expenseId, emoji, memberId }) => {
            await queryClient.cancelQueries({ queryKey: roomKey(slug) })
            const previous = patchReactions(queryClient, slug, expenseId, (reactions) =>
                reactions.filter((r) => !(r.emoji === emoji && r.memberId === memberId))
            )
            return { previous }
        },
        onError: (_error, _input, context) => {
            if (context?.previous) queryClient.setQueryData(roomKey(slug), context.previous)
        },
        onSuccess: (state) => seed(queryClient, slug, state),
    })
}

/** The Splitwise import. Seeds the cache exactly like a creation, because that is what it is —
 *  one call that returns a finished room, history and balances included. */
export function useImportRoom(): UseMutationResult<RoomStateWithMember, Error, ImportRoomInput> {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: ImportRoomInput) => api.importRoom(input),
        onSuccess: (state) => seed(queryClient, state.room.slug, state),
    })
}
