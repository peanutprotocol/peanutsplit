'use client'

import { useMutation, useQuery, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { api } from './api'
import type {
    CreateRoomInput,
    CurrencyInfo,
    ExpenseInput,
    RoomState,
    RoomStateWithMember,
    SettlementInput,
} from './api-types'
import { FALLBACK_CURRENCIES } from './money'

export const roomKey = (slug: string) => ['room', slug] as const
export const currenciesKey = ['currencies'] as const

/** Every mutation returns the full RoomState, so the cache is seeded in one hop
 *  and no screen ever derives money client-side. */
const seed = (queryClient: ReturnType<typeof useQueryClient>, slug: string, state: RoomState) => {
    queryClient.setQueryData(roomKey(slug), state)
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
 * THE room query. Polled every 8s and on window focus — someone else adding an
 * expense on their phone should land on yours without a refresh.
 */
export function useRoomState(slug: string) {
    return useQuery({
        queryKey: roomKey(slug),
        queryFn: ({ signal }) => api.room(slug, signal),
        refetchInterval: 8_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
            // A 404 is a real answer ("this split doesn't exist"), not a blip.
            const status = (error as { status?: number }).status
            if (status === 404) return false
            return failureCount < 2
        },
    })
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

/**
 * Optimistic add: the row appears the instant you hit save, flagged pending, and
 * the authoritative RoomState (with real shares and balances) replaces it on
 * response. On failure the snapshot goes back — no ghost expense.
 */
export function useAddExpense(slug: string, token?: string | null) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: ExpenseInput) => api.addExpense(slug, input, token),
        onMutate: async (input) => {
            await queryClient.cancelQueries({ queryKey: roomKey(slug) })
            const previous = queryClient.getQueryData<RoomState>(roomKey(slug))
            if (previous) {
                const participants =
                    input.splitMode === 'EXACT'
                        ? (input.exactShares ?? []).map((s) => s.memberId)
                        : (input.participantIds ?? previous.members.map((m) => m.id))
                queryClient.setQueryData<RoomState>(roomKey(slug), {
                    ...previous,
                    expenses: [
                        {
                            id: `pending-${Date.now()}`,
                            description: input.description,
                            amountMinor: input.amountMinor,
                            currency: input.currency,
                            // Unknown until the server applies FX — the row shows
                            // the expense-currency amount and no conversion line.
                            baseAmountMinor: input.amountMinor,
                            fxRate: '1',
                            splitMode: input.splitMode,
                            paidById: input.paidById,
                            createdById: null,
                            date: input.date ?? new Date().toISOString(),
                            category: input.category ?? null,
                            createdAt: new Date().toISOString(),
                            shares: participants.map((memberId) => ({
                                memberId,
                                amountMinor: '0',
                                enteredAmountMinor: null,
                            })),
                        },
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
    })
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
