import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import type { RoomState } from '../api-types'
import { readExpenseCurrencies } from '../expense-currencies'
import { memberStorageKey } from '../identity'
import type { QueuedWrite } from '../offline-queue'
import { replayQueuedExpense } from './offline'

const item: QueuedWrite = {
    slug: 'trip',
    token: 'ana-token',
    method: 'POST',
    endpoint: '/api/rooms/trip/expenses',
    clientKey: 'expense-key',
    addedAt: 1,
    body: { currency: 'GBP', amountMinor: '100', paidById: 'bea', splitMode: 'EQUAL' },
}

describe('offline currency recency', () => {
    let storage: Map<string, string>
    beforeEach(() => {
        storage = new Map([
            [memberStorageKey('trip'), JSON.stringify({ memberId: 'ana', name: 'Ana', token: 'ana-token' })],
        ])
        vi.stubGlobal('window', {
            localStorage: {
                getItem: (key: string) => storage.get(key) ?? null,
                setItem: (key: string, value: string) => storage.set(key, value),
            },
        })
    })
    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('records only after server acknowledgement, under the author rather than the payer', async () => {
        vi.spyOn(api, 'replayWrite').mockImplementation(async () => {
            expect(readExpenseCurrencies('trip', 'ana')).toEqual([])
            return {} as RoomState
        })
        await replayQueuedExpense(item)
        expect(readExpenseCurrencies('trip', 'ana')).toEqual(['GBP'])
        expect(readExpenseCurrencies('trip', 'bea')).toEqual([])
    })

    it('does not change recency when replay fails', async () => {
        vi.spyOn(api, 'replayWrite').mockRejectedValue(new Error('offline'))
        await expect(replayQueuedExpense(item)).rejects.toThrow('offline')
        expect(readExpenseCurrencies('trip', 'ana')).toEqual([])
    })

    it('does not attribute an old identity’s queued expense to the newly claimed member', async () => {
        storage.set(memberStorageKey('trip'), JSON.stringify({ memberId: 'bea', name: 'Bea', token: 'bea-token' }))
        vi.spyOn(api, 'replayWrite').mockResolvedValue({} as RoomState)
        await replayQueuedExpense(item)
        expect(readExpenseCurrencies('trip', 'bea')).toEqual([])
    })

    it('keeps the submitting identity if a different member is claimed during replay', async () => {
        vi.spyOn(api, 'replayWrite').mockImplementation(async () => {
            storage.set(memberStorageKey('trip'), JSON.stringify({ memberId: 'bea', name: 'Bea', token: 'bea-token' }))
            return {} as RoomState
        })
        await replayQueuedExpense(item)
        expect(readExpenseCurrencies('trip', 'ana')).toEqual(['GBP'])
        expect(readExpenseCurrencies('trip', 'bea')).toEqual([])
    })
})
