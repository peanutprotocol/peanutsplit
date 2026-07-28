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
    /** A key into the catalog in `lib/themes.ts`. null = the default palette. */
    theme: string | null
    createdAt: string
    archivedAt: string | null
}

export interface ApiMember {
    id: string
    name: string
    /** A key from `lib/avatars.ts`. Null = the portrait drawn from the name. */
    avatar: string | null
    createdAt: string
}

export interface ApiShare {
    memberId: string
    /** Room currency, post-FX. */
    amountMinor: string
    /** EXACT splits: as typed, in the expense currency. null for EQUAL. */
    enteredAmountMinor: string | null
}

/** One person's one emoji. Counts and "is one of these mine" are derived on the
 *  client — see `groupReactions`. */
export interface ApiReaction {
    emoji: string
    memberId: string
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
    /** Oldest first, id as tiebreaker. Empty for an expense nobody reacted to. */
    reactions: ApiReaction[]
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

/** Creating a room, joining as new, and claiming an existing roster entry
 *  return room state plus the member identity envelope. */
export interface RoomStateWithMember extends RoomState {
    memberId: string
    /** Returned to the member's device. Client stores it and sends it as
     *  `X-Member-Token`; claiming reuses the existing value. */
    memberToken: string
}

/** Adding a payer on somebody else's behalf returns the new roster id but
 *  never crosses the HTTP boundary with that person's identity token. */
export interface RoomStateWithAddedMember extends RoomState {
    memberId: string
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
    /** Stable for one save attempt so a lost response can be replayed safely. */
    clientKey?: string
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

/** POST and DELETE /api/expenses/:id/reactions. The token is proof, not
 *  attribution, which is why it rides the body — see the route. */
export interface ReactionInput {
    emoji: string
    memberId: string
    memberToken: string
}

/** The member is named in the path; the token in the body is proof it is you. */
export interface MemberAvatarInput {
    /** A key from `lib/avatars.ts`, or null for the name-derived portrait. */
    avatar: string | null
    memberToken: string
}

export interface SettlementInput {
    /** Stable across retries of the same real-world payment. */
    clientKey?: string
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

// ─── receipt scan ───────────────────────────────────────────────────────────
// A scan is a DRAFT, not a write. Nothing here is stored anywhere: the image is
// forwarded once and dropped, and the reviewed result leaves as an ordinary
// `ExpenseInput`. Amounts follow the same rule as the rest of this file — minor
// units, as a decimal string.

export interface ReceiptItem {
    label: string
    /** Minor units of `ParsedReceipt.currency`. */
    amountMinor: string
    /** As printed on the bill. Display only — `amountMinor` is the line total. */
    quantity: number | null
}

export interface ParsedReceipt {
    items: ReceiptItem[]
    /** The server's own sum of `items` — never the model's arithmetic. */
    suggestedTotalMinor: string
    /** The total printed on the receipt, when one was read. Kept beside the sum
     *  rather than reconciled with it, so a disagreement can be shown. */
    receiptTotalMinor: string | null
    /** ISO-4217, and only if the app supports it. Null → use the room's. */
    currency: string | null
    merchant: string | null
    /** YYYY-MM-DD. */
    date: string | null
}

/**
 * `GET /api/rooms/:slug/receipt-parse` — whether this deployment has a model key
 * at all. One key gates BOTH typing-removers, scanning and quick add, so this is
 * the answer for both and there is no second probe.
 */
export interface ModelStatus {
    enabled: boolean
}

export interface ReceiptParseInput {
    /** Raw base64, no `data:` prefix. */
    imageBase64: string
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
}

// ─── quick add ──────────────────────────────────────────────────────────────
// A typed line becomes a DRAFT, never an expense: it prefills the same form a
// hand-typed expense is saved from. Nulls mean "the text did not say" and the
// form keeps what it had — see `lib/quick-add.ts`.

export interface NlParseInput {
    /** One line, typed or pasted. Bounded by `MAX_NL_TEXT_CHARS`. */
    text: string
}

export interface NlDraft {
    description: string | null
    /** Minor units of `currency`, or of the room's when that is null. */
    amountMinor: string
    currency: string | null
    /** YYYY-MM-DD. */
    date: string | null
    paidById: string | null
    /** Null means everyone — different from an empty list. */
    participantIds: string[] | null
}

export interface NlParseResult {
    draft: NlDraft
    /** Names the text stated that the roster could not resolve. The server never
     *  guesses between two candidates; these are shown so a person can pick. */
    unmatchedNames: string[]
}

// ─── splitwise import ───────────────────────────────────────────────────────
// Structurally the parser's own output (`lib/splitwise-csv.ts`), re-declared here for the same
// reason the account types are: this file is the wire contract and must not depend on the module
// that happens to produce it today.

export interface ImportedShareInput {
    /** Member display name, as it appears in `members`. Names are the join key — an import has no
     *  ids yet, because none of these people exist server-side until the room does. */
    member: string
    /** In the expense's own currency. */
    amountMinor: string
}

export interface ImportedExpenseInput {
    /** Calendar day, YYYY-MM-DD. Splitwise records a day, not an instant. */
    date: string
    description: string
    category?: string | null
    currencyCode: string
    costMinor: string
    paidBy: string
    /**
     * How the row divided. Absent means EXACT, which is what every import sent
     * before this field existed and what an import should default to: the shares
     * below are the truth either way, and this only decides which mode the
     * expense opens in when somebody edits it later.
     */
    splitMode?: SplitMode
    /** Must add up to `costMinor` exactly. */
    shares: ImportedShareInput[]
}

/** POST /api/import — a whole room in one body. */
export interface ImportRoomInput {
    roomName: string
    emoji?: string | null
    /** What the room settles in. Expenses in other currencies are converted at import time. */
    currency: string
    /** Must be one of `members`; that member gets the token back. */
    creatorName: string
    members: string[]
    expenses: ImportedExpenseInput[]
}
