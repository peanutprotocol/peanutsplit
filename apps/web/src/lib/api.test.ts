import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError, NETWORK_ERROR_CODE, api, isApiError } from './api'

const respondWith = (status: number, body: unknown, ok = status < 400) => {
    const text = typeof body === 'string' ? body : JSON.stringify(body)
    return vi.fn().mockResolvedValue({ ok, status, text: () => Promise.resolve(text) } as unknown as Response)
}

afterEach(() => vi.unstubAllGlobals())

describe('api error paths', () => {
    it('unwraps the { error: { code, message } } envelope', async () => {
        vi.stubGlobal(
            'fetch',
            respondWith(409, { error: { code: 'DUPLICATE_MEMBER_NAME', message: 'Bea is already in this room' } })
        )
        const failure = await api.joinRoom('room-a', { name: 'Bea' }).catch((error) => error)
        expect(failure).toBeInstanceOf(ApiRequestError)
        expect(isApiError(failure, 'DUPLICATE_MEMBER_NAME')).toBe(true)
        expect(failure.status).toBe(409)
        expect(failure.message).toBe('Bea is already in this room')
    })

    it('distinguishes a 409 EXPENSE_DELETED from other conflicts', async () => {
        vi.stubGlobal(
            'fetch',
            respondWith(409, { error: { code: 'EXPENSE_DELETED', message: 'restore this expense before editing it' } })
        )
        const failure = await api
            .updateExpense('room-a', 'e1', {
                description: 'x',
                amountMinor: '100',
                currency: 'EUR',
                paidById: 'm1',
                splitMode: 'EQUAL',
            })
            .catch((error) => error)
        expect(isApiError(failure, 'EXPENSE_DELETED')).toBe(true)
        expect(isApiError(failure, 'DUPLICATE_MEMBER_NAME')).toBe(false)
    })

    it('falls back to UNKNOWN when the body is not our envelope', async () => {
        vi.stubGlobal('fetch', respondWith(500, '<html>gateway exploded</html>'))
        const failure = await api.room('room-a').catch((error) => error)
        expect(failure.code).toBe('UNKNOWN')
        expect(failure.status).toBe(500)
    })

    it('turns a transport failure into a NETWORK_ERROR, not an unhandled rejection', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
        const failure = await api.room('room-a').catch((error) => error)
        expect(isApiError(failure, NETWORK_ERROR_CODE)).toBe(true)
        expect(failure.status).toBe(0)
    })

    it('re-throws AbortError untouched so React Query can ignore it', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')))
        const failure = await api.room('room-a').catch((error) => error)
        expect(failure).toBeInstanceOf(DOMException)
    })
})

describe('api requests', () => {
    it('sends the member token as X-Member-Token and JSON-encodes the body', async () => {
        const fetchMock = respondWith(201, { room: {}, members: [] })
        vi.stubGlobal('fetch', fetchMock)
        await api.addExpense(
            'ski-trip-x7k2m9',
            {
                description: 'Lift pass',
                amountMinor: '12000',
                currency: 'CHF',
                paidById: 'm1',
                splitMode: 'EQUAL',
            },
            'tok_abc'
        )
        const [url, init] = fetchMock.mock.calls[0]
        expect(url).toBe('/api/rooms/ski-trip-x7k2m9/expenses')
        expect(init.method).toBe('POST')
        expect(init.headers['X-Member-Token']).toBe('tok_abc')
        expect(JSON.parse(init.body).amountMinor).toBe('12000')
    })

    it('omits the token header when this device has no token', async () => {
        const fetchMock = respondWith(200, {})
        vi.stubGlobal('fetch', fetchMock)
        await api.deleteExpense('room-a', 'e1', undefined)
        expect(fetchMock.mock.calls[0][1].headers['X-Member-Token']).toBeUndefined()
    })

    it('url-encodes path segments', async () => {
        const fetchMock = respondWith(200, {})
        vi.stubGlobal('fetch', fetchMock)
        await api.room('weird/slug')
        expect(fetchMock.mock.calls[0][0]).toBe('/api/rooms/weird%2Fslug')
    })

    it('injects a stored queue key into legacy expense bodies on replay', async () => {
        const fetchMock = respondWith(201, {})
        vi.stubGlobal('fetch', fetchMock)
        await api.replayWrite({
            clientKey: 'legacy-queue-key-0001',
            endpoint: '/api/rooms/room-a/expenses',
            method: 'POST',
            body: {
                description: 'Dinner',
                amountMinor: '2000',
                currency: 'EUR',
                paidById: 'm1',
                splitMode: 'EQUAL',
            },
        })

        expect(JSON.parse(fetchMock.mock.calls[0][1].body).clientKey).toBe('legacy-queue-key-0001')
    })
})
