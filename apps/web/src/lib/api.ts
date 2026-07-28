/**
 * The typed HTTP client. Every call goes through `request`, so there is exactly
 * one place that knows the error envelope, the member-token header, and the fact
 * that money is a string on the wire (nothing here ever touches BigInt or Number).
 */

import type {
    AccountRoom,
    AccountSummary,
    AttachResult,
    CreateMemberInput,
    CreateRoomInput,
    CurrencyInfo,
    ExpenseInput,
    ImportRoomInput,
    MemberAvatarInput,
    MembershipClaim,
    ModelStatus,
    NlParseInput,
    NlParseResult,
    ParsedReceipt,
    PushSubscribeInput,
    PushUnsubscribeInput,
    ReceiptParseInput,
    ReactionInput,
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

/** Exported because the offline queue stores the endpoint it is holding a write
 *  for, and two places building the same path is how they drift apart. */
export const expensesPath = (slug: string): string => `/api/rooms/${encode(slug)}/expenses`

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

    /** A whole room from a parsed Splitwise export. The CSV itself is never sent — the browser
     *  parses it and posts the result, so the file stays on the device that opened it. */
    importRoom: (input: ImportRoomInput) =>
        request<RoomStateWithMember>('/api/import', { method: 'POST', body: input }),

    room: (slug: string, signal?: AbortSignal) => request<RoomState>(`/api/rooms/${encode(slug)}`, { signal }),

    joinRoom: (slug: string, input: CreateMemberInput) =>
        request<RoomStateWithMember>(`/api/rooms/${encode(slug)}/members`, { method: 'POST', body: input }),

    addExpense: (slug: string, input: ExpenseInput, token?: string | null) =>
        request<RoomState>(expensesPath(slug), { method: 'POST', body: input, token }),

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

    /**
     * Replay a write the offline queue has been holding. Deliberately generic —
     * the queue stores what it stored (endpoint, method, body, token) and does
     * not re-derive a call from it, so a record written by an older build still
     * replays exactly as it was captured.
     */
    replayWrite: (write: { endpoint: string; method: 'POST'; body: unknown; token?: string | null }) =>
        request<RoomState>(write.endpoint, { method: write.method, body: write.body, token: write.token }),

    /**
     * The account endpoints. Authentication is the sealed `ps-session` cookie,
     * so nothing here takes a credential argument — `fetch` sends it because
     * every call is same-origin.
     */
    account: {
        me: (signal?: AbortSignal) => request<AccountSummary | null>('/api/auth/me', { signal }),

        /** Always resolves the same way whether or not the address is known —
         *  the answer carries no information, on purpose. */
        requestLink: (email: string) =>
            request<{ ok: true }>('/api/auth/request-link', { method: 'POST', body: { email } }),

        logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),

        attach: (memberships: MembershipClaim[]) =>
            request<{ results: AttachResult[] }>('/api/auth/attach', {
                method: 'POST',
                body: { memberships },
            }).then((r) => r.results),

        rooms: (signal?: AbortSignal) =>
            request<{ rooms: AccountRoom[] }>('/api/auth/rooms', { signal }).then((r) => r.rooms),
    },

    /**
     * Whether this deployment can read a bill photo OR a typed line. A capability
     * probe, not a feature flag: the key lives on the server, so a `NEXT_PUBLIC_`
     * value baked at build time could not tell the truth about it.
     *
     * It is served off the receipt-parse path because one key gates both
     * features — a second endpoint answering the same boolean would be a second
     * thing to keep in agreement with this one.
     */
    modelStatus: (slug: string, signal?: AbortSignal) =>
        request<ModelStatus>(`/api/rooms/${encode(slug)}/receipt-parse`, { signal }),

    /** Bill photo → line items. */
    receipt: {
        parse: (slug: string, input: ReceiptParseInput, token?: string | null) =>
            request<ParsedReceipt>(`/api/rooms/${encode(slug)}/receipt-parse`, {
                method: 'POST',
                body: input,
                token,
            }),
    },

    /** Typed line → one expense draft. Writes nothing, so it carries no member
     *  token: there is no row for it to be attributed to. The draft prefills the
     *  ordinary form and the ordinary save is still the only write. */
    parseExpenseText: (slug: string, input: NlParseInput) =>
        request<NlParseResult>(`/api/rooms/${encode(slug)}/parse-expense`, { method: 'POST', body: input }),

    /** The room's palette. No token: the slug is the credential, same as every
     *  other room write — see the route for why. */
    setTheme: (slug: string, theme: string | null) =>
        request<RoomState>(`/api/rooms/${encode(slug)}`, { method: 'PATCH', body: { theme } }),

    /** Your own avatar. The member is in the path and the token is in the body,
     *  because here the token is proof rather than attribution — see the route. */
    setMemberAvatar: (slug: string, memberId: string, input: MemberAvatarInput) =>
        request<RoomState>(`/api/rooms/${encode(slug)}/members/${encode(memberId)}`, {
            method: 'PATCH',
            body: input,
        }),

    /** Slug-free, like restore: the expense id is all a row ever holds. The
     *  token is in the body because the server treats it as proof here. */
    reactions: {
        add: (expenseId: string, input: ReactionInput) =>
            request<RoomState>(`/api/expenses/${encode(expenseId)}/reactions`, { method: 'POST', body: input }),

        remove: (expenseId: string, input: ReactionInput) =>
            request<RoomState>(`/api/expenses/${encode(expenseId)}/reactions`, { method: 'DELETE', body: input }),
    },

    /** Per room, per device. The member token travels in the body rather than
     *  the header here because the server treats it as proof, not attribution. */
    push: {
        subscribe: (slug: string, input: PushSubscribeInput) =>
            request<{ subscribed: true }>(`/api/rooms/${encode(slug)}/push-subscriptions`, {
                method: 'POST',
                body: input,
            }),

        unsubscribe: (slug: string, input: PushUnsubscribeInput) =>
            request<{ subscribed: false }>(`/api/rooms/${encode(slug)}/push-subscriptions`, {
                method: 'DELETE',
                body: input,
            }),
    },
}
