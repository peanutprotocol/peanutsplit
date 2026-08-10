import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    DEVICE_COOKIE,
    DEVICE_KEY,
    clearIdentity,
    ensureDeviceId,
    memberStorageKey,
    readIdentity,
    writeIdentity,
} from './identity'

/** vitest runs in the node environment here — give identity.ts the two browser
 *  globals it touches, and nothing else. */
class MemoryStorage {
    private map = new Map<string, string>()
    getItem(key: string) {
        return this.map.get(key) ?? null
    }
    setItem(key: string, value: string) {
        this.map.set(key, value)
    }
    removeItem(key: string) {
        this.map.delete(key)
    }
}

declare const globalThis: Record<string, unknown> & typeof global

const installBrowser = (
    storage: unknown = new MemoryStorage(),
    { cookie = '', protocol = 'http:' }: { cookie?: string; protocol?: string } = {}
) => {
    globalThis.window = { localStorage: storage, location: { protocol } } as unknown as Window & typeof globalThis
    globalThis.document = { cookie } as unknown as Document
}

beforeEach(() => installBrowser())

afterEach(() => {
    delete (globalThis as Record<string, unknown>).window
    delete (globalThis as Record<string, unknown>).document
    vi.restoreAllMocks()
})

describe('readIdentity / writeIdentity', () => {
    it('round-trips an identity with a token', () => {
        writeIdentity('ski-trip-x7k2m9', { memberId: 'm1', name: 'Bea', token: 'tok_123' })
        expect(readIdentity('ski-trip-x7k2m9')).toEqual({ memberId: 'm1', name: 'Bea', token: 'tok_123' })
    })

    it('still reads legacy tokenless identities', () => {
        writeIdentity('room-a', { memberId: 'm2', name: 'Kai' })
        expect(readIdentity('room-a')).toEqual({ memberId: 'm2', name: 'Kai' })
    })

    it('never persists an empty token as a token', () => {
        writeIdentity('room-a', { memberId: 'm2', name: 'Kai', token: '' })
        expect(readIdentity('room-a')).toEqual({ memberId: 'm2', name: 'Kai' })
    })

    it('scopes storage per room slug', () => {
        writeIdentity('room-a', { memberId: 'm1', name: 'Bea' })
        expect(readIdentity('room-b')).toBeNull()
        expect(memberStorageKey('room-b')).toBe('ps:member:room-b')
    })

    it('returns null for malformed or partial records instead of throwing', () => {
        const storage = new MemoryStorage()
        installBrowser(storage)
        storage.setItem(memberStorageKey('room-a'), 'not json')
        expect(readIdentity('room-a')).toBeNull()
        storage.setItem(memberStorageKey('room-a'), JSON.stringify({ name: 'Bea' }))
        expect(readIdentity('room-a')).toBeNull()
        storage.setItem(memberStorageKey('room-a'), JSON.stringify({ memberId: 'm1' }))
        expect(readIdentity('room-a')).toBeNull()
    })

    it('clears', () => {
        writeIdentity('room-a', { memberId: 'm1', name: 'Bea' })
        clearIdentity('room-a')
        expect(readIdentity('room-a')).toBeNull()
    })

    it('is inert on the server', () => {
        delete (globalThis as Record<string, unknown>).window
        expect(readIdentity('room-a')).toBeNull()
        expect(() => writeIdentity('room-a', { memberId: 'm1', name: 'Bea' })).not.toThrow()
        expect(ensureDeviceId()).toBeNull()
    })

    it('survives storage that throws (private mode)', () => {
        installBrowser({
            getItem: () => {
                throw new Error('denied')
            },
            setItem: () => {
                throw new Error('denied')
            },
            removeItem: () => {
                throw new Error('denied')
            },
        })
        expect(readIdentity('room-a')).toBeNull()
        expect(() => writeIdentity('room-a', { memberId: 'm1', name: 'Bea' })).not.toThrow()
        expect(ensureDeviceId()).toBeNull()
    })
})

describe('ensureDeviceId', () => {
    it('mints once and mirrors it into the device-id cookie', () => {
        const storage = new MemoryStorage()
        installBrowser(storage)
        const first = ensureDeviceId()
        expect(first).toBeTruthy()
        expect(storage.getItem(DEVICE_KEY)).toBe(first)
        expect((globalThis.document as Document).cookie).toContain(`${DEVICE_COOKIE}=${first}`)
        expect((globalThis.document as Document).cookie).toContain('SameSite=Lax')
        expect(ensureDeviceId()).toBe(first)
    })

    it('keeps a valid local id authoritative and mirrors it over a different cookie', () => {
        const storage = new MemoryStorage()
        const local = '8b5b6f2d-a5bd-4bf9-9ea7-3f6c559dd711'
        const copied = '73da5387-c87c-4965-8735-edb2a70bbced'
        storage.setItem(DEVICE_KEY, local)
        installBrowser(storage, { cookie: `${DEVICE_COOKIE}=${copied}` })

        expect(ensureDeviceId()).toBe(local)
        expect(storage.getItem(DEVICE_KEY)).toBe(local)
        expect((globalThis.document as Document).cookie).toContain(`${DEVICE_COOKIE}=${encodeURIComponent(local)}`)
    })

    it('seeds empty or invalid local storage from WebKit’s copied device cookie', () => {
        const storage = new MemoryStorage()
        const copied = '73da5387-c87c-4965-8735-edb2a70bbced'
        storage.setItem(DEVICE_KEY, 'not-a-device-id')
        installBrowser(storage, { cookie: `ps-locale=en; ${DEVICE_COOKIE}=${encodeURIComponent(copied)}` })

        expect(ensureDeviceId()).toBe(copied)
        expect(storage.getItem(DEVICE_KEY)).toBe(copied)
    })

    it.each([`${DEVICE_COOKIE}=not-valid`, `${DEVICE_COOKIE}=%E0%A4%A`])(
        'mints safely when local storage and the cookie are malformed: %s',
        (cookie) => {
            const storage = new MemoryStorage()
            storage.setItem(DEVICE_KEY, 'also-invalid')
            installBrowser(storage, { cookie })

            const minted = ensureDeviceId()
            expect(minted).toMatch(/^(?:[0-9a-f-]{36}|dev-[a-z0-9]+)$/i)
            expect(minted).not.toBe('also-invalid')
            expect(storage.getItem(DEVICE_KEY)).toBe(minted)
        }
    )

    it('marks the mirrored cookie Secure on HTTPS', () => {
        const storage = new MemoryStorage()
        installBrowser(storage, { protocol: 'https:' })

        expect(ensureDeviceId()).toBeTruthy()
        expect((globalThis.document as Document).cookie).toContain('; Secure')
    })
})
