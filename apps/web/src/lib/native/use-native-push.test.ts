// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PushControls } from '../push-status'

/**
 * The app's push client against a fake plugin and a fake server. The server holds the per-room rows
 * (`<transport>:<token>` per room, as the route stores them), so every assertion is about what the
 * server and the device end up holding, and what the row shows.
 */

const SLUG = 'ski-trip-kunc-syrup-drum'
const KEY = 'room-key-1'
const TOKEN = 'device-token-1'

type Registration = 'token' | 'error' | 'silent'

const plugin = vi.hoisted(() => ({
    permission: 'prompt' as 'granted' | 'denied' | 'prompt',
    answer: 'granted' as 'granted' | 'denied' | 'prompt',
    registration: 'token' as Registration,
    registerCalls: 0,
    tokenListeners: new Set<(token: string) => void>(),
    errorListeners: new Set<(message: string) => void>(),
}))

vi.mock('./capacitor/index', () => ({
    push: {
        permission: async () => plugin.permission,
        requestPermission: async () => {
            plugin.permission = plugin.answer
            return plugin.permission
        },
        register: async () => {
            plugin.registerCalls += 1
            // The native side answers on its own schedule, after register() resolves.
            setTimeout(() => {
                if (plugin.registration === 'token') plugin.tokenListeners.forEach((listener) => listener(TOKEN))
                if (plugin.registration === 'error') plugin.errorListeners.forEach((listener) => listener('no APNs'))
            }, 0)
            return true
        },
        onRegistration: async (handler: (token: string) => void) => {
            plugin.tokenListeners.add(handler)
            return () => plugin.tokenListeners.delete(handler)
        },
        onRegistrationError: async (handler: (message: string) => void) => {
            plugin.errorListeners.add(handler)
            return () => plugin.errorListeners.delete(handler)
        },
    },
}))

const server = vi.hoisted(() => ({ rows: new Set<string>(), unavailable: false, offline: false }))

const unavailableError = () => Object.assign(new Error('503'), { code: 'NATIVE_PUSH_UNAVAILABLE' })

vi.mock('../api', () => {
    type Body = { transport: string; token: string; memberToken: string }
    const guard = (body: Body) => {
        if (server.offline) throw new Error('offline')
        if (server.unavailable) throw unavailableError()
        if (body.memberToken !== 'member-token') throw Object.assign(new Error('403'), { code: 'FORBIDDEN' })
    }
    const row = (slug: string, body: Body) => `${slug}|${body.transport}:${body.token}`
    return {
        isApiError: (error: unknown, code?: string) =>
            typeof error === 'object' && error !== null && 'code' in error && (!code || error.code === code),
        api: {
            push: {
                subscribe: async (slug: string, body: Body) => {
                    guard(body)
                    server.rows.add(row(slug, body))
                    return { subscribed: true }
                },
                unsubscribe: async (slug: string, body: Body) => {
                    if (server.offline) throw new Error('offline')
                    server.rows.delete(row(slug, body))
                    return { subscribed: false, endpointStillUsed: false }
                },
                status: async (slug: string, body: Body) => {
                    guard(body)
                    return { subscribed: server.rows.has(row(slug, body)) }
                },
            },
        },
    }
})

vi.mock('../analytics', () => ({
    roomProps: (_slug: string, extra: Record<string, unknown> = {}) => ({ room: KEY, ...extra }),
}))

beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_NATIVE_BUILD', '1')
    vi.stubEnv('NEXT_PUBLIC_NATIVE_PUSH', '1')
    vi.stubGlobal('Capacitor', { getPlatform: () => 'android' })
    Object.assign(plugin, { permission: 'prompt', answer: 'granted', registration: 'token', registerCalls: 0 })
    plugin.tokenListeners.clear()
    plugin.errorListeners.clear()
    Object.assign(server, { unavailable: false, offline: false })
    server.rows.clear()
    window.localStorage.clear()
    window.localStorage.setItem(
        `ps:member:${SLUG}`,
        JSON.stringify({ memberId: 'm1', name: 'Ana', token: 'member-token' })
    )
})

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
})

const load = () => import('./use-native-push')
const pushRoomEntry = () => window.localStorage.getItem(`ps:push-room:${KEY}`)

describe('nativeTransport', () => {
    it('is fcm on Android, apns-sandbox on iOS unless the build says production, and null in a browser', async () => {
        expect((await load()).nativeTransport()).toBe('fcm')
        vi.stubGlobal('Capacitor', { getPlatform: () => 'ios' })
        expect((await load()).nativeTransport()).toBe('apns-sandbox')
        vi.stubEnv('NEXT_PUBLIC_SPLIT_APNS_ENV', 'production')
        expect((await load()).nativeTransport()).toBe('apns')
        vi.stubGlobal('Capacitor', undefined)
        expect((await load()).nativeTransport()).toBeNull()
    })
})

describe('readNativeStatus', () => {
    it('hides the row and registers nothing when push is compiled out', async () => {
        vi.stubEnv('NEXT_PUBLIC_NATIVE_PUSH', '')
        expect(await (await load()).readNativeStatus(SLUG)).toBe('unsupported')
        expect(plugin.registerCalls).toBe(0)
    })

    it('maps the permission and the server row', async () => {
        const { readNativeStatus } = await load()
        expect(await readNativeStatus(SLUG)).toBe('default')
        plugin.permission = 'denied'
        expect(await readNativeStatus(SLUG)).toBe('denied')
        plugin.permission = 'granted'
        expect(await readNativeStatus(SLUG)).toBe('default')
        server.rows.add(`${SLUG}|fcm:${TOKEN}`)
        expect(await readNativeStatus(SLUG)).toBe('subscribed')
        // One registration serves every check in this app run.
        expect(plugin.registerCalls).toBe(1)
    })

    it('hides the row when the server has no push credentials (503)', async () => {
        server.unavailable = true
        expect(await (await load()).readNativeStatus(SLUG)).toBe('unsupported')
    })

    it('says unknown when the server does not answer', async () => {
        server.offline = true
        expect(await (await load()).readNativeStatus(SLUG)).toBe('unknown')
    })

    it('hides the row on a registration error', async () => {
        plugin.registration = 'error'
        expect(await (await load()).readNativeStatus(SLUG)).toBe('unsupported')
    })

    it('hides the row when no token arrives within 10 s, and does not hang', async () => {
        vi.useFakeTimers()
        plugin.registration = 'silent'
        const { readNativeStatus, REGISTRATION_TIMEOUT_MS } = await load()
        let status: string | null = null
        void readNativeStatus(SLUG).then((value) => (status = value))
        await vi.advanceTimersByTimeAsync(REGISTRATION_TIMEOUT_MS - 1)
        expect(status).toBeNull()
        await vi.advanceTimersByTimeAsync(1)
        expect(status).toBe('unsupported')
    })
})

describe('addNativeRoomSubscription and dropNativeRoomSubscription', () => {
    it('subscribes the room and records which room the notification key opens', async () => {
        const { addNativeRoomSubscription } = await load()
        expect(await addNativeRoomSubscription(SLUG, 'm1', 'member-token')).toEqual({ status: 'subscribed' })
        expect([...server.rows]).toEqual([`${SLUG}|fcm:${TOKEN}`])
        expect(pushRoomEntry()).toBe(SLUG)
    })

    it('stops at a refusal: no row, no entry', async () => {
        plugin.answer = 'denied'
        const { addNativeRoomSubscription } = await load()
        expect(await addNativeRoomSubscription(SLUG, 'm1', 'member-token')).toEqual({
            status: 'denied',
            permission: 'denied',
        })
        expect(server.rows.size).toBe(0)
        expect(pushRoomEntry()).toBeNull()
    })

    it('leave and forget remove the server row and the entry', async () => {
        const { addNativeRoomSubscription, dropNativeRoomSubscription } = await load()
        await addNativeRoomSubscription(SLUG, 'm1', 'member-token')
        await dropNativeRoomSubscription(SLUG, 'm1', 'member-token')
        expect(server.rows.size).toBe(0)
        expect(pushRoomEntry()).toBeNull()
    })

    it('forgetting offline still removes the entry, so a later tap cannot open the forgotten room', async () => {
        const { addNativeRoomSubscription, dropNativeRoomSubscription } = await load()
        await addNativeRoomSubscription(SLUG, 'm1', 'member-token')
        server.offline = true
        await expect(dropNativeRoomSubscription(SLUG, 'm1', 'member-token')).rejects.toThrow('offline')
        expect(pushRoomEntry()).toBeNull()
    })

    it('a room this install never subscribed costs no registration on forget', async () => {
        await (await load()).dropNativeRoomSubscription(SLUG, 'm1', 'member-token')
        expect(plugin.registerCalls).toBe(0)
    })
})

describe('useNativePush', () => {
    let container: HTMLDivElement
    let root: Root
    let controls: PushControls

    beforeEach(() => {
        ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
    })

    afterEach(async () => {
        await act(async () => root.unmount())
        document.body.innerHTML = ''
    })

    async function mount() {
        const { useNativePush } = await load()
        function Probe() {
            controls = useNativePush(SLUG)
            return null
        }
        await act(async () => root.render(createElement(Probe)))
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 5))
        })
    }

    it('is hidden from the first render when push is compiled out', async () => {
        vi.stubEnv('NEXT_PUBLIC_NATIVE_PUSH', '')
        await mount()
        expect(controls.status).toBe('unsupported')
    })

    it('turns the room on and off from the tap', async () => {
        await mount()
        expect(controls.status).toBe('default')
        let outcome: string | undefined
        await act(async () => {
            outcome = await controls.subscribe('m1', 'member-token')
        })
        expect(outcome).toBe('subscribed')
        expect(controls.status).toBe('subscribed')
        expect(pushRoomEntry()).toBe(SLUG)
        await act(async () => {
            await controls.unsubscribe('m1', 'member-token')
        })
        expect(controls.status).toBe('default')
        expect(server.rows.size).toBe(0)
        expect(pushRoomEntry()).toBeNull()
    })

    it('hides the row after a registration error at the tap', async () => {
        plugin.registration = 'error'
        await mount()
        // The status check already failed to get a token; the row is hidden before any tap.
        expect(controls.status).toBe('unsupported')
        let outcome: string | undefined
        await act(async () => {
            outcome = await controls.subscribe('m1', 'member-token')
        })
        expect(outcome).toBe('failed')
        expect(controls.status).toBe('unsupported')
        expect(server.rows.size).toBe(0)
    })

    it('hides the row when the server answers 503 at the tap', async () => {
        await mount()
        server.unavailable = true
        await act(async () => {
            await controls.subscribe('m1', 'member-token')
        })
        expect(controls.status).toBe('unsupported')
        expect(pushRoomEntry()).toBeNull()
    })
})
