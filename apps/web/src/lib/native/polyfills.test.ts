import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The native side as state: files in the app cache, and what the share sheet was given.
const native = vi.hoisted(() => ({
    cache: new Map<string, string>(),
    sheets: [] as Array<{ title?: string; text?: string; url?: string; files?: string[] }>,
    sheetResult: true,
    cacheWorks: true,
}))

vi.mock('./capacitor/index', () => ({
    filesystem: {
        writeCacheFile: async (name: string, data: string) => {
            if (!native.cacheWorks) return null
            native.cache.set(name, data)
            return `file:///cache/${name}`
        },
    },
    share: {
        share: async (input: (typeof native.sheets)[number]) => {
            if (!native.sheetResult) return false
            native.sheets.push(input)
            return true
        },
    },
}))

type SharingNavigator = { share?: (data?: ShareData) => Promise<void>; canShare?: (data?: ShareData) => boolean }
let nav: SharingNavigator

beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_NATIVE_BUILD', '1')
    native.cache.clear()
    native.sheets.length = 0
    native.sheetResult = true
    native.cacheWorks = true
    nav = {}
    vi.stubGlobal('navigator', nav)
})

afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
})

async function install() {
    const module = await import('./polyfills')
    module.installSharePolyfill()
    return module
}

const decode = (base64: string) => Buffer.from(base64, 'base64').toString('utf8')

describe('installSharePolyfill', () => {
    it('defines share and canShare where the WebView has none (Android)', async () => {
        await install()
        expect(typeof nav.share).toBe('function')
        expect(nav.canShare?.({ url: 'https://peanutsplit.com/r/ski-trip-kunc-syrup-drum' })).toBe(true)
        expect(nav.canShare?.({})).toBe(false)
        expect(nav.canShare?.({ files: [] })).toBe(false)
        expect(nav.canShare?.({ files: [new File(['x'], 'a.png')] })).toBe(true)
    })

    it("keeps the WebView's own share (iOS)", async () => {
        const own = async () => {}
        nav.share = own
        await install()
        expect(nav.share).toBe(own)
        expect(nav.canShare).toBeUndefined()
    })

    it('shares text and a link through the native sheet', async () => {
        await install()
        await nav.share?.({ text: 'Ski trip', url: 'https://peanutsplit.com/r/ski-trip-kunc-syrup-drum' })
        expect(native.sheets).toEqual([
            {
                title: undefined,
                text: 'Ski trip',
                url: 'https://peanutsplit.com/r/ski-trip-kunc-syrup-drum',
                files: undefined,
            },
        ])
        expect(native.cache.size).toBe(0)
    })

    it('writes each file to the cache and shares it by URI', async () => {
        await install()
        const card = new File(['card-bytes'], 'room-card.png', { type: 'image/png' })
        const csv = new File(['a,b'], '../../escape.csv', { type: 'text/csv' })
        await nav.share?.({ files: [card, csv] })

        expect(decode(native.cache.get('room-card.png') ?? '')).toBe('card-bytes')
        // A path in the name never leaves the cache folder.
        expect(decode(native.cache.get('escape.csv') ?? '')).toBe('a,b')
        expect(native.sheets[0].files).toEqual(['file:///cache/room-card.png', 'file:///cache/escape.csv'])
    })

    it('rejects with AbortError when the sheet is dismissed, so callers stay quiet', async () => {
        await install()
        native.sheetResult = false
        await expect(nav.share?.({ url: 'https://peanutsplit.com' })).rejects.toMatchObject({ name: 'AbortError' })
        expect(native.sheets).toEqual([])
    })

    it('rejects with DataError and opens no sheet when a file cannot be cached', async () => {
        await install()
        native.cacheWorks = false
        await expect(nav.share?.({ files: [new File(['x'], 'a.png')] })).rejects.toMatchObject({ name: 'DataError' })
        expect(native.sheets).toEqual([])
    })

    it('rejects an empty payload with TypeError, as Web Share does', async () => {
        await install()
        await expect(nav.share?.({})).rejects.toBeInstanceOf(TypeError)
        expect(native.sheets).toEqual([])
    })
})

describe('cacheFileName', () => {
    it('keeps the last path segment and never returns an empty or dot name', async () => {
        const { cacheFileName } = await import('./polyfills')
        expect(cacheFileName(new File([''], 'a/b/c.png'), 0)).toBe('c.png')
        expect(cacheFileName(new File([''], '..'), 1)).toBe('share-2')
        expect(cacheFileName(new File([''], ''), 0)).toBe('share-1')
    })
})
