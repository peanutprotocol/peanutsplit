import { QueryClient, QueryObserver, onlineManager } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { roomReadBlocked } from './reads'

afterEach(() => {
    onlineManager.setOnline(true)
})

describe('roomReadBlocked', () => {
    it('treats a room read that starts after an offline event as blocked, not loading', async () => {
        // Pins the React Query behaviour the room screen relies on: once the browser has fired
        // `offline`, a new query pauses instead of failing, so it never reaches an error.
        onlineManager.setOnline(false)
        const queryFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
        const client = new QueryClient()
        const observer = new QueryObserver(client, { queryKey: ['room', 'summer-trip'], queryFn })
        const unsubscribe = observer.subscribe(() => {})
        await new Promise((resolve) => setTimeout(resolve, 20))

        const result = observer.getCurrentResult()
        expect(queryFn).not.toHaveBeenCalled()
        expect(result.error).toBeNull()
        expect(result.isPending).toBe(true)
        expect(result.fetchStatus).toBe('paused')
        expect(roomReadBlocked(result)).toBe(true)

        unsubscribe()
        client.clear()
    })

    it('keeps an ordinary first load and cached data out of the error screen', () => {
        expect(roomReadBlocked({ data: undefined, error: null, fetchStatus: 'fetching' })).toBe(false)
        expect(roomReadBlocked({ data: { room: {} }, error: null, fetchStatus: 'paused' })).toBe(false)
        expect(roomReadBlocked({ data: { room: {} }, error: new Error('x'), fetchStatus: 'idle' })).toBe(false)
        expect(roomReadBlocked({ data: undefined, error: new Error('x'), fetchStatus: 'idle' })).toBe(true)
    })
})
