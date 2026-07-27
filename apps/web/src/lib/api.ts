/**
 * The typed HTTP client. Every call goes through `request`, so there is exactly
 * one place that knows the error envelope, the member-token header, and the fact
 * that money is a string on the wire (nothing here ever touches BigInt or Number).
 */

import type {
    CreateMemberInput,
    CreateRoomInput,
    CurrencyInfo,
    ExpenseInput,
    RoomState,
    RoomStateWithMember,
    SettlementInput,
} from './api-types'

/** Every non-2xx response, plus transport failures, surfaces as this. */
export class ApiRequestError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
        message: string
    ) {
        super(message)
        this.name = 'ApiRequestError'
    }
}

export const isApiError = (error: unknown, code?: string): error is ApiRequestError =>
    error instanceof ApiRequestError && (code === undefined || error.code === code)

/** Transport failure — offline, DNS, connection reset. Status 0 by convention. */
export const NETWORK_ERROR_CODE = 'NETWORK_ERROR'

interface RequestOptions {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
    body?: unknown
    /** Sent as `X-Member-Token`. Attribution only — absence never blocks a write. */
    token?: string | null
    signal?: AbortSignal
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, token, signal } = options
    const headers: Record<string, string> = {}
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (token) headers['X-Member-Token'] = token

    let response: Response
    try {
        response = await fetch(path, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
            signal,
        })
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error
        throw new ApiRequestError(0, NETWORK_ERROR_CODE, 'could not reach the server — check your connection')
    }

    const text = await response.text()
    let payload: unknown = undefined
    if (text.length > 0) {
        try {
            payload = JSON.parse(text)
        } catch {
            payload = undefined
        }
    }

    if (!response.ok) {
        const envelope = (payload as { error?: { code?: unknown; message?: unknown } } | undefined)?.error
        const code = typeof envelope?.code === 'string' ? envelope.code : 'UNKNOWN'
        const message = typeof envelope?.message === 'string' ? envelope.message : 'something went wrong'
        throw new ApiRequestError(response.status, code, message)
    }

    return payload as T
}

const encode = encodeURIComponent

export const api = {
    currencies: (signal?: AbortSignal) =>
        request<{ currencies: CurrencyInfo[] }>('/api/currencies', { signal }).then((r) => r.currencies),

    /** Indicative only — every surface that renders this must say so. */
    rate: (from: string, to: string, signal?: AbortSignal) =>
        request<{ from: string; to: string; rate: number; source: string; indicative: true }>(
            `/api/rate?from=${encode(from)}&to=${encode(to)}`,
            { signal }
        ),

    createRoom: (input: CreateRoomInput) => request<RoomStateWithMember>('/api/rooms', { method: 'POST', body: input }),

    room: (slug: string, signal?: AbortSignal) => request<RoomState>(`/api/rooms/${encode(slug)}`, { signal }),

    joinRoom: (slug: string, input: CreateMemberInput) =>
        request<RoomStateWithMember>(`/api/rooms/${encode(slug)}/members`, { method: 'POST', body: input }),

    addExpense: (slug: string, input: ExpenseInput, token?: string | null) =>
        request<RoomState>(`/api/rooms/${encode(slug)}/expenses`, { method: 'POST', body: input, token }),

    updateExpense: (slug: string, id: string, input: ExpenseInput, token?: string | null) =>
        request<RoomState>(`/api/rooms/${encode(slug)}/expenses/${encode(id)}`, {
            method: 'PATCH',
            body: input,
            token,
        }),

    deleteExpense: (slug: string, id: string, token?: string | null) =>
        request<RoomState>(`/api/rooms/${encode(slug)}/expenses/${encode(id)}`, { method: 'DELETE', token }),

    /** Undo. Slug-free: the toast only ever holds the expense id. */
    restoreExpense: (id: string, token?: string | null) =>
        request<RoomState>(`/api/expenses/${encode(id)}/restore`, { method: 'POST', token }),

    addSettlement: (slug: string, input: SettlementInput, token?: string | null) =>
        request<RoomState>(`/api/rooms/${encode(slug)}/settlements`, { method: 'POST', body: input, token }),

    deleteSettlement: (slug: string, id: string, token?: string | null) =>
        request<RoomState>(`/api/rooms/${encode(slug)}/settlements/${encode(id)}`, { method: 'DELETE', token }),
}
