import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiRequestError, type InstallHandoffPayload } from './api'
import {
    cancelPreparedInstallHandoff,
    hasPreparedInstallHandoff,
    INSTALL_HANDOFF_READY_COOKIE,
    persistInstallHandoff,
    prepareInstallHandoff,
    restorePreparedInstallHandoff,
} from './install-handoff'
import { memberStorageKey, readIdentity } from './identity'
import { readRecentRooms, RECENT_ROOMS_KEY } from './recent-rooms'

const SLUG = 'installed-trip-R7LxQ3TBJV_uQ2PMhzc8rw'
const STALE_SLUG = 'stale-trip-brave-otter-lamp'

class MemoryStorage implements Storage {
    private readonly values = new Map<string, string>()

    get length() {
        return this.values.size
    }
    clear() {
        this.values.clear()
    }
    getItem(key: string) {
        return this.values.get(key) ?? null
    }
    key(index: number) {
        return [...this.values.keys()][index] ?? null
    }
    removeItem(key: string) {
        this.values.delete(key)
    }
    setItem(key: string, value: string) {
        this.values.set(key, value)
    }
}

declare const globalThis: Record<string, unknown> & typeof global

function installBrowser({
    standalone = true,
    marker = true,
    storage = new MemoryStorage(),
}: {
    standalone?: boolean
    marker?: boolean
    storage?: Storage
} = {}) {
    globalThis.window = {
        localStorage: storage,
        location: { origin: 'http://localhost:3100' },
        navigator: { standalone },
        matchMedia: () => ({ matches: standalone }),
    } as unknown as Window & typeof globalThis
    globalThis.document = {
        cookie: marker ? `${INSTALL_HANDOFF_READY_COOKIE}=1; ps-locale=en` : 'ps-locale=en',
    } as unknown as Document
    return storage
}

const payload = (identity: InstallHandoffPayload['identity'] = { memberId: 'm1', name: 'Ana', token: 'tok_1' }) =>
    ({
        room: { slug: SLUG, name: 'Installed trip', emoji: '🥜', theme: 'lagoon' },
        identity,
    }) satisfies InstallHandoffPayload

afterEach(() => {
    delete (globalThis as Record<string, unknown>).window
    delete (globalThis as Record<string, unknown>).document
    vi.restoreAllMocks()
})

describe('install handoff readiness', () => {
    it('accepts only the exact non-secret marker', () => {
        expect(hasPreparedInstallHandoff(`${INSTALL_HANDOFF_READY_COOKIE}=1`)).toBe(true)
        expect(hasPreparedInstallHandoff(`${INSTALL_HANDOFF_READY_COOKIE}=0`)).toBe(false)
        expect(hasPreparedInstallHandoff(`x${INSTALL_HANDOFF_READY_COOKIE}=1`)).toBe(false)
        expect(hasPreparedInstallHandoff('')).toBe(false)
    })

    it('never redeems from an ordinary browser tab, even when Safari holds the prepared cookies', async () => {
        installBrowser({ standalone: false })
        const client = { redeem: vi.fn(), acknowledge: vi.fn() }

        await expect(restorePreparedInstallHandoff(undefined, client)).resolves.toEqual({ status: 'not-needed' })
        expect(client.redeem).not.toHaveBeenCalled()
        expect(client.acknowledge).not.toHaveBeenCalled()
    })

    it('does not make a doomed request on an ordinary standalone launch with no marker', async () => {
        installBrowser({ marker: false })
        const client = { redeem: vi.fn(), acknowledge: vi.fn() }

        await expect(restorePreparedInstallHandoff(undefined, client)).resolves.toEqual({ status: 'not-needed' })
        expect(client.redeem).not.toHaveBeenCalled()
    })
})

describe('verified restore before ACK', () => {
    it('makes the explicitly installed room current without erasing existing history', async () => {
        const storage = installBrowser()
        storage.setItem(
            RECENT_ROOMS_KEY,
            JSON.stringify([{ slug: STALE_SLUG, name: 'Stale room', lastSeenAt: Number.MAX_SAFE_INTEGER }])
        )
        const client = {
            redeem: vi.fn().mockResolvedValue(payload()),
            acknowledge: vi.fn().mockResolvedValue(undefined),
        }

        await expect(restorePreparedInstallHandoff(undefined, client)).resolves.toEqual({
            status: 'restored',
            roomPath: `/r/${SLUG}`,
        })

        expect(readRecentRooms().map((room) => room.slug)).toEqual([SLUG, STALE_SLUG])
        expect(readIdentity(SLUG)).toEqual({ memberId: 'm1', name: 'Ana', token: 'tok_1' })
        expect(client.acknowledge).toHaveBeenCalledOnce()
    })

    it('lets an explicit room-only handoff clear a stale participant viewpoint', async () => {
        installBrowser()
        const storage = (globalThis.window as Window).localStorage
        storage.setItem(memberStorageKey(SLUG), JSON.stringify({ memberId: 'old', name: 'Former', token: 'stale' }))
        const client = {
            redeem: vi.fn().mockResolvedValue(payload(null)),
            acknowledge: vi.fn().mockResolvedValue(undefined),
        }

        await expect(restorePreparedInstallHandoff(undefined, client)).resolves.toMatchObject({ status: 'restored' })
        expect(readIdentity(SLUG)).toBeNull()
        expect(client.acknowledge).toHaveBeenCalledOnce()
    })

    it('keeps a verified local restore when the idempotent ACK response is lost', async () => {
        installBrowser()
        const client = {
            redeem: vi.fn().mockResolvedValue(payload()),
            acknowledge: vi.fn().mockRejectedValue(new Error('response lost')),
        }

        await expect(restorePreparedInstallHandoff(undefined, client)).resolves.toEqual({
            status: 'restored',
            roomPath: `/r/${SLUG}`,
        })
        expect(readRecentRooms()[0]?.slug).toBe(SLUG)
        expect(readIdentity(SLUG)?.token).toBe('tok_1')
    })

    it('does not ACK a partial storage write, so the same payload can repair it next launch', async () => {
        let blockIdentity = true
        const memory = new MemoryStorage()
        const storage: Storage = {
            get length() {
                return memory.length
            },
            clear: () => memory.clear(),
            getItem: (key) => memory.getItem(key),
            key: (index) => memory.key(index),
            removeItem: (key) => memory.removeItem(key),
            setItem: (key, value) => {
                if (blockIdentity && key === memberStorageKey(SLUG))
                    throw new DOMException('quota', 'QuotaExceededError')
                memory.setItem(key, value)
            },
        }
        installBrowser({ storage })
        const client = {
            redeem: vi.fn().mockResolvedValue(payload()),
            acknowledge: vi.fn().mockResolvedValue(undefined),
        }

        await expect(restorePreparedInstallHandoff(undefined, client)).resolves.toEqual({
            status: 'transient-failure',
        })
        expect(client.acknowledge).not.toHaveBeenCalled()
        expect(readRecentRooms()[0]?.slug).toBe(SLUG)
        expect(readIdentity(SLUG)).toBeNull()

        blockIdentity = false
        await expect(restorePreparedInstallHandoff(undefined, client)).resolves.toMatchObject({ status: 'restored' })
        expect(readIdentity(SLUG)?.token).toBe('tok_1')
        expect(client.acknowledge).toHaveBeenCalledOnce()
    })

    it('does not ACK malformed server state or a transient redeem failure', async () => {
        installBrowser()
        const malformed = {
            redeem: vi.fn().mockResolvedValue({ room: { slug: '../../new', name: 'Wrong', emoji: null, theme: null } }),
            acknowledge: vi.fn(),
        }
        await expect(restorePreparedInstallHandoff(undefined, malformed)).resolves.toEqual({
            status: 'transient-failure',
        })
        expect(malformed.acknowledge).not.toHaveBeenCalled()
        expect(persistInstallHandoff({ room: null })).toBeNull()

        const transient = { redeem: vi.fn().mockRejectedValue(new Error('offline')), acknowledge: vi.fn() }
        await expect(restorePreparedInstallHandoff(undefined, transient)).resolves.toEqual({
            status: 'transient-failure',
        })
        expect(transient.acknowledge).not.toHaveBeenCalled()
    })

    it('distinguishes a definitive consumed/expired token from a retryable failure', async () => {
        installBrowser()
        const client = {
            redeem: vi
                .fn()
                .mockRejectedValue(new ApiRequestError(404, 'INSTALL_HANDOFF_UNAVAILABLE', 'handoff unavailable')),
            acknowledge: vi.fn(),
        }

        await expect(restorePreparedInstallHandoff(undefined, client)).resolves.toEqual({ status: 'definitive-miss' })
        expect(client.acknowledge).not.toHaveBeenCalled()
    })
})

describe('arming from the install surface', () => {
    it('reports whether the caller may safely open this room’s iOS install steps', async () => {
        installBrowser({ standalone: false })
        const prepare = vi.spyOn(api.installHandoff, 'prepare')
        prepare
            .mockImplementationOnce(async () => {
                document.cookie = `${INSTALL_HANDOFF_READY_COOKIE}=1`
                return { prepared: true }
            })
            .mockRejectedValueOnce(new Error('offline'))

        await expect(prepareInstallHandoff(SLUG, 'tok_1')).resolves.toEqual({ intent: expect.any(String) })
        await expect(prepareInstallHandoff(SLUG, 'tok_1')).resolves.toBeNull()
        expect(prepare).toHaveBeenNthCalledWith(1, SLUG, 'tok_1')
    })

    it('serializes cross-room intents so only the latest response may open instructions', async () => {
        installBrowser({ standalone: false })
        const calls: Array<{ slug: string; resolve: () => void }> = []
        vi.spyOn(api.installHandoff, 'prepare').mockImplementation(
            (slug) =>
                new Promise<{ prepared: true }>((resolve) => {
                    calls.push({ slug, resolve: () => resolve({ prepared: true }) })
                })
        )

        const first = prepareInstallHandoff(SLUG, 'tok_1')
        await vi.waitFor(() => expect(calls).toHaveLength(1))
        const secondSlug = 'second-room-R7LxQ3TBJV_uQ2PMhzc8rw'
        const second = prepareInstallHandoff(secondSlug, 'tok_2')

        // The second request cannot race the first Set-Cookie response. Once
        // first settles it is superseded, and only then can second replace it.
        expect(calls.map((call) => call.slug)).toEqual([SLUG])
        document.cookie = `${INSTALL_HANDOFF_READY_COOKIE}=1`
        calls[0].resolve()
        await expect(first).resolves.toBeNull()
        await vi.waitFor(() => expect(calls.map((call) => call.slug)).toEqual([SLUG, secondSlug]))
        document.cookie = `${INSTALL_HANDOFF_READY_COOKIE}=1`
        calls[1].resolve()
        await expect(second).resolves.toEqual({ intent: expect.any(String) })
    })

    it('leaves no ready marker when the newer queued intent fails', async () => {
        installBrowser({ standalone: false })
        let resolveFirst: (() => void) | undefined
        const prepare = vi.spyOn(api.installHandoff, 'prepare')
        prepare
            .mockImplementationOnce(
                () =>
                    new Promise<{ prepared: true }>((resolve) => {
                        resolveFirst = () => resolve({ prepared: true })
                    })
            )
            .mockRejectedValueOnce(new Error('new room offline'))

        const first = prepareInstallHandoff(SLUG, 'tok_1')
        await vi.waitFor(() => expect(resolveFirst).toBeTypeOf('function'))
        const second = prepareInstallHandoff('offline-room-R7LxQ3TBJV_uQ2PMhzc8rw', 'tok_2')
        document.cookie = `${INSTALL_HANDOFF_READY_COOKIE}=1`
        resolveFirst?.()

        await expect(first).resolves.toBeNull()
        await expect(second).resolves.toBeNull()
        expect(hasPreparedInstallHandoff(document.cookie)).toBe(false)
    })

    it('rejects a malformed success or a response whose ready cookie was stripped', async () => {
        installBrowser({ standalone: false })
        const prepare = vi.spyOn(api.installHandoff, 'prepare')
        prepare
            .mockResolvedValueOnce({ prepared: false } as unknown as { prepared: true })
            .mockResolvedValueOnce({ prepared: true })

        await expect(prepareInstallHandoff(SLUG, 'tok_1')).resolves.toBeNull()
        await expect(prepareInstallHandoff(SLUG, 'tok_1')).resolves.toBeNull()
        expect(hasPreparedInstallHandoff(document.cookie)).toBe(false)
    })

    it('cancels a prepared room when its initiating surface disappears', async () => {
        installBrowser({ standalone: false })
        vi.spyOn(api.installHandoff, 'prepare').mockImplementation(async () => {
            document.cookie = `${INSTALL_HANDOFF_READY_COOKIE}=1`
            return { prepared: true }
        })
        const acknowledge = vi.spyOn(api.installHandoff, 'acknowledge').mockResolvedValue(undefined)

        const prepared = await prepareInstallHandoff(SLUG, 'tok_1')
        expect(prepared).not.toBeNull()
        expect(hasPreparedInstallHandoff(document.cookie)).toBe(true)

        await cancelPreparedInstallHandoff(prepared!)

        expect(hasPreparedInstallHandoff(document.cookie)).toBe(false)
        expect(acknowledge).toHaveBeenCalledOnce()
    })

    it('cannot let a stale surface cancel a newer room intent', async () => {
        installBrowser({ standalone: false })
        vi.spyOn(api.installHandoff, 'prepare').mockImplementation(async () => {
            document.cookie = `${INSTALL_HANDOFF_READY_COOKIE}=1`
            return { prepared: true }
        })
        const acknowledge = vi.spyOn(api.installHandoff, 'acknowledge').mockResolvedValue(undefined)

        const older = await prepareInstallHandoff(SLUG, 'tok_1')
        const newer = await prepareInstallHandoff('newer-room-R7LxQ3TBJV_uQ2PMhzc8rw', 'tok_2')
        expect(older).not.toBeNull()
        expect(newer).not.toBeNull()

        await cancelPreparedInstallHandoff(older!)
        expect(acknowledge).not.toHaveBeenCalled()
        expect(hasPreparedInstallHandoff(document.cookie)).toBe(true)

        await cancelPreparedInstallHandoff(newer!)
        expect(acknowledge).toHaveBeenCalledOnce()
        expect(hasPreparedInstallHandoff(document.cookie)).toBe(false)
    })
})
