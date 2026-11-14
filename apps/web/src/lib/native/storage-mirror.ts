import { loadHost, type NativeHost } from './host'

/**
 * The key families that are the device's only copy of something a person cannot get back: the
 * room list, member tokens, queued offline expenses and the push-room map (ARCHITECTURE 8.3).
 * `ps:recent` is the room-list key itself; the others are prefixes of one key per item.
 * `ps:pending-owner` (a drain lease) and the legacy `ps:pending` array are not mirrored on purpose:
 * a lease restored from an old copy would block the queue, and the app never wrote the old array.
 */
export const MIRRORED_PREFIXES = ['ps:recent', 'ps:member:', 'ps:pending:', 'ps:push-room:'] as const

export const isMirroredKey = (key: string): boolean => MIRRORED_PREFIXES.some((prefix) => key.startsWith(prefix))

/** localStorage, or null where reading the property itself throws (blocked or evicted storage). */
function deviceStorage(): Storage | null {
    try {
        return window.localStorage
    } catch {
        return null
    }
}

/**
 * Copies room-list and member-token keys from Preferences back into a localStorage that the OS
 * evicted (WKWebView storage can be cleared under disk pressure; peanut-ui incident PEANUT-UI-QTQ).
 * NativeShell awaits it before any screen mounts.
 *
 * Only keys that localStorage is missing are restored. A present key is newer than or equal to its
 * Preferences copy, because every localStorage write of these keys is mirrored, so it always wins.
 */
export async function hydrateStorageMirror(): Promise<void> {
    const host = loadHost()
    const storage = deviceStorage()
    if (!host || !storage) return
    const { preferences } = await host
    const keys = (await preferences.keys()).filter(isMirroredKey)
    await Promise.all(
        keys.map(async (key) => {
            try {
                if (storage.getItem(key) !== null) return
            } catch {
                return
            }
            const value = await preferences.get(key)
            if (value === null) return
            try {
                storage.setItem(key, value)
            } catch {
                // A full or blocked localStorage keeps the Preferences copy for the next launch.
            }
        })
    )
}

/** Set once by installStorageMirror; every mirrored write reuses the one loaded host. */
let mirrorHost: Promise<NativeHost> | null = null
/** One queue, so a set followed by a remove of the same key reaches Preferences in that order. */
let pending: Promise<unknown> = Promise.resolve()

function mirror(write: (preferences: NativeHost['preferences']) => Promise<unknown>): void {
    const host = mirrorHost
    if (!host) return
    pending = pending.then(() => host.then((loaded) => write(loaded.preferences))).catch(() => {})
}

/**
 * Mirrors every later write of those keys into Preferences.
 *
 * An interceptor rather than explicit calls: these keys are written from eviction and rollback
 * paths in recent-rooms.ts, identity.ts, offline-queue.ts and ExpenseDrawer.tsx, and one missed
 * call site would let the copies diverge silently. localStorage stays the synchronous source of
 * truth: the original write runs first, and a write that throws (quota) is not mirrored. The
 * Preferences write is fire-and-forget. sessionStorage and any other Storage are untouched.
 */
export function installStorageMirror(): void {
    if (mirrorHost || typeof Storage === 'undefined') return
    mirrorHost = loadHost()
    if (!mirrorHost) return
    const proto = Storage.prototype
    const originalSet = proto.setItem
    const originalRemove = proto.removeItem

    proto.setItem = function setItem(this: Storage, key: string, value: string): void {
        originalSet.call(this, key, value)
        const name = String(key)
        if (this === deviceStorage() && isMirroredKey(name)) {
            const text = String(value)
            mirror((preferences) => preferences.set(name, text))
        }
    }

    proto.removeItem = function removeItem(this: Storage, key: string): void {
        originalRemove.call(this, key)
        const name = String(key)
        if (this === deviceStorage() && isMirroredKey(name)) mirror((preferences) => preferences.remove(name))
    }
}
