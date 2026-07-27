/**
 * The wire contract between the API routes and the client. Shared by both sides —
 * server code builds these, client code consumes them.
 *
 * Money is ALWAYS a decimal string of minor units ("1234" = €12.34). Never a
 * number: JSON has no BigInt and floats lose cents.
 */

export type SplitMode = 'EQUAL' | 'EXACT'

/** Free-form on the wire; the UI knows about these three. */
export type SettlementMethod = 'cash' | 'bank' | 'peanut'

export interface CurrencyInfo {
    code: string
    symbol: string
    name: string
    decimals: number
}

export interface ApiRoom {
    id: string
    slug: string
    name: string
    emoji: string | null
    currency: string
    coverUrl: string | null
    createdAt: string
    archivedAt: string | null
}

export interface ApiMember {
    id: string
    name: string
    createdAt: string
}

export interface ApiShare {
    memberId: string
    /** Room currency, post-FX. */
    amountMinor: string
    /** EXACT splits: as typed, in the expense currency. null for EQUAL. */
    enteredAmountMinor: string | null
}

export interface ApiExpense {
    id: string
    description: string
    /** In `currency`. */
    amountMinor: string
    currency: string
    /** In the room currency — always equals the sum of `shares`. */
    baseAmountMinor: string
    /** Room-currency units per 1 unit of `currency`, frozen at write time. */
    fxRate: string
    splitMode: SplitMode
    paidById: string
    createdById: string | null
    /** User-editable expense date — display this, not createdAt. */
    date: string
    category: string | null
    createdAt: string
    shares: ApiShare[]
}

export interface ApiSettlement {
    id: string
    fromId: string
    toId: string
    createdById: string | null
    /** Room currency. */
    amountMinor: string
    method: SettlementMethod | string | null
    note: string | null
    createdAt: string
}

/** Directly postable to POST /api/rooms/:slug/settlements. */
export interface ApiTransfer {
    fromId: string
    toId: string
    amountMinor: string
}

export interface RoomState {
    room: ApiRoom
    members: ApiMember[]
    /** Non-deleted only, newest expense date first. */
    expenses: ApiExpense[]
    settlements: ApiSettlement[]
    /** memberId → net position in room-currency minor units. Sums to "0". */
    balances: Record<string, string>
    suggestedTransfers: ApiTransfer[]
}

/** Room and member creation return the state plus the one-time member token. */
export interface RoomStateWithMember extends RoomState {
    memberId: string
    /** Returned ONCE. Client stores it and sends it as `X-Member-Token`. */
    memberToken: string
}

export interface ApiError {
    error: { code: string; message: string }
}

// ─── request bodies ─────────────────────────────────────────────────────────

export interface CreateRoomInput {
    name: string
    emoji?: string | null
    currency: string
    creatorName: string
}

export interface CreateMemberInput {
    name: string
}

export interface ExpenseInput {
    description: string
    amountMinor: string
    currency: string
    paidById: string
    splitMode: SplitMode
    /** EQUAL: defaults to every member in the room. */
    participantIds?: string[]
    /** EXACT: must add up to amountMinor, in the expense currency. */
    exactShares?: { memberId: string; amountMinor: string }[]
    date?: string
    category?: string | null
}

export interface SettlementInput {
    fromId: string
    toId: string
    amountMinor: string
    method?: SettlementMethod | string | null
    note?: string | null
}
