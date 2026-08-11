import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The manifest is the one file this app publishes to the operating system, uncredentialed and
 * cached by the browser for as long as it likes. Three things therefore have to hold mechanically:
 * the installed app is called "Split", it launches the app home, and nothing per-room is ever in it.
 *
 * `splitV2Enabled()` reads `process.env` at call time, but Next inlines the value at BUILD time —
 * hence `vi.resetModules()` around each flag state, the same shape `flags.test.ts` uses.
 */
const prior = process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED

async function manifestWith(v2: boolean) {
    vi.resetModules()
    if (v2) process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED = '1'
    else delete process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED
    const { default: manifest } = await import('./pwa-manifest')
    return manifest()
}

beforeEach(() => {
    vi.resetModules()
})

afterAll(() => {
    if (prior === undefined) delete process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED
    else process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED = prior
})

describe('the installed app is named Split', () => {
    it('names the launcher entry Split in both flag states', async () => {
        for (const v2 of [false, true]) {
            const manifest = await manifestWith(v2)
            expect(manifest.name).toBe('Split')
            expect(manifest.short_name).toBe('Split')
        }
    })

    it('keeps its existing identity but launches the operational app home', async () => {
        for (const v2 of [false, true]) {
            const manifest = await manifestWith(v2)
            expect(manifest.id).toBe('/')
            expect(manifest.start_url).toBe('/app')
            expect(manifest.scope).toBe('/')
        }
    })
})

describe('shortcuts', () => {
    it('offers new-room and import entry points in both flag states', async () => {
        for (const v2 of [false, true]) {
            const manifest = await manifestWith(v2)
            expect(manifest.shortcuts?.map((shortcut) => shortcut.url)).toEqual(['/new', '/import'])
        }
    })
})

describe('share_target', () => {
    it('does not advertise a scanner destination in a rollback build', async () => {
        expect((await manifestWith(false)).share_target).toBeUndefined()
    })

    it('offers Android an image-only receipt handoff in a scanner build', async () => {
        expect((await manifestWith(true)).share_target).toEqual({
            action: '/api/share-target',
            method: 'POST',
            enctype: 'multipart/form-data',
            params: { files: [{ name: 'receipt', accept: ['image/*'] }] },
        })
    })
})

describe('the room slug never leaves the device', () => {
    it('publishes no room path in either flag state', async () => {
        for (const v2 of [false, true]) {
            const manifest = await manifestWith(v2)
            expect(JSON.stringify(manifest)).not.toMatch(/\/r\//)
        }
    })
})
