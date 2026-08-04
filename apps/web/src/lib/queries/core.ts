import type { QueryClient } from '@tanstack/react-query'
import type { RoomState } from '../api-types'
import { requestDrain } from '../offline-queue'

export const roomKey = (slug: string) => ['room', slug] as const
export const currenciesKey = ['currencies'] as const
export const historyKey = (slug: string) => ['room-history', slug] as const

/** Every mutation returns the full RoomState, so the cache is seeded in one hop
 *  and no screen ever derives money client-side. */
export const seedRoomState = (queryClient: QueryClient, slug: string, state: RoomState) => {
    queryClient.setQueryData(roomKey(slug), state)
    // A write that reached the server is the only proof of connectivity worth
    // acting on: `navigator.onLine` lies on captive portals and flaky mobile
    // data. So every success is also a chance to flush whatever the queue is
    // still holding. No-op when it is empty.
    requestDrain()
}

/**
 * Strip member identity envelopes before room state enters react-query.
 *
 * Mutation callers can still persist response credentials locally, while the
 * shared room cache contains only data every holder of the link can read.
 */
export const roomStateResult = (response: RoomState): RoomState => ({
    room: response.room,
    members: response.members,
    expenses: response.expenses,
    settlements: response.settlements,
    balances: response.balances,
    suggestedTransfers: response.suggestedTransfers,
})
