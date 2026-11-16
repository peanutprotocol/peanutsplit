// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Notification taps against a fake push plugin that behaves like the real one: a tap that launched
 * the app is retained until the first listener attaches, then delivered to it; later taps go to
 * every attached listener.
 */

const SLUG = 'ski-trip-kunc-syrup-drum'
const SEND_ID = '0b9b2f6e-6d0a-4c43-9a51-1c1e5f8f2a11'

type Data = Record<string, unknown>

const plugin = vi.hoisted(() => ({
    retained: null as Record<string, unknown> | null,
    listeners: new Set<(data: Record<string, unknown>) => void>(),
    permissionDelayMs: 0,
}))

vi.mock('./capacitor/index', () => ({
    push: {
        onTap: async (handler: (data: Data) => void) => {
            plugin.listeners.add(handler)
            if (plugin.retained) {
                const data = plugin.retained
                plugin.retained = null
                handler(data)
            }
            return () => plugin.listeners.delete(handler)
        },
        permission: () => new Promise((resolve) => setTimeout(() => resolve('granted'), plugin.permissionDelayMs)),
    },
}))

const events = vi.hoisted(() => ({ tracked: [] as Array<{ name: string; props: Record<string, unknown> }> }))
vi.mock('../analytics', () => {
    const keys = new Map<string, string>()
    return {
        rememberRoomKey: (slug: string, key: string) => keys.set(slug, key),
        roomProps: (slug: string, extra: Record<string, unknown> = {}) =>
            keys.has(slug) ? { room: keys.get(slug), ...extra } : { ...extra },
        track: (name: string, props: Record<string, unknown>) => events.tracked.push({ name, props }),
    }
})

const beacons: Array<{ url: string; body: unknown }> = []

beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_NATIVE_BUILD', '1')
    vi.stubEnv('NEXT_PUBLIC_NATIVE_PUSH', '1')
    plugin.retained = null
    plugin.listeners.clear()
    plugin.permissionDelayMs = 0
    events.tracked.length = 0
    beacons.length = 0
    vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init: RequestInit) => {
            beacons.push({ url, body: JSON.parse(String(init.body)) })
            return new Response(null, { status: 204 })
        })
    )
    window.localStorage.clear()
    window.sessionStorage.clear()
    window.localStorage.setItem('ps:push-room:key-1', SLUG)
    window.history.replaceState(null, '', '/')
})

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
})

const load = () => import('./cold-push-tap')
const tap = (room: string, sendId = SEND_ID): Data => ({ room, sendId })
/** Delivers a tap while the app runs, to every attached listener, as the plugin does. */
const deliver = (data: Data) => plugin.listeners.forEach((listener) => listener(data))

describe('awaitColdPushTap', () => {
    it('resolves the room of the tap that launched the app and sends the opened beacon', async () => {
        plugin.retained = tap('key-1')
        expect(await (await load()).awaitColdPushTap()).toEqual({ slug: SLUG, sendId: SEND_ID })
        // Absolute: the app's own origin is capacitor://localhost, so the beacon goes through apiUrl.
        expect(beacons).toEqual([
            { url: expect.stringMatching(/^https?:\/\/[^/]+\/api\/push\/opened$/), body: { sendId: SEND_ID } },
        ])
        expect(events.tracked).toEqual([{ name: 'app_room_opened', props: { room: 'key-1', via: 'push' } }])
        // The cold listener is gone; only NativeLinks listens from here on.
        expect(plugin.listeners.size).toBe(0)
    })

    it('resolves a tap with no room for an unknown room key, so the app opens the rooms list', async () => {
        plugin.retained = tap('key-unknown')
        expect(await (await load()).awaitColdPushTap()).toEqual({ slug: null, sendId: SEND_ID })
        expect(events.tracked).toEqual([])
    })

    it('resolves null when the launch did not come from a tap', async () => {
        expect(await (await load()).awaitColdPushTap()).toBeNull()
        expect(beacons).toEqual([])
    })

    it('does not replay a tap after a WebView reload (same sendId)', async () => {
        plugin.retained = tap('key-1')
        expect(await (await load()).awaitColdPushTap()).not.toBeNull()
        // A reload: fresh modules, same tab session, and the plugin hands the same tap over again.
        vi.resetModules()
        plugin.retained = tap('key-1')
        expect(await (await load()).awaitColdPushTap()).toBeNull()
        expect(beacons).toHaveLength(1)
    })

    it('waits at most 500 ms for the bridge', async () => {
        vi.useFakeTimers()
        plugin.permissionDelayMs = 60_000
        const { awaitColdPushTap, COLD_TAP_BARRIER_MS } = await load()
        let result: unknown = 'pending'
        void awaitColdPushTap().then((value) => (result = value))
        await vi.advanceTimersByTimeAsync(COLD_TAP_BARRIER_MS)
        expect(result).toBeNull()
    })

    it('resolves null at once and attaches nothing when push is compiled out', async () => {
        vi.stubEnv('NEXT_PUBLIC_NATIVE_PUSH', '')
        plugin.retained = tap('key-1')
        expect(await (await load()).awaitColdPushTap()).toBeNull()
        expect(plugin.retained).not.toBeNull()
    })
})

describe('openWarmTap', () => {
    it('opens the room of a tap while the app runs', async () => {
        const { awaitColdPushTap, openWarmTap } = await load()
        await awaitColdPushTap()
        window.history.replaceState(null, '', '/app/')
        const pushed: string[] = []
        expect(openWarmTap(tap('key-1'), (path) => pushed.push(path))).toBe('room')
        expect(pushed).toEqual([`/room/?slug=${SLUG}`])
        expect(beacons).toHaveLength(1)
        expect(events.tracked).toEqual([{ name: 'app_room_opened', props: { room: 'key-1', via: 'push' } }])
    })

    it('opens the rooms list, not the most recent room, for an unknown key', async () => {
        const { awaitColdPushTap, openWarmTap } = await load()
        await awaitColdPushTap()
        window.history.replaceState(null, '', '/app/')
        const pushed: string[] = []
        expect(openWarmTap(tap('key-unknown'), (path) => pushed.push(path))).toBe('home')
        expect(pushed).toEqual(['/app/?manage=1'])
    })

    it('skips the tap the cold check already claimed, even when the warm listener received it', async () => {
        const { awaitColdPushTap, openWarmTap } = await load()
        const pushed: string[] = []
        // NativeLinks attached first and the plugin handed it the retained tap.
        plugin.retained = tap('key-1')
        const warmDispose = await (
            await import('./capacitor/index')
        ).push.onTap((data) => void openWarmTap(data, (path) => pushed.push(path)))
        expect(await awaitColdPushTap()).toEqual({ slug: SLUG, sendId: SEND_ID })
        expect(pushed).toEqual([])
        // The same tap delivered again later (both listeners, or a replay) is skipped too.
        window.history.replaceState(null, '', '/room/')
        deliver(tap('key-1'))
        expect(pushed).toEqual([])
        expect(beacons).toHaveLength(1)
        warmDispose()
    })
})
