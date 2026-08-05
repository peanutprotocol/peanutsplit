/**
 * The wire contract between the API routes and the client. Shared by both sides —
 * server code builds these, client code consumes them.
 *
 * Money is ALWAYS a decimal string of minor units ("1234" = €12.34). Never a
 * number: JSON has no BigInt and floats lose cents.
 */

export type SplitMode = 'EQUAL' | 'EXACT' | 'PERCENTAGE' | 'SHARES'

/** Free-form on the wire; the UI knows about these three. */
export type SettlementMethod = 'cash' | 'bank' | 'peanut'

export interface CurrencyInfo {
    code: string
    symbol: string
    name: string
    decimals: number
    /** The rate feed carries this code, so it can be converted. A currency can be used in a room
     *  when it IS the room currency, or when both it and the room currency have a rate. */
    hasRate: boolean
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
}

export interface ApiMember {
    id: string
    name: string
    /** A key from `lib/avatars.ts`. Null exists only for legacy/pre-migration rows. */
    avatar: string | null
    /** A key from `lib/avatar-palettes.ts`. Optional only for older cached responses. */
    avatarPalette?: string | null
    createdAt: string
    /** Only untouched names added on somebody else's behalf can be removed. */
    canRemove?: boolean
}

export interface ApiShare {
    memberId: string
    /** Room currency, post-FX. */
    amountMinor: string
    /** EXACT splits: as typed, in the expense currency. null for EQUAL. */
    enteredAmountMinor: string | null
    /** PERCENTAGE: basis points. SHARES: relative integer weight. null for EQUAL/EXACT. */
    splitWeight: string | null
}

/** One person's one emoji. Counts and "is one of these mine" are derived on the
 *  client — see `groupReactions`. */
export interface ApiReaction {
    emoji: string
    memberId: string
}

export interface ApiExpense {
    id: string
    /** Empty when the expense was saved without a name. Render it through
     *  `expenseLabel` (`lib/dates.ts`), never on its own. */
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
    /** User-pasted documentation; Split never fetches or verifies it. */
    receiptUrl?: string | null
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

export type RoomHistoryAction =
    | 'history_started'
    | 'room_created'
    | 'room_imported'
    | 'room_import_appended'
    | 'room_settings_updated'
    | 'member_joined'
    | 'member_added'
    | 'member_removed'
    | 'member_avatar_updated'
    | 'expense_added'
    | 'expense_edited'
    | 'expense_deleted'
    | 'expense_restored'
    | 'reaction_added'
    | 'reaction_removed'
    | 'settlement_recorded'
    | 'settlement_deleted'
    | 'push_subscribed'
    | 'push_unsubscribed'

export interface ApiRoomHistoryEvent {
    id: string
    action: RoomHistoryAction
    subjectType: string | null
    subjectId: string | null
    /** A room-local alias such as A or AA. The underlying device hash never leaves the server. */
    deviceLabel: string | null
    actorMemberId: string | null
    actorMemberName: string | null
    before: unknown
    after: unknown
    detail: unknown
    createdAt: string
}

export interface RoomHistoryPage {
    events: ApiRoomHistoryEvent[]
    nextCursor: string | null
}

/** Expense-create-only metadata. The boolean describes this mutation, not the
 * room snapshot, so callers must not persist it in the shared room cache. */
export interface ExpenseCreateResult extends RoomState {
    createdFirstSharedBalance: boolean
}

/** Creating a room, joining as new, and selecting an existing roster entry
 *  return room state plus the member identity envelope. */
export interface RoomStateWithMember extends RoomState {
    memberId: string
    /** Returned to the member's device. Client stores it and sends it as
     *  `X-Member-Token`; selecting reuses the existing value. */
    memberToken: string
}

/** Adding a payer on somebody else's behalf returns the new roster id but
 *  never crosses the HTTP boundary with that person's identity token. */
export interface RoomStateWithAddedMember extends RoomState {
    memberId: string
}

export interface ApiError {
    error: { code: string; message: string; details?: unknown }
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
    /** Optional — a row saved without a name is labelled by its day instead. */
    description?: string
    amountMinor: string
    currency: string
    /** Room-currency major units per one invented-currency major unit. Required
     *  when creating an expense the catalog cannot price; frozen on the row. */
    manualFxRate?: string
    paidById?: string
    /** New-expense-only draft. The server creates this member in the same
     *  transaction as the expense, so a cancelled or failed form leaves no row. */
    newPaidByName?: string
    splitMode: SplitMode
    /** EQUAL: defaults to every member in the room. */
    participantIds?: string[]
    /** EXACT: must add up to amountMinor, in the expense currency. */
    exactShares?: { memberId: string; amountMinor: string }[]
    /** PERCENTAGE or SHARES: positive integer weights as decimal strings.
     *  Percentage weights are basis points and must total exactly 10000. */
    weightedShares?: { memberId: string; weight: string }[]
    date?: string
    category?: string | null
}

/** PATCH /api/rooms/:slug/expenses/:id. The server uses expectedSplitMode as
 *  an optimistic compatibility guard before replacing the stored shares. */
export interface ExpenseUpdateInput extends ExpenseInput {
    expectedSplitMode?: SplitMode
}

/**
 * Add one late-joining member to one reviewed EQUAL expense.
 *
 * The expectations come from the review row the person confirmed. This is
 * deliberately narrower than an ExpenseUpdateInput: catch-up may change only
 * the equal shares, never replay a stale copy of the expense.
 */
export interface CatchUpExpenseInput {
    action: 'add' | 'remove'
    memberId: string
    expectedDescription: string
    expectedAmountMinor: string
    expectedBaseAmountMinor: string
    expectedCurrency: string
    expectedFxRate: string
    expectedPaidById: string
    expectedDate: string
    expectedCategory: string | null
    expectedParticipantIds: string[]
}

export interface CatchUpExpenseResult {
    changed: boolean
    state: RoomState
}

/** POST and DELETE /api/expenses/:id/reactions. The token is proof, not
 *  attribution, which is why it rides the body — see the route. */
export interface ReactionInput {
    emoji: string
    memberId: string
    memberToken: string
}

/** The member is named in the path; the room link is the shared-room credential. */
export interface MemberAvatarInput {
    /** A key from `lib/avatars.ts`, or null for the name-derived persona. */
    avatar: string | null
    /** A key from `lib/avatar-palettes.ts`. Omitted by older clients. */
    avatarPalette?: string
}

export interface SettlementInput {
    /** Stable across retries of the same real-world payment. */
    clientKey?: string
    fromId: string
    toId: string
    amountMinor: string
    method?: SettlementMethod | string | null
    note?: string | null
    receiptUrl?: string | null
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
 * at all.
 */
export interface ModelStatus {
    enabled: boolean
}

export interface ReceiptParseInput {
    /** Raw base64, no `data:` prefix. */
    imageBase64: string
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
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
    splitMode?: 'EQUAL' | 'EXACT'
    /** Must add up to `costMinor` exactly. */
    shares: ImportedShareInput[]
}

/** POST /api/import — a whole room in one body. */
export interface ImportRoomInput {
    /** SHA-256 identity of the local source file and selected raw-file choice.
     * Optional only for rolling compatibility with clients predating durable
     * source identity; current importers always send it. */
    sourceFingerprint?: string
    roomName: string
    emoji?: string | null
    /** What the room settles in. Expenses in other currencies are converted at import time. */
    currency: string
    /** Must be one of `members`; that member gets the token back. */
    creatorName: string
    members: string[]
    expenses: ImportedExpenseInput[]
}

/** One source-person resolution for an append import. Existing ids and new
 * room names are deliberately different shapes so a client cannot accidentally
 * send both; new members are created in the same transaction as the history. */
export type ImportMemberMapping =
    { sourceName: string; memberId: string } | { sourceName: string; newMemberName: string }

/** POST /api/rooms/:slug/import — append one parsed source export atomically. */
export interface ImportIntoRoomInput {
    /** Same immutable-source identity as `ImportRoomInput.sourceFingerprint`. */
    sourceFingerprint?: string
    members: ImportMemberMapping[]
    expenses: ImportedExpenseInput[]
}

/** Metadata describes the durable batch. On an exact replay the counts remain
 * the original batch counts while `alreadyImported` says this request wrote
 * nothing; the RoomState portion is always current. */
export interface ImportIntoRoomResult extends RoomState {
    batchId: string
    importedAt: string
    addedExpenses: number
    addedMembers: number
    alreadyImported: boolean
}
