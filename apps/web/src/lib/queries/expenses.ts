'use client'

import { useMutation, useQueryClient, type QueryClient, type UseMutationOptions } from '@tanstack/react-query'
import { api, expensesPath, isCatchUpReviewChange } from '../api'
import type {
    CatchUpExpenseInput,
    ExpenseCreateResult,
    ExpenseInput,
    ExpenseUpdateInput,
    RoomState,
} from '../api-types'
import { createClientKey, draftExpenseRow, enqueueWrite, isOfflineFailure, queuedExpenseId } from '../offline-queue'
import { roomKey, roomStateResult, seedRoomState } from './core'

interface AddExpenseContext {
    previous?: RoomState
}

export interface ExpenseRequestState {
    signature: string
    clientKey: string
}

export interface ExpenseRequestRef {
    current: ExpenseRequestState | null
}

/** One key describes one materially unchanged expense draft. */
const expenseRequestSignature = (input: ExpenseInput): string =>
    JSON.stringify([
        input.description,
        input.amountMinor,
        input.currency,
        input.newPaidByName ? ['new', input.newPaidByName] : ['member', input.paidById ?? null],
        input.splitMode,
        input.participantIds ?? null,
        input.exactShares ?? null,
        input.weightedShares ?? null,
        input.date ?? null,
        input.category ?? null,
    ])

/** Strip this write's in-flight optimistic row from the cached room. */
const authoritativeState = (queryClient: QueryClient, slug: string, clientKey: string): RoomState | undefined => {
    const cached = queryClient.getQueryData<RoomState>(roomKey(slug))
    if (!cached) return undefined
    const pendingId = queuedExpenseId(clientKey)
    return { ...cached, expenses: cached.expenses.filter((expense) => expense.id !== pendingId) }
}

/**
 * Optimistic expense creation with stable retry keys and offline queue fallback.
 * Exported as options so the cache contract is testable without a renderer.
 */
export function addExpenseMutationOptions(
    queryClient: QueryClient,
    slug: string,
    token?: string | null,
    requestRef?: ExpenseRequestRef
): UseMutationOptions<ExpenseCreateResult, Error, ExpenseInput, AddExpenseContext> {
    let localRequest: ExpenseRequestState | null = null
    const requestFor = (input: ExpenseInput): ExpenseRequestState => {
        const signature = expenseRequestSignature(input)
        const current = requestRef ? requestRef.current : localRequest
        const next = {
            signature,
            clientKey: input.clientKey ?? (current?.signature === signature ? current.clientKey : createClientKey()),
        }
        localRequest = next
        if (requestRef) requestRef.current = next
        return next
    }
    const clearRequest = () => {
        localRequest = null
        if (requestRef) requestRef.current = null
    }

    return {
        mutationFn: async (input: ExpenseInput): Promise<ExpenseCreateResult> => {
            // Mint before the first attempt so a committed write with a lost
            // response and its offline replay address the same server row.
            const { clientKey } = requestFor(input)
            const requestInput = { ...input, clientKey }
            try {
                return await api.addExpense(slug, requestInput, token)
            } catch (error) {
                // A staged payer has no server-issued member id for an honest
                // pending row, so only ordinary expenses can enter the queue.
                if (input.newPaidByName) throw error
                if (!isOfflineFailure(error)) throw error
                const authoritative = authoritativeState(queryClient, slug, clientKey)
                if (!authoritative) throw error
                const queued = enqueueWrite({
                    slug,
                    endpoint: expensesPath(slug),
                    method: 'POST',
                    body: requestInput,
                    token,
                })
                if (!queued) throw error
                return { ...authoritative, createdFirstSharedBalance: false }
            }
        },
        onMutate: async (input: ExpenseInput) => {
            const { clientKey } = requestFor(input)
            await queryClient.cancelQueries({ queryKey: roomKey(slug) })
            const previous = queryClient.getQueryData<RoomState>(roomKey(slug))
            if (previous && !input.newPaidByName) {
                const now = Date.now()
                queryClient.setQueryData<RoomState>(roomKey(slug), {
                    ...previous,
                    expenses: [
                        draftExpenseRow(input, {
                            id: queuedExpenseId(clientKey),
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
        onSuccess: (result) => {
            clearRequest()
            seedRoomState(queryClient, slug, roomStateResult(result))
        },
    }
}

export function useAddExpense(slug: string, token?: string | null, requestRef?: ExpenseRequestRef) {
    const queryClient = useQueryClient()
    return useMutation(addExpenseMutationOptions(queryClient, slug, token, requestRef))
}

export function useUpdateExpense(slug: string, token?: string | null) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: ExpenseUpdateInput }) =>
            api.updateExpense(slug, id, input, token),
        onSuccess: (state) => seedRoomState(queryClient, slug, state),
    })
}

export const catchUpExpenseMutationOptions = (queryClient: QueryClient, slug: string, token?: string | null) =>
    ({
        mutationFn: ({ expenseId, ...input }: CatchUpExpenseInput & { expenseId: string }) =>
            api.catchUpExpense(slug, expenseId, input, token),
        onSuccess: ({ state }) => seedRoomState(queryClient, slug, state),
        // Refresh a review conflict before a sequential runner reads its next row.
        onError: async (error) => {
            if (isCatchUpReviewChange(error)) {
                await queryClient.invalidateQueries({ queryKey: roomKey(slug) })
            }
        },
    }) satisfies UseMutationOptions<
        Awaited<ReturnType<typeof api.catchUpExpense>>,
        Error,
        CatchUpExpenseInput & { expenseId: string }
    >

export function useCatchUpExpense(slug: string, token?: string | null) {
    const queryClient = useQueryClient()
    return useMutation(catchUpExpenseMutationOptions(queryClient, slug, token))
}

export function useDeleteExpense(slug: string, token?: string | null) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.deleteExpense(slug, id, token),
        onSuccess: (state) => seedRoomState(queryClient, slug, state),
    })
}

export function useRestoreExpense(slug: string, token?: string | null) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.restoreExpense(id, token),
        onSuccess: (state) => seedRoomState(queryClient, slug, state),
    })
}
