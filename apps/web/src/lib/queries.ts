'use client'

import { useMutation, useQuery, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { api } from './api'
import type {
    ApiReaction,
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
                            // Nothing can have reacted to a row that does not
                            // exist on the server yet.
                            reactions: [],
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
