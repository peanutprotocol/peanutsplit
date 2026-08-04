'use client'

import { useCallback } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { CurrencyInfo, RoomHistoryPage, RoomState } from '../api-types'
import { FALLBACK_CURRENCIES } from '../money'
import { mergeQueuedExpenses, useQueuedWrites } from '../offline-queue'
import { useRoomEvents } from '../realtime'
import { currenciesKey, historyKey, roomKey } from './core'

export function useRoomHistory(slug: string, enabled = true) {
    return useInfiniteQuery<RoomHistoryPage>({
        queryKey: historyKey(slug),
        queryFn: ({ pageParam, signal }) =>
            api.roomHistory(slug, typeof pageParam === 'string' ? pageParam : null, signal),
        initialPageParam: null,
        getNextPageParam: (page) => page.nextCursor ?? undefined,
        enabled,
    })
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

/** Timeout used to turn a wake-from-sleep hung request into a retryable failure. */
export const ROOM_FETCH_TIMEOUT_MS = 8_000

const withTimeout = (signal: AbortSignal | undefined, ms: number): AbortSignal | undefined => {
    // `AbortSignal.any` is recent (iOS 17.4). Without it the query keeps
    // react-query's own signal and behaves exactly as it did before.
    if (typeof AbortSignal === 'undefined' || typeof AbortSignal.any !== 'function') return signal
    const timeout = AbortSignal.timeout(ms)
    return signal ? AbortSignal.any([signal, timeout]) : timeout
}

/**
 * The catalog. Seeded from the bundled table so first paint can format money, then revalidated.
 *
 * `initialDataUpdatedAt: 0` keeps the build-time fallback stale on arrival so
 * the server can immediately correct its `hasRate` capabilities.
 */
export function useCurrencies() {
    return useQuery({
        queryKey: currenciesKey,
        queryFn: ({ signal }) => api.currencies(signal),
        staleTime: 24 * 60 * 60 * 1000,
        initialData: FALLBACK_CURRENCIES as CurrencyInfo[],
        initialDataUpdatedAt: 0,
    })
}

/**
 * The authoritative room query, combining realtime pokes, polling fallback and
 * device-local queued expense placeholders.
 */
export function useRoomState(slug: string) {
    const queryClient = useQueryClient()
    const queued = useQueuedWrites(slug)

    const onPoke = useCallback(() => {
        // Refetch, not a hand-built patch: the poke carries no payload and the
        // GET is the only thing allowed to say what the balances are.
        void queryClient.refetchQueries({ queryKey: roomKey(slug) })
        // History is lazy, so this only refetches while its drawer is open.
        void queryClient.refetchQueries({ queryKey: historyKey(slug), type: 'active' })
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
            const status = (error as { status?: number }).status
            if (status === 404) return false
            return failureCount < 2
        },
    })
}

/** Deployment-wide model capability, cached for the session. */
export function useModelStatus(slug: string, enabled = true): { enabled: boolean; resolved: boolean } {
    const { data, isPending } = useQuery({
        queryKey: ['model-enabled'] as const,
        queryFn: ({ signal }) => api.modelStatus(slug, signal),
        enabled,
        staleTime: 60 * 60 * 1000,
        retry: false,
        refetchOnWindowFocus: false,
    })
    return { enabled: enabled && (data?.enabled ?? false), resolved: !enabled || !isPending }
}
