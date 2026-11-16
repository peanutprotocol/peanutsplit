import { nativeRoomSlug } from './links'

/**
 * The app's map from a notification's room key to the room it opens (ARCHITECTURE 10.1).
 *
 * APNs and FCM payloads are readable by Apple and Google, so they carry the room's `analyticsKey`,
 * never the slug. The app writes `ps:push-room:<analyticsKey> = <slug>` when it subscribes a room, and
 * a tap looks the key up here. The in-memory key map in `analytics.ts` is empty after a cold start,
 * so it cannot serve. The storage mirror copies this prefix to Preferences, so the map survives an OS
 * eviction of localStorage.
 */
export const PUSH_ROOM_PREFIX = 'ps:push-room:'

function deviceStorage(): Storage | null {
    try {
        return window.localStorage
    } catch {
        return null
    }
}

/** The slug a notification key opens, or null for an unknown key or a stored value that is not a slug. */
export function readPushRoom(analyticsKey: string): string | null {
    if (!analyticsKey) return null
    try {
        return nativeRoomSlug(deviceStorage()?.getItem(PUSH_ROOM_PREFIX + analyticsKey) ?? null)
    } catch {
        return null
    }
}

/** Records that notifications with `analyticsKey` open `slug`. False when storage refused the write. */
export function writePushRoom(analyticsKey: string, slug: string): boolean {
    if (!analyticsKey) return false
    try {
        const storage = deviceStorage()
        if (!storage) return false
        storage.setItem(PUSH_ROOM_PREFIX + analyticsKey, slug)
        return true
    } catch {
        return false
    }
}

/** Every stored key that opens `slug`. A room has one key, but a stale copy must not outlive a forget. */
function keysForSlug(storage: Storage, slug: string): string[] {
    const keys: string[] = []
    for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index)
        if (key?.startsWith(PUSH_ROOM_PREFIX) && storage.getItem(key) === slug) keys.push(key)
    }
    return keys
}

/** True when this install subscribed `slug` and has not dropped it since. */
export function hasPushRoom(slug: string): boolean {
    try {
        const storage = deviceStorage()
        return storage !== null && keysForSlug(storage, slug).length > 0
    } catch {
        return false
    }
}

/** Removes every entry that opens `slug` (unsubscribe, leave, forget). */
export function removePushRoom(slug: string): void {
    try {
        const storage = deviceStorage()
        if (!storage) return
        // Collected first: removing while walking by index would skip the entry after each removal.
        for (const key of keysForSlug(storage, slug)) storage.removeItem(key)
    } catch {
        // Blocked storage has nothing to remove.
    }
}
