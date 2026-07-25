// API client for link-based expense-splitting rooms. Talks to peanut-api-ts
// `/split/*` (unauthenticated — the room slug is the access control).
//
// In the browser we hit the SAME-ORIGIN proxy `/_split/*` (a Next rewrite →
// API `/split/*`, see next.config.js). This means the app only ever needs the
// one origin that served the page — no second forwarded port (localhost:5051)
// in a devcontainer/preview, where a direct cross-origin call silently fails
// even though the page renders. On the server (SSR) there's no rewrite, so we
// call the API directly. Split routes are anonymous, so no auth headers.

import { SPLIT_API_URL } from '@/constants/split.consts'
import type {
	RoomState,
	CurrencyInfo,
	NewExpenseInput,
	NewSettlementInput,
	MemberCreatedResponse,
} from '@/services/split.types'

const splitUrl = (path: string): string =>
	typeof window === 'undefined' ? `${SPLIT_API_URL}/split${path}` : `/_split${path}`

/// Without a deadline a stalled request never settles, so the mutation stays
/// pending forever and the button spins with nothing behind it.
const REQUEST_TIMEOUT_MS = 10_000

async function splitFetch<T>(path: string, init?: RequestInit): Promise<T> {
	const headers: Record<string, string> = { ...(init?.headers as Record<string, string>) }
	if (init?.body && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
		headers['Content-Type'] = 'application/json'
	}
	let res: Response
	try {
		res = await fetch(splitUrl(path), { ...init, headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
	} catch (err) {
		if (err instanceof DOMException && err.name === 'TimeoutError') {
			throw new Error("That took too long — check your connection and try again. We didn't save anything.")
		}
		throw err
	}
	const data = await res.json().catch(() => ({}) as unknown)
	if (!res.ok) {
		const message = (data as { message?: string })?.message ?? `request failed (${res.status})`
		throw new Error(message)
	}
	return data as T
}

export async function getCurrencies(): Promise<CurrencyInfo[]> {
	return splitFetch('/currencies', { method: 'GET' })
}

export async function getRate(from: string, to: string): Promise<{ rate: number; source: string }> {
	return splitFetch(`/rate?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { method: 'GET' })
}

export async function getRoom(slug: string): Promise<RoomState> {
	return splitFetch(`/rooms/${slug}`, { method: 'GET' })
}

export async function createRoom(input: { title?: string; baseCurrency: string }): Promise<RoomState> {
	return splitFetch('/rooms', { method: 'POST', body: JSON.stringify(input) })
}

export async function addMember(slug: string, displayName: string): Promise<MemberCreatedResponse> {
	return splitFetch(`/rooms/${slug}/members`, { method: 'POST', body: JSON.stringify({ displayName }) })
}

export async function addExpense(slug: string, input: NewExpenseInput): Promise<RoomState> {
	return splitFetch(`/rooms/${slug}/expenses`, { method: 'POST', body: JSON.stringify(input) })
}

export async function updateExpense(slug: string, expenseId: string, input: NewExpenseInput): Promise<RoomState> {
	return splitFetch(`/rooms/${slug}/expenses/${expenseId}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export async function deleteExpense(slug: string, expenseId: string): Promise<RoomState> {
	return splitFetch(`/rooms/${slug}/expenses/${expenseId}`, { method: 'DELETE' })
}

export async function restoreExpense(slug: string, expenseId: string): Promise<RoomState> {
	return splitFetch(`/rooms/${slug}/expenses/${expenseId}/restore`, { method: 'POST' })
}

export async function recordSettlement(slug: string, input: NewSettlementInput): Promise<RoomState> {
	return splitFetch(`/rooms/${slug}/settlements`, { method: 'POST', body: JSON.stringify(input) })
}

export async function deleteSettlement(slug: string, settlementId: string): Promise<RoomState> {
	return splitFetch(`/rooms/${slug}/settlements/${settlementId}`, { method: 'DELETE' })
}
