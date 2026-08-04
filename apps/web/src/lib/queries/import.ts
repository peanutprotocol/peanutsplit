'use client'

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { api } from '../api'
import type { ImportRoomInput, RoomStateWithMember } from '../api-types'
import { seedRoomState } from './core'

/** A successful import is a complete room creation and seeds the same cache. */
export function useImportRoom(): UseMutationResult<RoomStateWithMember, Error, ImportRoomInput> {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: ImportRoomInput) => api.importRoom(input),
        onSuccess: (state) => seedRoomState(queryClient, state.room.slug, state),
    })
}
