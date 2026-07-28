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

// ─── accounts ───────────────────────────────────────────────────────────────
// Mirrors of the types `server/accounts.ts` returns. Declared here rather than
// imported from there because that module pulls in Prisma: a type-only import
// erases at build, but it puts a server module on a client component's import
// graph, which is one refactor away from being a real one.

/** `GET /api/auth/me`. `null` is the normal answer — most people never sign in. */
export interface AccountSummary {
    userId: string
    email: string | null
}

/** One room the account has proved it belongs to, with the member token that
 *  reopens it on a device that has never seen the link. */
export interface AccountRoom {
    slug: string
    name: string
    emoji: string | null
    memberId: string
    memberName: string
    memberToken: string
}

/** What this device is asking the account to adopt. The token is the only proof
 *  the server accepts — see `attachMemberships`. */
export interface MembershipClaim {
    slug: string
    memberId: string
    token: string
}

export type AttachOutcome = 'linked' | 'already-linked' | 'token-mismatch'

export interface AttachResult {
    slug: string
    memberId: string
    outcome: AttachOutcome
}

// ─── push ───────────────────────────────────────────────────────────────────

export interface PushSubscribeInput {
    endpoint: string
    keys: { p256dh: string; auth: string }
    memberId: string
    /** Proof of membership. Unlike every other write, push registration is not
     *  satisfied by holding the room link. */
    memberToken: string
    userAgent?: string | null
}

export interface PushUnsubscribeInput {
    endpoint: string
    memberId: string
    memberToken: string
}
