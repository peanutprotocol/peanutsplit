import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The manifest is the one file this app publishes to the operating system, uncredentialed and
 * cached by the browser for as long as it likes. Two things therefore have to hold mechanically:
 * the installed app is called "Split", and nothing per-room is ever in it.
 *
 * `splitV2Enabled()` reads `process.env` at call time, but Next inlines the value at BUILD time —
 * hence `vi.resetModules()` around each flag state, the same shape `flags.test.ts` uses.
 */
const prior = process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED

async function manifestWith(v2: boolean) {
    vi.resetModules()
    if (v2) process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED = '1'
    else delete process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED
    const { default: manifest } = await import('./manifest')
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
})

describe('shortcuts', () => {
    it('offers only the screen that works with no room on the device', async () => {
        const manifest = await manifestWith(false)
        expect(manifest.shortcuts).toEqual([{ name: 'New split', url: '/new' }])
    })

    it('adds the importer only where /import is not a 404', async () => {
        const manifest = await manifestWith(true)
        expect(manifest.shortcuts?.map((shortcut) => shortcut.url)).toEqual(['/new', '/import'])
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
