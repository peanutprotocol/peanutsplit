/**
 * Recently-visited rooms, stored in localStorage under `ps:recent`.
 *
 * This is the only thing the landing page knows about a user — there are no accounts.
 * The flows agent writes here (on room create + on every room visit); the marketing
 * "Your rooms" section reads it.
 *
 * Storage shape: `RecentRoom[]`, newest first, capped at RECENT_ROOMS_LIMIT.
 */

export const RECENT_ROOMS_KEY = 'ps:recent'
export const RECENT_ROOMS_LIMIT = 12
const CANONICAL_ROOM_HOSTS = new Set(['peanutsplit.com', 'www.peanutsplit.com'])
const ROOM_PATH = /^\/r\/([^/]+)\/?$/
/** A readable stem, then a capability. New rooms carry a 22-character base64url
 * token (128 random bits); three-word and six-character tails remain accepted
 * forever because a room keeps the credential it was issued. */
const ROOM_SLUG =
    /^[a-z0-9](?:[a-z0-9-]{0,39})-(?:[A-Za-z0-9_-]{22}|[a-z]{3,7}-[a-z]{3,7}-[a-z]{3,7}|[0-9a-hjkmnp-tv-z]{6})$/

export interface RecentRoom {
    /** Room slug — the credential. e.g. "ski-trip-R7LxQ3TBJV_uQ2PMhzc8rw" */
    slug: string
    /** Display name at the time it was last seen. */
    name: string
    /** Room emoji, if the room has one. */
    emoji?: string
    /**
     * The room's theme KEY, if it has one — never a colour. Stored so the landing
     * list can wear the same palette the room does without a request per tile;
     * `themeFor` maps an unknown or stale key back to the default, so a key
     * written by an older build can only ever be a no-op.
     */
    theme?: string
    /** Epoch milliseconds. ISO strings are also accepted on read and normalised. */
    lastSeenAt: number
}

/** Accessing the storage property itself can throw in privacy-restricted browsers. */
const browserStorage = (): Storage | null => {
    if (typeof window === 'undefined') return null
    try {
        return window.localStorage
    } catch {
        return null
    }
}

/**
 * Pull a room credential out of a pasted Peanut Split link.
 *
 * Accepts the canonical production host, the host currently serving the app
 * (so localhost and preview deployments work), a bare `peanutsplit.com/r/...`
 * link, or a same-site `/r/...` path. Query strings and fragments are harmless
 * chat-client decoration and are discarded. Everything else is rejected before
 * a request is made.
 */
export function roomSlugFromLink(value: string, currentOrigin: string): string | null {
    const trimmed = value.trim()
    if (!trimmed) return null

    let current: URL
    let candidate: URL
    try {
        current = new URL(currentOrigin)
        if (trimmed.startsWith('/')) {
            candidate = new URL(trimmed, current)
        } else {
            candidate = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
        }
    } catch {
        return null
    }

    if (!['http:', 'https:'].includes(candidate.protocol)) return null
    if (candidate.username || candidate.password) return null

    const allowedHosts = new Set(CANONICAL_ROOM_HOSTS)
    allowedHosts.add(current.hostname.toLowerCase())
    if (!allowedHosts.has(candidate.hostname.toLowerCase())) return null

    const match = candidate.pathname.match(ROOM_PATH)
    if (!match) return null

    let slug: string
    try {
        slug = decodeURIComponent(match[1])
    } catch {
        return null
    }
    return ROOM_SLUG.test(slug) ? slug : null
}

const toEpochMs = (value: unknown): number => {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string') {
        const parsed = Date.parse(value)
        if (!Number.isNaN(parsed)) return parsed
    }
    return 0
}

const normalise = (value: unknown): RecentRoom | null => {
    if (typeof value !== 'object' || value === null) return null
    const { slug, name, emoji, theme, lastSeenAt } = value as Record<string, unknown>
    if (typeof slug !== 'string' || !ROOM_SLUG.test(slug)) return null
    return {
        slug,
        name: typeof name === 'string' && name.length > 0 ? name : slug,
        emoji: typeof emoji === 'string' && emoji.length > 0 ? emoji : undefined,
        theme: typeof theme === 'string' && theme.length > 0 ? theme : undefined,
        lastSeenAt: toEpochMs(lastSeenAt),
    }
}

/** Read the recent-room list, newest first. Returns `[]` on the server or on malformed storage. */
export function readRecentRooms(): RecentRoom[] {
    const storage = browserStorage()
    if (!storage) return []
    try {
        const raw = storage.getItem(RECENT_ROOMS_KEY)
        if (!raw) return []
        const parsed: unknown = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        const rooms = parsed.map(normalise).filter((room): room is RecentRoom => room !== null)
        const seen = new Set<string>()
        return rooms
            .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
            .filter((room) => (seen.has(room.slug) ? false : (seen.add(room.slug), true)))
            .slice(0, RECENT_ROOMS_LIMIT)
    } catch {
        return []
    }
}

/**
 * The room route an operational home should open, or `null` when this device has
 * no usable history.
 *
 * localStorage belongs to the browser, not to us: a person, extension or stale
 * build can put any string in `slug`. Keep that untrusted value out of navigation
 * by applying the same permanent room-slug contract used for pasted links, then
 * encode the path segment even though today's contract contains only URL-safe
 * characters.
 */
export function mostRecentRoomPath(): string | null {
    const room = readRecentRooms().find((candidate) => ROOM_SLUG.test(candidate.slug))
    return room ? `/r/${encodeURIComponent(room.slug)}` : null
}

/**
 * Upsert a room to the top of the list. Safe to call on every room render.
 *
 * The boolean is intentional: flows that promise "saved on this device" must
 * distinguish a successful write from private-mode/quota failures.
 */
export function rememberRoom(room: Omit<RecentRoom, 'lastSeenAt'> & { lastSeenAt?: number }): boolean {
    const storage = browserStorage()
    if (!storage) return false
    const entry: RecentRoom = {
        slug: room.slug,
        name: room.name,
        emoji: room.emoji,
        theme: room.theme,
        lastSeenAt: room.lastSeenAt ?? Date.now(),
    }
    const next = [entry, ...readRecentRooms().filter((existing) => existing.slug !== entry.slug)].slice(
        0,
        RECENT_ROOMS_LIMIT
    )
    try {
        storage.setItem(RECENT_ROOMS_KEY, JSON.stringify(next))
        return true
    } catch {
        return false
    }
}

/** Drop a room from the list when the user asks us to forget it. */
export function forgetRoom(slug: string): boolean {
    const storage = browserStorage()
    if (!storage) return false
    try {
        storage.setItem(RECENT_ROOMS_KEY, JSON.stringify(readRecentRooms().filter((r) => r.slug !== slug)))
        return true
    } catch {
        return false
    }
}
