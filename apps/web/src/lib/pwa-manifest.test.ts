import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    hostnameFromHostHeader,
    isCanonicalPwaRequest,
    pwaCanonicalHost,
    pwaRequestHostname,
    type PwaRequestHeaders,
} from './pwa-manifest'

const prior = process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED

const requestHeaders = (values: Partial<Record<'host' | 'x-forwarded-host', string>>): PwaRequestHeaders => ({
    get: (name) => values[name] ?? null,
})

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

describe('PWA request hostname', () => {
    it('normalises case and valid ports without guessing through forwarded lists', () => {
        expect(hostnameFromHostHeader('Split.Peanut.Me:443')).toBe('split.peanut.me')
        expect(hostnameFromHostHeader('split.peanut.me:443, ingress.internal')).toBeNull()
    })

    it('prefers the forwarded public host to the container host', () => {
        expect(
            pwaRequestHostname(requestHeaders({ host: '0.0.0.0:3000', 'x-forwarded-host': 'split.peanut.me' }))
        ).toBe('split.peanut.me')
    })

    it('fails closed for missing and invalid Host values', () => {
        for (const host of [
            null,
            '',
            ' split.peanut.me',
            'split.peanut.me/path',
            'person@split.peanut.me',
            'split.peanut.me?x=1',
            'split.peanut.me:0',
            'split.peanut.me:65536',
            'split..peanut.me',
        ]) {
            expect(hostnameFromHostHeader(host)).toBeNull()
        }
    })
})

describe('canonical PWA host boundary', () => {
    it('pins every non-local build to split.peanut.me, including the legacy site URL fallback', () => {
        expect(pwaCanonicalHost('split.peanut.me')).toBe('split.peanut.me')
        expect(pwaCanonicalHost('peanutsplit.com')).toBe('split.peanut.me')
        expect(pwaCanonicalHost('preview.example.com')).toBe('split.peanut.me')
        expect(pwaCanonicalHost('localhost')).toBe('localhost')
    })

    it('accepts only the exact configured host', () => {
        expect(isCanonicalPwaRequest(requestHeaders({ host: 'split.peanut.me:443' }), 'split.peanut.me')).toBe(true)

        for (const host of [
            'split.peanut.me:8443',
            'peanutsplit.com',
            'www.split.peanut.me',
            'preview.example.com',
            '',
        ]) {
            expect(isCanonicalPwaRequest(requestHeaders({ host }), 'split.peanut.me')).toBe(false)
        }
    })

    it('supports local dev only when localhost is the configured canonical host', () => {
        expect(isCanonicalPwaRequest(requestHeaders({ host: 'localhost:3100' }), 'localhost')).toBe(true)
        expect(isCanonicalPwaRequest(requestHeaders({ host: '127.0.0.1:3100' }), 'localhost')).toBe(false)
    })

    it('fails closed when a present forwarded authority is invalid', () => {
        expect(
            isCanonicalPwaRequest(
                requestHeaders({ host: 'split.peanut.me', 'x-forwarded-host': 'split.peanut.me, proxy.internal' }),
                'split.peanut.me'
            )
        ).toBe(false)
    })
})

describe('the installed app identity', () => {
    it('names the launcher entry Split and launches the operational home in both flag states', async () => {
        for (const v2 of [false, true]) {
            const manifest = await manifestWith(v2)
            expect(manifest.name).toBe('Split')
            expect(manifest.short_name).toBe('Split')
            expect(manifest.id).toBe('/')
            expect(manifest.start_url).toBe('/app')
            expect(manifest.scope).toBe('/')
        }
    })

    it('publishes no room path, including in shortcuts, in either flag state', async () => {
        for (const v2 of [false, true]) {
            const manifest = await manifestWith(v2)
            expect(manifest.shortcuts?.map((shortcut) => shortcut.url)).toEqual(['/new', '/import'])
            expect(JSON.stringify(manifest)).not.toMatch(/\/r\//)
        }
    })
})

describe('share target', () => {
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
