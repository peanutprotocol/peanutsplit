/**
 * The typed HTTP client. Every call goes through `request`, so there is exactly
 * one place that knows the error envelope, the member-token header, and the fact
 * that money is a string on the wire (nothing here ever touches BigInt or Number).
 */

import type {
    CatchUpExpenseInput,
    CatchUpExpenseResult,
    CreateMemberInput,
    CreateRoomInput,
    CurrencyInfo,
    ExpenseCreateResult,
    ExpenseInput,
    ExpenseUpdateInput,
    ImportIntoRoomInput,
    ImportIntoRoomResult,
    ImportRoomInput,
    MemberAvatarInput,
    ModelStatus,
    ParsedReceipt,
    PushSubscribeInput,
    PushUnsubscribeInput,
    ReceiptParseInput,
    ReactionInput,
    RoomHistoryPage,
    RoomState,
    RoomStateWithAddedMember,
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

const CATCH_UP_ROW_CHANGE_CODES = new Set(['CATCH_UP_REVIEW_CONFLICT', 'EXPENSE_DELETED', 'EXPENSE_NOT_FOUND'])
const CATCH_UP_REVIEW_CHANGE_CODES = new Set([...CATCH_UP_ROW_CHANGE_CODES, 'NOT_A_MEMBER'])

/** Row-scoped conflicts may be skipped while a reviewed batch continues. */
export const isCatchUpRowChange = (error: unknown): boolean =>
    isApiError(error) && CATCH_UP_ROW_CHANGE_CODES.has(error.code)

/** Errors that mean the reviewed row no longer exists in the confirmed form. */
export const isCatchUpReviewChange = (error: unknown): boolean =>
    isApiError(error) && CATCH_UP_REVIEW_CHANGE_CODES.has(error.code)

/** Transport failure — offline, DNS, connection reset. Status 0 by convention. */
export const NETWORK_ERROR_CODE = 'NETWORK_ERROR'

/** A write that never answers is indistinguishable from a broken connection to
 *  the person holding the phone. Expense creates are safe to retry because
 *  their client key is minted before the first attempt and reused on replay. */
export const EXPENSE_WRITE_TIMEOUT_MS = 12_000

interface RequestOptions {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
    body?: unknown
    /** Sent as `X-Member-Token`. Attribution only — absence never blocks a write. */
    token?: string | null
    signal?: AbortSignal
    timeoutMs?: number
    /** Explicit browser-cache policy for private GETs. */
    cache?: RequestCache
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, token, signal, timeoutMs, cache } = options
    const headers: Record<string, string> = {}
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (token) headers['X-Member-Token'] = token

    const timeoutController = timeoutMs === undefined ? null : new AbortController()
    let timedOut = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    let forwardAbort: (() => void) | undefined
    if (timeoutController) {
        if (signal?.aborted) {
            timeoutController.abort(signal.reason)
        } else if (signal) {
            forwardAbort = () => timeoutController.abort(signal.reason)
            signal.addEventListener('abort', forwardAbort, { once: true })
        }
        timeout = setTimeout(() => {
            timedOut = true
            timeoutController.abort()
        }, timeoutMs)
    }

    let response: Response
    let text: string
    try {
        response = await fetch(path, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: timeoutController?.signal ?? signal,
            cache,
        })
        // Keep the deadline through the body read too: response headers alone do
        // not mean the write has produced an answer the queue can act on.
        text = await response.text()
    } catch (error) {
        if (timedOut)
            throw new ApiRequestError(0, NETWORK_ERROR_CODE, 'the server took too long to respond — try again')
        if (error instanceof DOMException && error.name === 'AbortError') throw error
        throw new ApiRequestError(0, NETWORK_ERROR_CODE, 'could not reach the server — check your connection')
    } finally {
        if (timeout !== undefined) clearTimeout(timeout)
        if (signal && forwardAbort) signal.removeEventListener('abort', forwardAbort)
    }

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

export interface IndicativeRateQuote {
    from: string
    to: string
    rate: number | null
    source: string
    indicative: true
}

/** Exported because the offline queue stores the endpoint it is holding a write
 *  for, and two places building the same path is how they drift apart. */
export const expensesPath = (slug: string): string => `/api/rooms/${encode(slug)}/expenses`

export const api = {
    currencies: (signal?: AbortSignal) =>
        request<{ currencies: CurrencyInfo[] }>('/api/currencies', { signal }).then((r) => r.currencies),

    /** Indicative only — every surface that renders this must say so. */
    rate: (from: string, to: string, signal?: AbortSignal) =>
        request<IndicativeRateQuote>(`/api/rate?from=${encode(from)}&to=${encode(to)}`, { signal }),

    createRoom: (input: CreateRoomInput) => request<RoomStateWithMember>('/api/rooms', { method: 'POST', body: input }),

    /** A whole room from a parsed Splitwise export. The CSV itself is never sent — the browser
     *  parses it and posts the result, so the file stays on the device that opened it. */
    importRoom: (input: ImportRoomInput) =>
        request<RoomStateWithMember>('/api/import', { method: 'POST', body: input }),

    /** Append parsed source data to an existing room. New mapped people and every expense are
     *  one atomic write; the optional member token is attribution, never authorization. */
    importIntoRoom: (slug: string, input: ImportIntoRoomInput, token?: string | null) =>
        request<ImportIntoRoomResult>(`/api/rooms/${encode(slug)}/import`, {
            method: 'POST',
            body: input,
            token,
        }),

    room: (slug: string, signal?: AbortSignal) =>
        request<RoomState>(`/api/rooms/${encode(slug)}`, { signal, cache: 'no-store' }),

    roomHistory: (slug: string, cursor?: string | null, signal?: AbortSignal) =>
        request<RoomHistoryPage>(`/api/rooms/${encode(slug)}/history${cursor ? `?cursor=${encode(cursor)}` : ''}`, {
            signal,
            cache: 'no-store',
        }),

    joinRoom: (slug: string, input: CreateMemberInput) =>
        request<RoomStateWithMember>(`/api/rooms/${encode(slug)}/members`, {
            method: 'POST',
            body: { ...input, intent: 'join' },
        }),

    addMember: (slug: string, input: CreateMemberInput, token?: string | null) =>
        request<RoomStateWithAddedMember>(`/api/rooms/${encode(slug)}/members`, {
            method: 'POST',
            body: { ...input, intent: 'add' },
            token,
        }),

    deleteMember: (slug: string, memberId: string, token?: string | null) =>
        request<RoomState>(`/api/rooms/${encode(slug)}/members/${encode(memberId)}`, { method: 'DELETE', token }),

    claimMember: (slug: string, memberId: string) =>
        request<RoomStateWithMember>(`/api/rooms/${encode(slug)}/members/${encode(memberId)}/claim`, {
            method: 'POST',
        }),

    addExpense: (slug: string, input: ExpenseInput, token?: string | null) =>
        request<ExpenseCreateResult>(expensesPath(slug), {
            method: 'POST',
            body: input,
            token,
            timeoutMs: EXPENSE_WRITE_TIMEOUT_MS,
        }),

    updateExpense: (slug: string, id: string, input: ExpenseUpdateInput, token?: string | null) =>
        request<RoomState>(`/api/rooms/${encode(slug)}/expenses/${encode(id)}`, {
            method: 'PATCH',
            body: input,
            token,
        }),

    catchUpExpense: (slug: string, id: string, input: CatchUpExpenseInput, token?: string | null) =>
        request<CatchUpExpenseResult>(`/api/rooms/${encode(slug)}/expenses/${encode(id)}`, {
            method: 'PATCH',
            body: { operation: 'CATCH_UP_EQUAL_PARTICIPANT', ...input },
            token,
            timeoutMs: EXPENSE_WRITE_TIMEOUT_MS,
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
    replayWrite: (write: {
        clientKey: string
        endpoint: string
        method: 'POST'
        body: ExpenseInput
        token?: string | null
    }) =>
        request<RoomState>(write.endpoint, {
            method: write.method,
            // Old queue records kept the stable key outside the body. Injecting
            // it here upgrades those records at replay time too.
            body: { ...write.body, clientKey: write.clientKey },
            token: write.token,
            timeoutMs: EXPENSE_WRITE_TIMEOUT_MS,
        }),

    /**
     * Whether this deployment can read a bill photo. A capability probe, not a
     * feature flag: the key lives on the server, so a `NEXT_PUBLIC_` value baked
     * at build time could not tell the truth about it.
     */
    modelStatus: (slug: string, signal?: AbortSignal) =>
        request<ModelStatus>(`/api/rooms/${encode(slug)}/receipt-parse`, { signal }),

    /** Bill photo → line items. */
    receipt: {
        parse: (slug: string, input: ReceiptParseInput, token?: string | null, signal?: AbortSignal) =>
            request<ParsedReceipt>(`/api/rooms/${encode(slug)}/receipt-parse`, {
                method: 'POST',
                body: input,
                token,
                signal,
            }),
    },

    /** Room presentation. No token: the slug is the credential, same as every
     *  other room write — see the route for why. The display name changes
     *  without changing that slug. */
    setRoomName: (slug: string, name: string, token?: string | null) =>
        request<RoomState>(`/api/rooms/${encode(slug)}`, { method: 'PATCH', body: { name }, token }),

    setTheme: (slug: string, theme: string | null, token?: string | null) =>
        request<RoomState>(`/api/rooms/${encode(slug)}`, { method: 'PATCH', body: { theme }, token }),

    /** The room's drawing. Same PATCH and same credential as the name, because in
     *  the sheet they are one control: the drawing follows the name until
     *  somebody overrules it, and `null` hands it back to the name. */
    setEmblem: (slug: string, emoji: string | null, token?: string | null) =>
        request<RoomState>(`/api/rooms/${encode(slug)}`, { method: 'PATCH', body: { emoji }, token }),

    /** One member's playful persona. Like the roster and ledger, this is a
     *  shared-room edit: the room link is the credential. */
    setMemberAvatar: (slug: string, memberId: string, input: MemberAvatarInput, token?: string | null) =>
        request<RoomState>(`/api/rooms/${encode(slug)}/members/${encode(memberId)}`, {
            method: 'PATCH',
            body: input,
            token,
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

        /** `endpointStillUsed` is false only when no other room wants this
         *  browser channel — the one case where it is safe to drop it. */
        unsubscribe: (slug: string, input: PushUnsubscribeInput) =>
            request<{ subscribed: false; endpointStillUsed: boolean }>(
                `/api/rooms/${encode(slug)}/push-subscriptions`,
                { method: 'DELETE', body: input }
            ),

        /** Whether this endpoint is registered for THIS room. POST because the
         *  endpoint carries a device token that must never reach a URL. */
        status: (slug: string, input: { endpoint: string; memberId: string; memberToken: string }) =>
            request<{ subscribed: boolean }>(`/api/rooms/${encode(slug)}/push-subscriptions/status`, {
                method: 'POST',
                body: input,
            }),
    },
}
