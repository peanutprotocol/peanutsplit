'use client'

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { ApiReaction, RoomState } from '../api-types'
import { roomKey, seedRoomState } from './core'

/** Both reaction mutations edit the same expense-local cache slice. */
const patchReactions = (
    queryClient: QueryClient,
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
            const previous = patchReactions(queryClient, slug, expenseId, (reactions) =>
                reactions.some((reaction) => reaction.emoji === emoji && reaction.memberId === memberId)
                    ? reactions
                    : [...reactions, { emoji, memberId }]
            )
            return { previous }
        },
        onError: (_error, _input, context) => {
            if (context?.previous) queryClient.setQueryData(roomKey(slug), context.previous)
        },
        onSuccess: (state) => seedRoomState(queryClient, slug, state),
    })
}

export function useRemoveReaction(slug: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({ expenseId, ...input }: ReactionVariables) => api.reactions.remove(expenseId, input),
        onMutate: async ({ expenseId, emoji, memberId }) => {
            await queryClient.cancelQueries({ queryKey: roomKey(slug) })
            const previous = patchReactions(queryClient, slug, expenseId, (reactions) =>
                reactions.filter((reaction) => !(reaction.emoji === emoji && reaction.memberId === memberId))
            )
            return { previous }
        },
        onError: (_error, _input, context) => {
            if (context?.previous) queryClient.setQueryData(roomKey(slug), context.previous)
        },
        onSuccess: (state) => seedRoomState(queryClient, slug, state),
    })
}
