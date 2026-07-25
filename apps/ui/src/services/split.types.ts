// Types for link-based expense-splitting rooms. Mirrors the peanut-api-ts
// `/split/*` routes (hand-written for the spike; wire into gen:api when
// productionizing). All monetary values are stringified minor units.

export type SplitKind = 'EQUAL' | 'EXACT'
export type SettlementMethod = 'MANUAL' | 'PEANUT'

export interface SplitMember {
	id: string
	displayName: string
	colorSeed: number
}

export interface SplitShare {
	memberId: string
	amountMinor: string
	/** EXACT splits: the amount as typed in the expense currency (minor units); null for EQUAL. */
	enteredAmountMinor: string | null
}

export interface SplitExpense {
	id: string
	description: string
	amountMinor: string
	currency: string
	baseAmountMinor: string
	fxRate: string
	splitKind: SplitKind
	paidByMemberId: string
	createdByMemberId: string | null
	createdAt: string
	shares: SplitShare[]
}

export interface SplitSettlement {
	id: string
	fromMemberId: string
	toMemberId: string
	amountMinor: string
	method: SettlementMethod
	/** Peanut's id for the payment that confirmed this. Only ever set by the webhook. */
	peanutRef: string | null
	createdAt: string
}

export interface SplitBalance {
	memberId: string
	netMinor: string
}

export interface SplitTransfer {
	fromMemberId: string
	toMemberId: string
	amountMinor: string
}

export interface RoomState {
	slug: string
	title: string | null
	baseCurrency: string
	createdAt: string
	members: SplitMember[]
	expenses: SplitExpense[]
	settlements: SplitSettlement[]
	/** Settle-ups handed off to Peanut and not yet confirmed. Server-side, so
	 *  the whole room sees a payment in flight — not just the tab that started
	 *  it, which is usually gone, because paying happens in another app. */
	pendingSettleIntents: PendingSettleIntent[]
	balances: SplitBalance[]
	suggestedTransfers: SplitTransfer[]
}

export interface PendingSettleIntent {
	reference: string
	fromMemberId: string
	toMemberId: string
	amountMinor: string
	createdAt: string
}

export interface CurrencyInfo {
	code: string
	symbol: string
	name: string
	decimals: number
}

/** POST /members returns the created member's id explicitly (store it directly
 *  — diffing the members array is racy under concurrent joins). */
export interface MemberCreatedResponse {
	createdMemberId: string
	room: RoomState
}

export interface NewExpenseInput {
	description: string
	amountMinor: string
	currency: string
	paidByMemberId: string
	splitKind: SplitKind
	participantMemberIds?: string[]
	exactShares?: { memberId: string; amountMinor: string }[]
	createdByMemberId?: string
}

export interface NewSettlementInput {
	fromMemberId: string
	toMemberId: string
	amountMinor: string
	/** MANUAL only — a PEANUT settlement is a verified receipt and may only be
	 *  written by the webhook, never claimed by a caller with the room link. */
	method?: 'MANUAL'
	/** Stable across retries of one tap, so the server can drop the duplicate. */
	idempotencyKey?: string
}
