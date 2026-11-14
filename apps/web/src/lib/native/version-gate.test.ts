import { describe, expect, it } from 'vitest'
import { siteUrl } from '../site'
import { fetchGateStoreUrl, gateFallbackUrl, shouldBlock } from './version-gate'

const STORE = {
    ios: 'https://apps.apple.com/app/id123',
    android: 'https://play.google.com/store/apps/details?id=com.peanutsplit.app',
}
const config = { minBuild: { ios: 500, android: 400 }, store: STORE }

const respondWith =
    (body: string, status = 200) =>
    async () =>
        new Response(body, { status, headers: { 'content-type': 'application/json' } })

describe('shouldBlock', () => {
    it('blocks a build below the minimum', () => {
        expect(shouldBlock(config, 'ios', 499)).toBe(true)
        expect(shouldBlock(config, 'android', 1)).toBe(true)
    })

    it('lets a build equal to the minimum run', () => {
        expect(shouldBlock(config, 'ios', 500)).toBe(false)
        expect(shouldBlock(config, 'android', 400)).toBe(false)
    })

    it('lets a build above the minimum run', () => {
        expect(shouldBlock(config, 'ios', 501)).toBe(false)
    })

    it('never blocks an unknown platform', () => {
        expect(shouldBlock(config, 'web', 0)).toBe(false)
        expect(shouldBlock({ ...config, minBuild: { ios: 500 } }, 'android', 1)).toBe(false)
    })

    it('fails open on missing or malformed fields', () => {
        expect(shouldBlock(null, 'ios', 1)).toBe(false)
        expect(shouldBlock('nope', 'ios', 1)).toBe(false)
        expect(shouldBlock({}, 'ios', 1)).toBe(false)
        expect(shouldBlock({ minBuild: { ios: '500' }, store: STORE }, 'ios', 1)).toBe(false)
        // No store URL means no way to update, so the screen would be a wall.
        expect(shouldBlock({ minBuild: { ios: 500 } }, 'ios', 1)).toBe(false)
        expect(shouldBlock({ minBuild: { ios: 500 }, store: { ios: 'javascript:alert(1)' } }, 'ios', 1)).toBe(false)
        expect(shouldBlock(config, 'ios', Number.NaN)).toBe(false)
    })
})

describe('fetchGateStoreUrl', () => {
    it('returns the platform store URL when the build is below the minimum', async () => {
        expect(await fetchGateStoreUrl(respondWith(JSON.stringify(config)), 'ios', 10)).toBe(STORE.ios)
        expect(await fetchGateStoreUrl(respondWith(JSON.stringify(config)), 'android', 10)).toBe(STORE.android)
    })

    it('returns null for an equal or newer build', async () => {
        expect(await fetchGateStoreUrl(respondWith(JSON.stringify(config)), 'ios', 500)).toBeNull()
        expect(await fetchGateStoreUrl(respondWith(JSON.stringify(config)), 'ios', 900)).toBeNull()
    })

    it('returns null for bad JSON', async () => {
        expect(await fetchGateStoreUrl(respondWith('{"minBuild":'), 'ios', 1)).toBeNull()
    })

    it('returns null for missing fields', async () => {
        expect(await fetchGateStoreUrl(respondWith('{}'), 'ios', 1)).toBeNull()
        expect(await fetchGateStoreUrl(respondWith(JSON.stringify({ minBuild: { ios: 500 } })), 'ios', 1)).toBeNull()
    })

    it('returns null when the fetch rejects or the server errors', async () => {
        const offline = async (): Promise<Response> => {
            throw new TypeError('Failed to fetch')
        }
        expect(await fetchGateStoreUrl(offline, 'ios', 1)).toBeNull()
        expect(await fetchGateStoreUrl(respondWith(JSON.stringify(config), 503), 'ios', 1)).toBeNull()
    })

    it('returns null for an unknown platform or build', async () => {
        expect(await fetchGateStoreUrl(respondWith(JSON.stringify(config)), 'web', 1)).toBeNull()
        expect(await fetchGateStoreUrl(respondWith(JSON.stringify(config)), 'ios', null)).toBeNull()
    })
})

describe('gateFallbackUrl', () => {
    const origin = (url: string) => new URL(url).origin

    it('opens the canonical room link from a room', () => {
        const url = gateFallbackUrl('/room/', '?slug=ski-trip-kunc-syrup-drum')
        expect(url).toBe(`${siteUrl}/r/ski-trip-kunc-syrup-drum`)
        expect(origin(url)).toBe(siteUrl)
    })

    it('opens the canonical room link from a room import', () => {
        const url = gateFallbackUrl('/room/import/', '?slug=ski-trip-kunc-syrup-drum&step=2')
        expect(url).toBe(`${siteUrl}/r/ski-trip-kunc-syrup-drum`)
        expect(origin(url)).toBe(siteUrl)
    })

    it('keeps a strange slug inside one path segment', () => {
        const url = gateFallbackUrl('/room/', '?slug=../../evil?x=1')
        expect(origin(url)).toBe(siteUrl)
        expect(new URL(url).pathname.startsWith('/r/')).toBe(true)
        expect(new URL(url).pathname.split('/')).toHaveLength(3)
    })

    it('opens the web rooms home from any other screen', () => {
        for (const [pathname, search] of [
            ['/app/', ''],
            ['/new/', ''],
            ['/', ''],
            ['/import/', '?slug=ski-trip-kunc-syrup-drum'],
            ['/room/', ''],
        ]) {
            const url = gateFallbackUrl(pathname, search)
            expect(url).toBe(`${siteUrl}/app`)
            expect(origin(url)).toBe(siteUrl)
        }
    })

    it('never returns a store host', () => {
        for (const url of [gateFallbackUrl('/room/', '?slug=a-b'), gateFallbackUrl('/app/', '')]) {
            expect(new URL(url).hostname).not.toMatch(/apple\.com|google\.com/)
        }
    })
})
