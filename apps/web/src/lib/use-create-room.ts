'use client'

import { useState } from 'react'
import { roomProps, track } from '@/lib/analytics'
import type { RoomStateWithMember } from '@/lib/api-types'
import { useErrorMessage } from '@/lib/error-messages'
import { writeIdentity } from '@/lib/identity'
import { markRoomCreatedHere } from '@/lib/install-funnel'
import { useCreateRoom } from '@/lib/queries'
import { rememberRoom } from '@/lib/recent-rooms'
import { useFeedback } from '@/lib/use-settings'

export interface CreateRoomFields {
    name: string
    emoji: string
    currency: string
    creatorName: string
}

/**
 * Creating a room, once, for both surfaces that can do it: `/new` and the landing hero.
 *
 * The write-identity step is why this is shared rather than copied. The member token comes
 * back from the server exactly once and is never re-issued — a second implementation that
 * forgot to store it, or stored it after something that can throw, would silently cost that
 * device its attribution in the room forever.
 */
export function useCreateRoomFlow(fallbackMessage: string) {
    const createRoom = useCreateRoom()
    const errorMessage = useErrorMessage()
    const feedback = useFeedback()
    const [created, setCreated] = useState<RoomStateWithMember | null>(null)
    const [error, setError] = useState<string | null>(null)

    const submit = async (fields: CreateRoomFields) => {
        setError(null)
        try {
            const state = await createRoom.mutateAsync({
                name: fields.name.trim(),
                emoji: fields.emoji,
                currency: fields.currency,
                creatorName: fields.creatorName.trim(),
            })
            // The token is returned exactly once — store it before anything else
            // can throw, or this device permanently loses its attribution.
            writeIdentity(state.room.slug, {
                memberId: state.memberId,
                token: state.memberToken,
                name: fields.creatorName.trim(),
            })
            markRoomCreatedHere(state.room.slug)
            rememberRoom({ slug: state.room.slug, name: state.room.name, emoji: state.room.emoji ?? undefined })
            // No preview warm from here. The room's card lives at a URL only Next
            // knows and only the room document advertises — and this runs on `/new`
            // or the landing hero, whose head is still describing that page. The
            // warm happens where the room itself renders; see `room-preview.ts`.
            track('room_created', roomProps(state.room.slug, { currency: state.room.currency }))
            // A room came into being — the cork, not the pencil.
            feedback('pop')
            setCreated(state)
            return state
        } catch (err) {
            setError(errorMessage(err, fallbackMessage))
            return null
        }
    }

    return { submit, created, error, pending: createRoom.isPending }
}
