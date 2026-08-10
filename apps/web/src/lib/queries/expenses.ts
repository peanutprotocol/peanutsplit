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
import {
    createClientKey,
    draftExpenseRow,
    enqueueWrite,
    isImplicitEqualRoster,
    isOfflineFailure,
    queuedExpenseId,
} from '../offline-queue'
import { roomKey, roomStateResult, seedRoomState } from './core'
import { activeMembers } from '../members'

interface AddExpenseContext {
    previous?: RoomState
}

/** Client-only mutation metadata. `queuedLocally` is never part of the HTTP contract or cache. */
export type ExpenseMutationResult = ExpenseCreateResult & { queuedLocally: boolean }

export interface ExpenseRequestState {
    signature: string
    clientKey: string
    /** Present only for untouched EQUAL. Captured synchronously in onMutate,
     * before query cancellation can yield to a roster update. */
    equalParticipantIds?: string[]
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
        input.manualFxRate ?? null,
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
): UseMutationOptions<ExpenseMutationResult, Error, ExpenseInput, AddExpenseContext> {
    let localRequest: ExpenseRequestState | null = null
    const requestFor = (input: ExpenseInput, equalParticipantIds?: string[]): ExpenseRequestState => {
        const signature = expenseRequestSignature(input)
        const current = requestRef ? requestRef.current : localRequest
        const sameRequest = current?.signature === signature
        const next = {
            signature,
            clientKey: input.clientKey ?? (sameRequest ? current.clientKey : createClientKey()),
            ...(equalParticipantIds !== undefined
                ? { equalParticipantIds }
                : sameRequest && current.equalParticipantIds !== undefined
                  ? { equalParticipantIds: current.equalParticipantIds }
                  : {}),
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
        mutationFn: async (input: ExpenseInput): Promise<ExpenseMutationResult> => {
            // Mint before the first attempt so a committed write with a lost
            // response and its offline replay address the same server row.
            const request = requestFor(input)
            const { clientKey } = request
            const requestInput = { ...input, clientKey }
            // An untouched EQUAL form means "everyone visible when I saved".
            // The online request keeps the compact body and lets the server
            // resolve that roster atomically. If the request becomes an
            // offline draft, however, replay may happen after somebody leaves
            // or joins. The roster was frozen in `onMutate`, synchronously,
            // before the awaited `cancelQueries` — so an SSE/cache update during
            // a hanging request cannot silently move the bill from one person to
            // another.
            //
            // There is deliberately no cache read here. Every read at this point
            // is a post-await read, which is precisely the roster the freeze
            // exists to refuse; falling back to one would undo the whole thing
            // in the one case that needs it. When a concurrent draft has
            // replaced the request object the freeze is simply gone, and the
            // body stays implicit: the queue holds an unresolved EQUAL roster
            // for confirmation, so a person decides instead of this line
            // guessing.
            const frozen = request.equalParticipantIds
            const equalParticipantSnapshot = isImplicitEqualRoster(input) && frozen?.length ? frozen : null
            try {
                return { ...(await api.addExpense(slug, requestInput, token)), queuedLocally: false }
            } catch (error) {
                // A staged payer has no server-issued member id for an honest
                // pending row, so only ordinary expenses can enter the queue.
                if (input.newPaidByName) throw error
                if (!isOfflineFailure(error)) throw error
                const authoritative = authoritativeState(queryClient, slug, clientKey)
                if (!authoritative) throw error
                const queuedInput =
                    equalParticipantSnapshot === null
                        ? requestInput
                        : { ...requestInput, participantIds: equalParticipantSnapshot }
                const queued = enqueueWrite({
                    slug,
                    endpoint: expensesPath(slug),
                    method: 'POST',
                    body: queuedInput,
                    token,
                })
                if (!queued) throw error
                return { ...authoritative, createdFirstSharedBalance: false, queuedLocally: true }
            }
        },
        onMutate: async (input: ExpenseInput) => {
            // This first cache read is deliberately before the first await: it
            // is the roster visible at the instant Save was pressed.
            const submitState = queryClient.getQueryData<RoomState>(roomKey(slug))
            const submitRoster = activeMembers(submitState?.members ?? []).map((member) => member.id)
            // An empty roster is not a freeze — it is the same implicit "whoever
            // is in the room" the server would resolve, so it is never recorded
            // as one.
            const equalParticipantIds =
                isImplicitEqualRoster(input) && submitRoster.length > 0 ? submitRoster : undefined
            const { clientKey } = requestFor(input, equalParticipantIds)
            await queryClient.cancelQueries({ queryKey: roomKey(slug) })
            const previous = queryClient.getQueryData<RoomState>(roomKey(slug))
            if (previous && !input.newPaidByName) {
                const now = Date.now()
                const optimisticInput =
                    equalParticipantIds === undefined ? input : { ...input, participantIds: equalParticipantIds }
                queryClient.setQueryData<RoomState>(roomKey(slug), {
                    ...previous,
                    expenses: [
                        draftExpenseRow(optimisticInput, {
                            id: queuedExpenseId(clientKey),
                            at: now,
                            members: activeMembers(previous.members),
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
