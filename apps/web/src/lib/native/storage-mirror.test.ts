import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Preferences as the native plugin would hold it: one key-value map that outlives localStorage.
// `stalled` holds every call's reply forever after the call itself reached the plugin, as when the
// page unloads before the native side answers.
const preferences = vi.hoisted(() => ({ store: new Map<string, string>(), stalled: false }))

vi.mock('./capacitor/index', () => ({
    preferences: {
        keys: async () => [...preferences.store.keys()],
        get: async (key: string) => preferences.store.get(key) ?? null,
        set: async (key: string, value: string) => {
            preferences.store.set(key, value)
            if (preferences.stalled) await new Promise(() => {})
            return true
        },
        remove: async (key: string) => {
            preferences.store.delete(key)
            if (preferences.stalled) await new Promise(() => {})
            return true
        },
    },
}))

/** A fresh Storage class per test, because installStorageMirror patches its prototype. */
function makeStorageClass() {
    return class FakeStorage {
        readonly items = new Map<string, string>()
        full = false
        get length() {
            return this.items.size
        }
        key(index: number) {
            return [...this.items.keys()][index] ?? null
        }
        getItem(key: string) {
            return this.items.get(key) ?? null
        }
        setItem(key: string, value: string) {
            if (this.full) throw new Error('QuotaExceededError')
            this.items.set(key, String(value))
        }
        removeItem(key: string) {
            this.items.delete(key)
        }
        clear() {
            this.items.clear()
        }
    }
}

type FakeStorage = InstanceType<ReturnType<typeof makeStorageClass>>

let local: FakeStorage
let session: FakeStorage

beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_NATIVE_BUILD', '1')
    preferences.store.clear()
    preferences.stalled = false
    const FakeStorageClass = makeStorageClass()
    local = new FakeStorageClass()
    session = new FakeStorageClass()
    vi.stubGlobal('Storage', FakeStorageClass)
    vi.stubGlobal('window', { localStorage: local, sessionStorage: session })
})

afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
})

async function load() {
    return import('./storage-mirror')
}

describe('isMirroredKey', () => {
    it('mirrors only the room list, member tokens, queued writes and push rooms', async () => {
        const { isMirroredKey } = await load()
        expect(isMirroredKey('ps:recent')).toBe(true)
        expect(isMirroredKey('ps:member:ski-trip-kunc-syrup-drum')).toBe(true)
        expect(isMirroredKey('ps:pending:abc')).toBe(true)
        expect(isMirroredKey('ps:push-room:key123')).toBe(true)
        // The drain lease and the legacy queue array would do harm if restored from an old copy.
        expect(isMirroredKey('ps:pending-owner')).toBe(false)
        expect(isMirroredKey('ps:pending')).toBe(false)
        expect(isMirroredKey('ps:settings')).toBe(false)
        expect(isMirroredKey('ps-locale')).toBe(false)
        expect(isMirroredKey('ps:memberx')).toBe(false)
    })
})

describe('installStorageMirror', () => {
    it('writes mirrored localStorage keys through to Preferences and skips the rest', async () => {
        const { installStorageMirror } = await load()
        installStorageMirror()

        local.setItem('ps:recent', '[{"slug":"ski-trip-kunc-syrup-drum"}]')
        local.setItem('ps:member:ski-trip-kunc-syrup-drum', '{"id":"m1","token":"t1"}')
        local.setItem('ps:settings', '{"sound":false}')
        local.setItem('ps:pending-owner', 'tab-1')

        await vi.waitFor(() => expect(preferences.store.size).toBe(2))
        expect(Object.fromEntries(preferences.store)).toEqual({
            'ps:recent': '[{"slug":"ski-trip-kunc-syrup-drum"}]',
            'ps:member:ski-trip-kunc-syrup-drum': '{"id":"m1","token":"t1"}',
        })
        // localStorage itself is unchanged by the wrapper.
        expect(local.getItem('ps:settings')).toBe('{"sound":false}')
        expect(local.getItem('ps:recent')).toBe('[{"slug":"ski-trip-kunc-syrup-drum"}]')
    })

    it('mirrors removals, in order after the write they follow', async () => {
        const { installStorageMirror } = await load()
        installStorageMirror()

        local.setItem('ps:pending:q1', '{"clientKey":"q1"}')
        local.setItem('ps:pending:q2', '{"clientKey":"q2"}')
        local.removeItem('ps:pending:q1')

        await vi.waitFor(() => expect([...preferences.store.keys()]).toEqual(['ps:pending:q2']))
        expect(local.getItem('ps:pending:q1')).toBeNull()
    })

    it('sends a remove without waiting for the reply to the write before it', async () => {
        const { installStorageMirror } = await load()
        installStorageMirror()
        local.setItem('ps:member:ski-trip-kunc-syrup-drum', '{"id":"m1","token":"t1"}')
        await vi.waitFor(() => expect(preferences.store.has('ps:member:ski-trip-kunc-syrup-drum')).toBe(true))

        // Remove from device: the room list is rewritten, then the member token removed, and the
        // page navigates away before any native reply arrives.
        preferences.stalled = true
        local.setItem('ps:recent', '[]')
        local.removeItem('ps:member:ski-trip-kunc-syrup-drum')

        await vi.waitFor(() => expect(preferences.store.has('ps:member:ski-trip-kunc-syrup-drum')).toBe(false))
        expect(preferences.store.get('ps:recent')).toBe('[]')
    })

    it('leaves sessionStorage alone', async () => {
        const { installStorageMirror } = await load()
        installStorageMirror()

        session.setItem('ps:recent', '[]')
        session.setItem('ps:member:x', 'y')
        preferences.store.set('ps:member:kept', 'z')
        session.removeItem('ps:member:kept')
        local.setItem('ps:push-room:k', 'slug')

        // The localStorage write lands; the sessionStorage ones never do.
        await vi.waitFor(() => expect(preferences.store.get('ps:push-room:k')).toBe('slug'))
        expect(Object.fromEntries(preferences.store)).toEqual({ 'ps:member:kept': 'z', 'ps:push-room:k': 'slug' })
        expect(session.getItem('ps:recent')).toBe('[]')
    })

    it('does not mirror a write that localStorage refused, and the caller still sees the error', async () => {
        const { installStorageMirror } = await load()
        installStorageMirror()

        local.full = true
        expect(() => local.setItem('ps:recent', '[1]')).toThrow('QuotaExceededError')
        local.full = false
        local.setItem('ps:member:a', 'b')

        await vi.waitFor(() => expect(preferences.store.get('ps:member:a')).toBe('b'))
        expect(preferences.store.has('ps:recent')).toBe(false)
    })

    it('wraps the prototype once, so a second install does not mirror twice', async () => {
        const { installStorageMirror } = await load()
        installStorageMirror()
        const wrapped = Storage.prototype.setItem
        installStorageMirror()
        expect(Storage.prototype.setItem).toBe(wrapped)
    })

    it('does nothing in the web build', async () => {
        vi.stubEnv('NEXT_PUBLIC_NATIVE_BUILD', '0')
        const original = Storage.prototype.setItem
        const { installStorageMirror } = await load()
        installStorageMirror()
        expect(Storage.prototype.setItem).toBe(original)
        local.setItem('ps:recent', '[]')
        await Promise.resolve()
        expect(preferences.store.size).toBe(0)
    })
})

describe('hydrateStorageMirror', () => {
    it('restores mirrored keys that localStorage lost and never overwrites a present key', async () => {
        preferences.store.set('ps:recent', '[{"slug":"old"}]')
        preferences.store.set('ps:member:lost-room', '{"id":"m2"}')
        preferences.store.set('ps:pending:q9', '{"clientKey":"q9"}')
        preferences.store.set('ps:settings', '{"sound":true}')
        local.setItem('ps:recent', '[{"slug":"new"}]')

        const { hydrateStorageMirror } = await load()
        await hydrateStorageMirror()

        expect(local.getItem('ps:recent')).toBe('[{"slug":"new"}]')
        expect(local.getItem('ps:member:lost-room')).toBe('{"id":"m2"}')
        expect(local.getItem('ps:pending:q9')).toBe('{"clientKey":"q9"}')
        // Not a mirrored family, so Preferences is not its source.
        expect(local.getItem('ps:settings')).toBeNull()
        expect(session.length).toBe(0)
    })

    it('resolves without restoring when localStorage cannot be read', async () => {
        preferences.store.set('ps:recent', '[]')
        vi.stubGlobal('window', {
            get localStorage(): Storage {
                throw new Error('SecurityError')
            },
        })
        const { hydrateStorageMirror } = await load()
        await expect(hydrateStorageMirror()).resolves.toBeUndefined()
        expect(local.length).toBe(0)
    })

    it('resolves and keeps the Preferences copy when localStorage refuses the restore', async () => {
        preferences.store.set('ps:member:a', 'b')
        local.full = true
        const { hydrateStorageMirror } = await load()
        await expect(hydrateStorageMirror()).resolves.toBeUndefined()
        expect(local.getItem('ps:member:a')).toBeNull()
        expect(preferences.store.get('ps:member:a')).toBe('b')
    })

    it('does nothing in the web build', async () => {
        vi.stubEnv('NEXT_PUBLIC_NATIVE_BUILD', '0')
        preferences.store.set('ps:recent', '[]')
        const { hydrateStorageMirror } = await load()
        await hydrateStorageMirror()
        expect(local.getItem('ps:recent')).toBeNull()
    })
})
