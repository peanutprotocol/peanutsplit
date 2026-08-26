'use client'

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { api } from '../api'
import type { ImportIntoRoomInput, ImportIntoRoomResult, ImportRoomInput, RoomStateWithMember } from '../api-types'
import { trackRoomCreatedConversion } from '../google-ads'
import { seedRoomState } from './core'

/** A successful import is a complete room creation: it seeds the same cache and reports the same conversion. */
export function useImportRoom(): UseMutationResult<RoomStateWithMember, Error, ImportRoomInput> {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: ImportRoomInput) => api.importRoom(input),
        onSuccess: (state) => {
            seedRoomState(queryClient, state.room.slug, state)
            trackRoomCreatedConversion()
        },
    })
}

/** Append one reviewed source export to a room without changing that room's identity or currency. */
export function useImportIntoRoom(
    slug: string,
    token?: string | null
): UseMutationResult<ImportIntoRoomResult, Error, ImportIntoRoomInput> {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: ImportIntoRoomInput) => api.importIntoRoom(slug, input, token),
        onSuccess: (state) => seedRoomState(queryClient, slug, state),
    })
}
