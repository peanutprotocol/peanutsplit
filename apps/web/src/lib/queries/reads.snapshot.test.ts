import { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError, NETWORK_ERROR_CODE, api } from '../api'
import type { RoomState } from '../api-types'
import { roomKey } from './core'
import { roomSnapshotQueryOptions } from './reads'

const state: RoomState = {
    room: {
        id: 'room-1',
        slug: 'summer-trip',
        name: 'Summer trip',
        emoji: null,
        currency: 'EUR',
        coverUrl: null,
        theme: null,
        createdAt: '2026-08-04T00:00:00.000Z',
        archivedAt: null,
    },
    members: [],
    expenses: [],
    settlements: [],
    balances: {},
    suggestedTransfers: [],
}

afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

describe('one-shot room snapshot query', () => {
    it('shares the room cache without installing polling, focus or reconnect refetches', () => {
        const options = roomSnapshotQueryOptions('summer-trip')

        expect(options.queryKey).toEqual(roomKey('summer-trip'))
        expect(options.refetchInterval).toBe(false)
        expect(options.refetchOnWindowFocus).toBe(false)
        expect(options.refetchOnReconnect).toBe(false)
    })

    it('performs one private no-store room GET', async () => {
        const fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(state)),
        } as Response)
        vi.stubGlobal('fetch', fetch)
        const queryClient = new QueryClient()

        await expect(queryClient.fetchQuery(roomSnapshotQueryOptions('summer/trip'))).resolves.toEqual(state)

        expect(fetch).toHaveBeenCalledTimes(1)
        expect(fetch.mock.calls[0][0]).toBe('/api/rooms/summer%2Ftrip')
        expect(fetch.mock.calls[0][1]).toMatchObject({ cache: 'no-store' })
        queryClient.clear()
    })

    it('retries a transient read but never retries an authoritative missing room', async () => {
        const transientClient = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })
        const room = vi
            .spyOn(api, 'room')
            .mockRejectedValueOnce(new ApiRequestError(0, NETWORK_ERROR_CODE, 'connection interrupted'))
            .mockResolvedValueOnce(state)

        await expect(transientClient.fetchQuery(roomSnapshotQueryOptions('summer-trip'))).resolves.toEqual(state)
        expect(room).toHaveBeenCalledTimes(2)
        expect(room.mock.calls[0][0]).toBe('summer-trip')
        expect(room.mock.calls[0][1]).toBeInstanceOf(AbortSignal)
        transientClient.clear()

        room.mockReset()
        room.mockRejectedValue(new ApiRequestError(404, 'NOT_FOUND', 'room not found'))
        const missingClient = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })

        await expect(missingClient.fetchQuery(roomSnapshotQueryOptions('missing-room'))).rejects.toMatchObject({
            status: 404,
            code: 'NOT_FOUND',
        })
        expect(room).toHaveBeenCalledTimes(1)
        missingClient.clear()
    })
})
