import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiUrl, IS_NATIVE_APP, RECAP_AVAILABLE, roomPath } from './platform'

const SLUG = 'ski-trip-kunc-syrup-drum'

/** The native branch is chosen at module load, so each native case loads a fresh copy of the module. */
async function loadNative(baseUrl = 'https://peanutsplit.com') {
    vi.stubEnv('NEXT_PUBLIC_NATIVE_BUILD', '1')
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', baseUrl)
    vi.resetModules()
    return import('./platform')
}

afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
})

describe('platform on web', () => {
    it('is not the app', () => {
        expect(IS_NATIVE_APP).toBe(false)
        expect(RECAP_AVAILABLE).toBe(true)
    })

    it('builds the room paths the web has always used', () => {
        expect(roomPath(SLUG)).toBe(`/r/${SLUG}`)
        expect(roomPath(SLUG, 'import')).toBe(`/r/${SLUG}/import`)
        expect(roomPath(SLUG, 'room', 'add=1')).toBe(`/r/${SLUG}?add=1`)
        expect(roomPath(SLUG, 'room', 'settings=1')).toBe(`/r/${SLUG}?settings=1`)
        expect(roomPath(SLUG, 'import', 'step=2')).toBe(`/r/${SLUG}/import?step=2`)
    })

    it('leaves API paths same-origin', () => {
        expect(apiUrl('/api/rooms')).toBe('/api/rooms')
        expect(apiUrl(`/r/${SLUG}/recap/card`)).toBe(`/r/${SLUG}/recap/card`)
    })
})

describe('platform in the app', () => {
    it('is the app and hides the recap page', async () => {
        const native = await loadNative()
        expect(native.IS_NATIVE_APP).toBe(true)
        expect(native.RECAP_AVAILABLE).toBe(false)
    })

    it('puts the slug in the query of the two static room routes', async () => {
        const native = await loadNative()
        expect(native.roomPath(SLUG)).toBe(`/room/?slug=${SLUG}`)
        expect(native.roomPath(SLUG, 'import')).toBe(`/room/import/?slug=${SLUG}`)
        expect(native.roomPath(SLUG, 'room', 'add=1')).toBe(`/room/?slug=${SLUG}&add=1`)
        expect(native.roomPath(SLUG, 'import', 'step=2')).toBe(`/room/import/?slug=${SLUG}&step=2`)
    })

    it('sends API paths to the configured site origin', async () => {
        const production = await loadNative()
        expect(production.apiUrl('/api/rooms')).toBe('https://peanutsplit.com/api/rooms')

        const loopback = await loadNative('http://localhost:3100')
        expect(loopback.apiUrl('/api/rooms/x/state')).toBe('http://localhost:3100/api/rooms/x/state')
    })

    it('enables push UI only with its own flag', async () => {
        expect((await loadNative()).NATIVE_PUSH_ENABLED).toBe(false)
        vi.stubEnv('NEXT_PUBLIC_NATIVE_PUSH', '1')
        expect((await loadNative()).NATIVE_PUSH_ENABLED).toBe(true)
    })
})

describe('nativePlatform', () => {
    afterEach(() => {
        delete (globalThis as { Capacitor?: unknown }).Capacitor
    })

    it('reads the bridge at call time', async () => {
        const { nativePlatform } = await import('./platform')
        expect(nativePlatform()).toBe('web')
        ;(globalThis as { Capacitor?: unknown }).Capacitor = { getPlatform: () => 'ios' }
        expect(nativePlatform()).toBe('ios')
        ;(globalThis as { Capacitor?: unknown }).Capacitor = { getPlatform: () => 'android' }
        expect(nativePlatform()).toBe('android')
    })
})
