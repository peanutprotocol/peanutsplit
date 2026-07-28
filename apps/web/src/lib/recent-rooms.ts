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

export interface RecentRoom {
    /** Room slug — the credential. e.g. "ski-trip-x7k2m9" */
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

const isBrowser = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'

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
    if (typeof slug !== 'string' || slug.length === 0) return null
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
    if (!isBrowser()) return []
    try {
        const raw = window.localStorage.getItem(RECENT_ROOMS_KEY)
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

/** Upsert a room to the top of the list. Safe to call on every room render. */
export function rememberRoom(room: Omit<RecentRoom, 'lastSeenAt'> & { lastSeenAt?: number }): void {
    if (!isBrowser()) return
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
        window.localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(next))
    } catch {
        // Private-mode / quota failures are not worth surfacing.
    }
}

/**
 * Fired when the list changes underneath a surface that has already read it.
 *
 * Only account recovery needs this: every other write happens on the room page,
 * which is a different screen from the list. Recovery writes a dozen rooms into
 * storage while "Your rooms" is mounted and showing what was there a second ago,
 * and a list that only updates on the next reload is the one moment the feature
 * exists for, missed.
 */
export const ROOMS_CHANGED_EVENT = 'ps:rooms-changed'

export function notifyRoomsChanged(): void {
    if (!isBrowser()) return
    window.dispatchEvent(new Event(ROOMS_CHANGED_EVENT))
}

/** Drop a room from the list (archived, or the user asked us to forget it). */
export function forgetRoom(slug: string): void {
    if (!isBrowser()) return
    try {
        window.localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(readRecentRooms().filter((r) => r.slug !== slug)))
    } catch {
        // ignore
    }
}
