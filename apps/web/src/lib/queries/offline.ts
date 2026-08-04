'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
    PENDING_ITEM_PREFIX,
    PENDING_KEY,
    parseQueue,
    refreshQueueSnapshot,
    requestDrain,
    setQueuePerformer,
    useQueueNotices,
} from '../offline-queue'
import { api } from '../api'
import { roomKey, seedRoomState } from './core'

/**
 * Which rooms lost queued records in another tab.
 *
 * `null` means storage was cleared wholesale, so every active room must refresh.
 */
export function removedQueueSlugs(event: Pick<StorageEvent, 'key' | 'oldValue' | 'newValue'>): string[] | null {
    if (event.key === null) return null

    const removed = (() => {
        if (event.key.startsWith(PENDING_ITEM_PREFIX)) {
            return event.newValue === null && event.oldValue !== null ? parseQueue(`[${event.oldValue}]`) : []
        }
        if (event.key === PENDING_KEY) {
            const remaining = new Set(parseQueue(event.newValue).map((item) => item.clientKey))
            return parseQueue(event.oldValue).filter((item) => !remaining.has(item.clientKey))
        }
        return []
    })()

    return [...new Set(removed.map((item) => item.slug))]
}

/** Configure and drain the device-local offline write queue. */
export function useOfflineQueueRunner(): void {
    const queryClient = useQueryClient()
    useQueueNotices()

    useEffect(() => {
        setQueuePerformer(async (item) => {
            const state = await api.replayWrite(item)
            seedRoomState(queryClient, item.slug, state)
        })

        requestDrain()
        const onStorage = (event: StorageEvent) => {
            if (event.key === null || event.key === PENDING_KEY || event.key.startsWith(PENDING_ITEM_PREFIX)) {
                const removedSlugs = removedQueueSlugs(event)
                refreshQueueSnapshot()
                requestDrain()
                if (removedSlugs === null) {
                    void queryClient.refetchQueries({ queryKey: ['room'], type: 'active' })
                } else {
                    for (const slug of removedSlugs) {
                        void queryClient.refetchQueries({ queryKey: roomKey(slug) })
                    }
                }
            }
        }
        window.addEventListener('storage', onStorage)
        window.addEventListener('online', requestDrain)
        return () => {
            window.removeEventListener('storage', onStorage)
            window.removeEventListener('online', requestDrain)
            setQueuePerformer(null)
        }
    }, [queryClient])
}
