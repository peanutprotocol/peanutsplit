/**
 * What this device has already celebrated, and what it is still allowed to interrupt for.
 *
 * Two layers, one module:
 *
 *  - **durable** — `localStorage` under `ps:ach:<slug>`, so a threshold never re-celebrates on this
 *    device. Same shape and same per-room key as `ps:member:<slug>` (`lib/identity.ts`).
 *  - **session** — an in-memory set of slugs, so a room that qualifies for two things in one sitting
 *    shows one moment and the other lands quietly on the shelf.
 *
 * Per device rather than per person is the deliberate call: a celebration happens to a person
 * looking at a screen, and Split has no accounts to hang it on. The worst case of being wrong is
 * symmetric and tiny — somebody sees "the crew is five strong" twice across two phones.
 *
 * Storage discipline is `lib/identity.ts`'s: read through `try/catch`, treat blocked storage as
 * "no history", never throw into a render. Private-mode Safari therefore may repeat a moment.
 * That is the acceptable failure.
 */

export const ACHIEVEMENTS_KEY = (slug: string): string => `ps:ach:${slug}`

const storage = (): Storage | null => {
    try {
        if (typeof window === 'undefined') return null
        return window.localStorage ?? null
    } catch {
        // Safari in lockdown / private mode throws on access, not on use.
        return null
    }
}

/** The unlock ids this device has already been shown for `slug`. Corrupt or blocked → empty. */
export function readSeen(slug: string): Set<string> {
    const store = storage()
    if (!store) return new Set()
    try {
        const raw = store.getItem(ACHIEVEMENTS_KEY(slug))
        if (!raw) return new Set()
        const parsed: unknown = JSON.parse(raw)
        if (!Array.isArray(parsed)) return new Set()
        return new Set(parsed.filter((id): id is string => typeof id === 'string'))
    } catch {
        return new Set()
    }
}

/** Retire `ids`. Additive — crossing a rung retires every rung below it in the same write. */
export function markSeen(slug: string, ids: readonly string[]): void {
    const store = storage()
    if (!store) return
    const merged = readSeen(slug)
    for (const id of ids) merged.add(id)
    try {
        store.setItem(ACHIEVEMENTS_KEY(slug), JSON.stringify([...merged]))
    } catch {
        // Quota / private mode. Nothing useful to tell the user here.
    }
}

/**
 * One in-room achievement moment per room per session.
 *
 * Keyed by slug rather than global: `RoomSwitcher` (`SettingsSheet`) moves between rooms without a
 * reload, so a single module-level boolean would silently mute the second room of a session
 * forever. In memory and per page life is the right scope for the rest of it — the durable set
 * already covers "not again on this device".
 */
const claimed = new Set<string>()

export function claimSessionMoment(slug: string): boolean {
    if (claimed.has(slug)) return false
    claimed.add(slug)
    return true
}

/** Test seam only. Nothing in the app resets a session. */
export const resetSessionMoments = (): void => claimed.clear()
