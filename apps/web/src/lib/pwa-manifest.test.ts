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

describe('the manifest request host boundary', () => {
    const boundary = async (
        values: Record<string, string>,
        configuredSiteUrl = 'https://peanutsplit.com'
    ): Promise<{ host: string | null; canonical: boolean }> => {
        const { isCanonicalPwaRequest, pwaRequestHost } = await import('./pwa-manifest')
        const normalized = Object.fromEntries(
            Object.entries(values).map(([name, value]) => [name.toLowerCase(), value])
        )
        const headers = { get: (name: string) => normalized[name.toLowerCase()] ?? null }
        return {
            host: pwaRequestHost(headers),
            canonical: isCanonicalPwaRequest(headers, configuredSiteUrl),
        }
    }

    it('accepts the exact canonical forwarded host, normalized for case and a default port', async () => {
        await expect(boundary({ 'x-forwarded-host': 'PEANUTSPLIT.COM:443' })).resolves.toEqual({
            host: 'peanutsplit.com',
            canonical: true,
        })
    })

    it('falls back to Host only when X-Forwarded-Host is absent', async () => {
        await expect(boundary({ host: 'peanutsplit.com' })).resolves.toEqual({
            host: 'peanutsplit.com',
            canonical: true,
        })
        await expect(boundary({ host: 'peanutsplit.com', 'x-forwarded-host': 'split.peanut.me' })).resolves.toEqual({
            host: 'split.peanut.me',
            canonical: false,
        })
    })

    it('binds a neutral self-host manifest to its configured HTTPS authority', async () => {
        await expect(
            boundary({ 'x-forwarded-host': 'SPLIT.EXAMPLE.ORG:8443' }, 'https://split.example.org:8443')
        ).resolves.toEqual({ host: 'split.example.org', canonical: true })
        await expect(
            boundary({ 'x-forwarded-host': 'peanutsplit.com' }, 'https://split.example.org:8443')
        ).resolves.toEqual({ host: 'peanutsplit.com', canonical: false })
        await expect(
            boundary({ 'x-forwarded-host': 'split.example.org' }, 'https://split.example.org:8443')
        ).resolves.toEqual({ host: 'split.example.org', canonical: false })
    })

    it.each([
        '',
        ' peanutsplit.com',
        'peanutsplit.com ',
        'peanutsplit.com, split.peanut.me',
        'https://peanutsplit.com',
        'user@peanutsplit.com',
        'peanutsplit.com/path',
        'peanutsplit.com.',
        '@peanutsplit.com',
        '//peanutsplit.com',
        'peanutsplit.com/.',
        'peanutsplit%2ecom',
        'peanutsplit.com?',
        'peanutsplit.com:',
        'peanutsplit.com:0443',
    ])('rejects malformed forwarded host %j without falling through to Host', async (forwardedHost) => {
        await expect(boundary({ host: 'peanutsplit.com', 'x-forwarded-host': forwardedHost })).resolves.toEqual({
            host: null,
            canonical: false,
        })
    })

    it('rejects a non-HTTPS production authority without rejecting its valid hostname', async () => {
        await expect(boundary({ 'x-forwarded-host': 'peanutsplit.com:444' })).resolves.toEqual({
            host: 'peanutsplit.com',
            canonical: false,
        })
    })

    it('allows only the exact configured loopback authority', async () => {
        await expect(boundary({ host: 'localhost:3100' }, 'http://localhost:3100')).resolves.toEqual({
            host: 'localhost',
            canonical: true,
        })
        await expect(boundary({ host: 'localhost:3100' }, 'http://localhost:3000')).resolves.toEqual({
            host: 'localhost',
            canonical: false,
        })
    })
})
