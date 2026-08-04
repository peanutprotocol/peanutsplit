'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { SettlementInput } from '../api-types'
import { seedRoomState } from './core'

export function useAddSettlement(slug: string, token?: string | null) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: SettlementInput) => api.addSettlement(slug, input, token),
        onSuccess: (state) => seedRoomState(queryClient, slug, state),
    })
}

export function useDeleteSettlement(slug: string, token?: string | null) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.deleteSettlement(slug, id, token),
        onSuccess: (state) => seedRoomState(queryClient, slug, state),
    })
}
