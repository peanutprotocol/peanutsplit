// Per-device identity + recent-rooms for split rooms. Trust-based: a device
// remembers "which member I am" in each room via localStorage. No accounts.

const memberKey = (slug: string) => `peanut-split:member:${slug}`
const RECENT_KEY = 'peanut-split:recent'

export interface RecentRoom {
	slug: string
	title: string | null
	lastVisitedAt: number
}

export function getStoredMemberId(slug: string): string | null {
	if (typeof window === 'undefined') return null
	try {
		return window.localStorage.getItem(memberKey(slug))
	} catch {
		return null
	}
}

export function setStoredMemberId(slug: string, memberId: string): void {
	if (typeof window === 'undefined') return
	try {
		window.localStorage.setItem(memberKey(slug), memberId)
	} catch {
		/* private mode / storage full — identity just won't persist */
	}
}

export function clearStoredMemberId(slug: string): void {
	if (typeof window === 'undefined') return
	try {
		window.localStorage.removeItem(memberKey(slug))
	} catch {
		/* ignore */
	}
}

export function getRecentRooms(): RecentRoom[] {
	if (typeof window === 'undefined') return []
	try {
		const raw = window.localStorage.getItem(RECENT_KEY)
		if (!raw) return []
		const parsed = JSON.parse(raw) as RecentRoom[]
		return Array.isArray(parsed) ? parsed.sort((a, b) => b.lastVisitedAt - a.lastVisitedAt) : []
	} catch {
		return []
	}
}

export function rememberRoom(slug: string, title: string | null): void {
	if (typeof window === 'undefined') return
	try {
		const rooms = getRecentRooms().filter((r) => r.slug !== slug)
		rooms.unshift({ slug, title, lastVisitedAt: Date.now() })
		window.localStorage.setItem(RECENT_KEY, JSON.stringify(rooms.slice(0, 12)))
	} catch {
		/* ignore */
	}
}
