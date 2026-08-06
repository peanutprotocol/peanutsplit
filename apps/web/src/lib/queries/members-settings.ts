'use client'

import {
    useMutation,
    useQueryClient,
    type QueryClient,
    type UseMutationOptions,
    type UseMutationResult,
} from '@tanstack/react-query'
import { api } from '../api'
import type {
    CreateRoomInput,
    MemberAvatarInput,
    RoomState,
    RoomStateWithAddedMember,
    RoomStateWithMember,
} from '../api-types'
import { roomKey, roomStateResult, seedRoomState } from './core'

export function useCreateRoom(): UseMutationResult<RoomStateWithMember, Error, CreateRoomInput> {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: CreateRoomInput) => api.createRoom(input),
        onSuccess: (state) => seedRoomState(queryClient, state.room.slug, state),
    })
}

export function useJoinRoom(slug: string): UseMutationResult<RoomStateWithMember, Error, { name: string }> {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: { name: string }) => api.joinRoom(slug, input),
        onSuccess: (response) => seedRoomState(queryClient, slug, roomStateResult(response)),
    })
}

/** Claim an existing public roster entry without caching its identity envelope. */
export function claimMemberMutationOptions(
    queryClient: QueryClient,
    slug: string
): UseMutationOptions<RoomStateWithMember, Error, { memberId: string }> {
    return {
        mutationFn: ({ memberId }) => api.claimMember(slug, memberId),
        onSuccess: (response) => seedRoomState(queryClient, slug, roomStateResult(response)),
    }
}

export function useClaimMember(slug: string): UseMutationResult<RoomStateWithMember, Error, { memberId: string }> {
    const queryClient = useQueryClient()
    return useMutation(claimMemberMutationOptions(queryClient, slug))
}

/** Token-free public result for an organiser adding somebody to the roster. */
interface AddedMemberResult {
    memberId: string
    state: RoomState
}

const addedMemberResult = (response: RoomStateWithAddedMember): AddedMemberResult => ({
    memberId: response.memberId,
    state: roomStateResult(response),
})

/** Exported so the token-free HTTP and cache contract can be unit tested. */
export function addMemberMutationOptions(
    queryClient: QueryClient,
    slug: string,
    token?: string | null
): UseMutationOptions<AddedMemberResult, Error, { name: string }> {
    return {
        mutationFn: async (input) => addedMemberResult(await api.addMember(slug, input, token)),
        onSuccess: ({ state }) => seedRoomState(queryClient, slug, state),
    }
}

export function useAddMember(
    slug: string,
    token?: string | null
): UseMutationResult<AddedMemberResult, Error, { name: string }> {
    const queryClient = useQueryClient()
    return useMutation(addMemberMutationOptions(queryClient, slug, token))
}

export function useDeleteMember(slug: string, token?: string | null) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (memberId: string) => api.deleteMember(slug, memberId, token),
        onSuccess: (state) => seedRoomState(queryClient, slug, state),
    })
}

export function useRestoreMember(slug: string, token?: string | null) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (memberId: string) => api.restoreMember(slug, memberId, token),
        onSuccess: (state) => seedRoomState(queryClient, slug, state),
    })
}

export function useReactivateMember(slug: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (memberId: string) => api.reactivateMember(slug, memberId),
        onSuccess: (response) => seedRoomState(queryClient, slug, roomStateResult(response)),
    })
}

/** Rename optimistically while preserving the room slug and saved links. */
export function useSetRoomName(slug: string, token?: string | null) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (name: string) => api.setRoomName(slug, name, token),
        onMutate: async (name) => {
            await queryClient.cancelQueries({ queryKey: roomKey(slug) })
            const previous = queryClient.getQueryData<RoomState>(roomKey(slug))
            if (previous) {
                queryClient.setQueryData<RoomState>(roomKey(slug), {
                    ...previous,
                    room: { ...previous.room, name },
                })
            }
            return { previous }
        },
        onError: (_error, _name, context) => {
            if (context?.previous) queryClient.setQueryData(roomKey(slug), context.previous)
        },
        onSuccess: (state) => seedRoomState(queryClient, slug, state),
    })
}

/** Repaint the room immediately, rolling back to the cache snapshot on failure. */
export function useSetTheme(slug: string, token?: string | null) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (theme: string | null) => api.setTheme(slug, theme, token),
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
        onSuccess: (state) => seedRoomState(queryClient, slug, state),
    })
}

/** Paint the room emblem immediately, rolling back on failure. */
export function useSetEmblem(slug: string, token?: string | null) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (emoji: string | null) => api.setEmblem(slug, emoji, token),
        onMutate: async (emoji) => {
            await queryClient.cancelQueries({ queryKey: roomKey(slug) })
            const previous = queryClient.getQueryData<RoomState>(roomKey(slug))
            if (previous) {
                queryClient.setQueryData<RoomState>(roomKey(slug), {
                    ...previous,
                    room: { ...previous.room, emoji },
                })
            }
            return { previous }
        },
        onError: (_error, _emoji, context) => {
            if (context?.previous) queryClient.setQueryData(roomKey(slug), context.previous)
        },
        onSuccess: (state) => seedRoomState(queryClient, slug, state),
    })
}

/** Paint a member avatar immediately, rolling back on failure. */
export function useSetAvatar(slug: string, memberId: string, token?: string | null) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (selection: MemberAvatarInput) => api.setMemberAvatar(slug, memberId, selection, token),
        onMutate: async (selection) => {
            await queryClient.cancelQueries({ queryKey: roomKey(slug) })
            const previous = queryClient.getQueryData<RoomState>(roomKey(slug))
            if (previous) {
                queryClient.setQueryData<RoomState>(roomKey(slug), {
                    ...previous,
                    members: previous.members.map((member) =>
                        member.id === memberId
                            ? {
                                  ...member,
                                  avatar: selection.avatar,
                                  ...(selection.avatarPalette === undefined
                                      ? {}
                                      : { avatarPalette: selection.avatarPalette }),
                              }
                            : member
                    ),
                })
            }
            return { previous }
        },
        onError: (_error, _selection, context) => {
            if (context?.previous) queryClient.setQueryData(roomKey(slug), context.previous)
        },
        onSuccess: (state) => seedRoomState(queryClient, slug, state),
    })
}
