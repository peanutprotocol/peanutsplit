import { afterEach, describe, expect, it, vi } from 'vitest'
import { encodeRoomDrawing } from './room-drawing'
import {
    ApiRequestError,
    EXPENSE_WRITE_TIMEOUT_MS,
    MEMBER_TOKEN_INVALID_EVENT,
    NETWORK_ERROR_CODE,
    api,
    isApiError,
    isCatchUpRowChange,
    isCatchUpReviewChange,
} from './api'

const respondWith = (status: number, body: unknown, ok = status < 400) => {
    const text = typeof body === 'string' ? body : JSON.stringify(body)
    return vi.fn().mockResolvedValue({ ok, status, text: () => Promise.resolve(text) } as unknown as Response)
}

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

const hangUntilAborted = () =>
    vi.fn((_url: string | URL | Request, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal
            if (!signal) return
            const rejectAbort = () => reject(new DOMException('aborted', 'AbortError'))
            if (signal.aborted) rejectAbort()
            else signal.addEventListener('abort', rejectAbort, { once: true })
        })
    })

describe('api error paths', () => {
    const invalidTokenResponse = () =>
        respondWith(403, {
            error: { code: 'MEMBER_TOKEN_INVALID', message: 'member proof is stale' },
        })

    const invalidationEvents = () => {
        const dispatched: Array<{ type: string; detail: unknown }> = []
        vi.stubGlobal('window', { dispatchEvent: (event: { type: string; detail: unknown }) => dispatched.push(event) })
        vi.stubGlobal(
            'CustomEvent',
            class {
                readonly detail: unknown
                constructor(
                    readonly type: string,
                    init: { detail: unknown }
                ) {
                    this.detail = init.detail
                }
            }
        )
        return dispatched
    }

    it('invalidates an identity claimed by a stale attribution header', async () => {
        const events = invalidationEvents()
        vi.stubGlobal('fetch', invalidTokenResponse())

        await api.deleteExpense('room-a', 'e1', 'old-header-token').catch(() => {})

        expect(events).toEqual([{ type: MEMBER_TOKEN_INVALID_EVENT, detail: { token: 'old-header-token' } }])
    })

    it('invalidates reaction and push proofs carried in JSON bodies', async () => {
        const events = invalidationEvents()
        vi.stubGlobal('fetch', invalidTokenResponse())

        await api.reactions.add('e1', { emoji: '❤️', memberId: 'm1', memberToken: 'old-body-token' }).catch(() => {})
        await api.push
            .status('room-a', { endpoint: 'https://push.example/1', memberId: 'm1', memberToken: 'old-push-token' })
            .catch(() => {})

        expect(events).toEqual([
            { type: MEMBER_TOKEN_INVALID_EVENT, detail: { token: 'old-body-token' } },
            { type: MEMBER_TOKEN_INVALID_EVENT, detail: { token: 'old-push-token' } },
        ])
    })

    it('recognizes every stale catch-up row as a review change', () => {
        for (const code of [
            'CATCH_UP_REVIEW_CONFLICT',
            'EXPENSE_DELETED',
            'EXPENSE_NOT_FOUND',
            'NOT_A_MEMBER',
            'MEMBER_FORMER',
        ]) {
            expect(isCatchUpReviewChange(new ApiRequestError(409, code, 'changed'))).toBe(true)
        }
        expect(isCatchUpReviewChange(new ApiRequestError(500, 'UNKNOWN', 'failed'))).toBe(false)

        for (const code of ['CATCH_UP_REVIEW_CONFLICT', 'EXPENSE_DELETED', 'EXPENSE_NOT_FOUND']) {
            expect(isCatchUpRowChange(new ApiRequestError(409, code, 'changed'))).toBe(true)
        }
        expect(isCatchUpRowChange(new ApiRequestError(409, 'NOT_A_MEMBER', 'changed'))).toBe(false)
    })

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
    it('posts private feedback without copying member identity into the request', async () => {
        const fetchMock = respondWith(201, { reportId: 'report-1' })
        vi.stubGlobal('fetch', fetchMock)

        await api.feedback.report('ski/trip', {
            message: 'The button did not react after I tapped it.',
            consent: { confirmed: true, diagnostics: false, roomSnapshot: false, screenshot: false },
        })

        const [url, init] = fetchMock.mock.calls[0]
        expect(url).toBe('/api/rooms/ski%2Ftrip/feedback')
        expect(init.method).toBe('POST')
        expect(init.headers['X-Member-Token']).toBeUndefined()
        expect(JSON.parse(init.body)).toEqual({
            message: 'The button did not react after I tapped it.',
            consent: { confirmed: true, diagnostics: false, roomSnapshot: false, screenshot: false },
        })
    })

    it('posts an append import to the encoded room route with attribution and no invented timestamp', async () => {
        const fetchMock = respondWith(200, {})
        vi.stubGlobal('fetch', fetchMock)

        await api.importIntoRoom(
            'ski/trip',
            {
                members: [
                    { sourceName: 'Ana', memberId: 'ana' },
                    { sourceName: 'Bruno', newMemberName: 'Bruno B.' },
                ],
                expenses: [
                    {
                        date: '2026-08-04',
                        description: 'Dinner',
                        currencyCode: 'EUR',
                        costMinor: '4000',
                        paidBy: 'Ana',
                        shares: [
                            { member: 'Ana', amountMinor: '2000' },
                            { member: 'Bruno', amountMinor: '2000' },
                        ],
                    },
                ],
            },
            'tok_abc'
        )

        const [url, init] = fetchMock.mock.calls[0]
        const body = JSON.parse(init.body)
        expect(url).toBe('/api/rooms/ski%2Ftrip/import')
        expect(init.method).toBe('POST')
        expect(init.headers['X-Member-Token']).toBe('tok_abc')
        expect(body.members).toEqual([
            { sourceName: 'Ana', memberId: 'ana' },
            { sourceName: 'Bruno', newMemberName: 'Bruno B.' },
        ])
        expect(body.expenses[0]).not.toHaveProperty('createdAt')
        expect(body.expenses[0]).not.toHaveProperty('clientKey')
    })

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

    it('forwards an optional abort signal with a receipt parse', async () => {
        const fetchMock = respondWith(200, { items: [], suggestedTotalMinor: '0' })
        vi.stubGlobal('fetch', fetchMock)
        const controller = new AbortController()

        await api.receipt.parse(
            'ski-trip-x7k2m9',
            { imageBase64: '/9j/AAAAAAAAAAAA', mimeType: 'image/jpeg' },
            undefined,
            controller.signal
        )

        expect(fetchMock.mock.calls[0]?.[1].signal).toBe(controller.signal)
    })

    it('patches a catch-up command through the existing expense endpoint', async () => {
        const fetchMock = respondWith(200, {})
        vi.stubGlobal('fetch', fetchMock)
        await api.catchUpExpense(
            'ski/trip',
            'expense/1',
            {
                action: 'add',
                memberId: 'm3',
                expectedDescription: 'Dinner',
                expectedAmountMinor: '3000',
                expectedBaseAmountMinor: '3000',
                expectedCurrency: 'EUR',
                expectedFxRate: '1',
                expectedPaidById: 'm1',
                expectedDate: '2026-08-03T12:00:00.000Z',
                expectedCategory: null,
                expectedParticipantIds: ['m1', 'm2'],
            },
            'tok_abc'
        )

        const [url, init] = fetchMock.mock.calls[0]
        expect(url).toBe('/api/rooms/ski%2Ftrip/expenses/expense%2F1')
        expect(init.method).toBe('PATCH')
        expect(init.headers['X-Member-Token']).toBe('tok_abc')
        expect(JSON.parse(init.body)).toEqual({
            operation: 'CATCH_UP_EQUAL_PARTICIPANT',
            action: 'add',
            memberId: 'm3',
            expectedDescription: 'Dinner',
            expectedAmountMinor: '3000',
            expectedBaseAmountMinor: '3000',
            expectedCurrency: 'EUR',
            expectedFxRate: '1',
            expectedPaidById: 'm1',
            expectedDate: '2026-08-03T12:00:00.000Z',
            expectedCategory: null,
            expectedParticipantIds: ['m1', 'm2'],
        })
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

    it('bypasses browser caches for private room state and history reads', async () => {
        const fetchMock = respondWith(200, {})
        vi.stubGlobal('fetch', fetchMock)

        await api.room('ski-trip-aaa')
        await api.roomHistory('ski-trip-aaa')

        expect(fetchMock.mock.calls[0][1].cache).toBe('no-store')
        expect(fetchMock.mock.calls[1][1].cache).toBe('no-store')
    })

    /** The drawing rides the room PATCH, and it must send ONLY the drawing: a
     *  body carrying the name too would rename the room on every pick. */
    it('sends the room drawing as an emoji-only PATCH, including the null reset', async () => {
        const fetchMock = respondWith(200, {})
        vi.stubGlobal('fetch', fetchMock)

        await api.setEmblem('ski-trip-aaa', 'mountain')
        expect(fetchMock.mock.calls[0][0]).toBe('/api/rooms/ski-trip-aaa')
        expect(fetchMock.mock.calls[0][1].method).toBe('PATCH')
        expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ emoji: 'mountain' }))

        await api.setEmblem('ski-trip-aaa', null)
        expect(fetchMock.mock.calls[1][1].body).toBe(JSON.stringify({ emoji: null }))
    })

    it('sends custom room geometry without rewriting it', async () => {
        const fetchMock = respondWith(200, {})
        const custom = encodeRoomDrawing([[{ x: 0.5, y: 0.5 }]])
        vi.stubGlobal('fetch', fetchMock)

        await api.setEmblem('ski-trip-aaa', custom)
        expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ emoji: custom }))
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

    it('maps an initial expense timeout to NETWORK_ERROR without changing its client key', async () => {
        vi.useFakeTimers()
        const fetchMock = hangUntilAborted()
        vi.stubGlobal('fetch', fetchMock)

        const result = api
            .addExpense('room-a', {
                clientKey: 'first-attempt-key-0001',
                description: 'Dinner',
                amountMinor: '2000',
                currency: 'EUR',
                paidById: 'm1',
                splitMode: 'EQUAL',
            })
            .catch((error) => error)
        await vi.advanceTimersByTimeAsync(EXPENSE_WRITE_TIMEOUT_MS)

        const failure = await result
        expect(isApiError(failure, NETWORK_ERROR_CODE)).toBe(true)
        expect(failure.status).toBe(0)
        expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string).clientKey).toBe('first-attempt-key-0001')
    })

    it('maps a queued replay timeout to NETWORK_ERROR and reuses the stored client key', async () => {
        vi.useFakeTimers()
        const fetchMock = hangUntilAborted()
        vi.stubGlobal('fetch', fetchMock)

        const result = api
            .replayWrite({
                clientKey: 'queued-replay-key-0001',
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
            .catch((error) => error)
        await vi.advanceTimersByTimeAsync(EXPENSE_WRITE_TIMEOUT_MS)

        const failure = await result
        expect(isApiError(failure, NETWORK_ERROR_CODE)).toBe(true)
        expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string).clientKey).toBe('queued-replay-key-0001')
    })
})
