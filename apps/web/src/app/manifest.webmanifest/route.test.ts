import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { pwaCanonicalHost } from '@/lib/pwa-manifest'
import { GET } from './route'

const canonicalHost = pwaCanonicalHost()
const canonicalAuthority = canonicalHost === 'split.peanut.me' ? `${canonicalHost}:443` : `${canonicalHost}:3000`

const request = (host: string, forwardedHost?: string) =>
    new NextRequest('http://0.0.0.0:3000/manifest.webmanifest', {
        headers: {
            host,
            ...(forwardedHost ? { 'x-forwarded-host': forwardedHost } : {}),
        },
    })

describe('GET /manifest.webmanifest', () => {
    it('serves Split from the configured canonical host without any room identity', async () => {
        const response = GET(request(canonicalAuthority))
        const manifest = await response.json()

        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toBe('application/manifest+json')
        expect(response.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate')
        expect(response.headers.get('vary')).toBe('x-forwarded-host')
        expect(manifest).toMatchObject({ name: 'Split', short_name: 'Split', id: '/', start_url: '/app', scope: '/' })
        expect(JSON.stringify(manifest)).not.toContain('/r/')
    })

    it('returns an uncacheable 404 on the legacy and unknown hosts', () => {
        for (const host of ['peanutsplit.com', 'www.split.peanut.me', 'preview.example.com']) {
            const response = GET(request(host))
            expect(response.status).toBe(404)
            expect(response.headers.get('cache-control')).toBe('private, no-store')
            expect(response.headers.get('vary')).toBe('x-forwarded-host')
        }
    })

    it('uses the forwarded public host instead of the container host', () => {
        expect(GET(request('0.0.0.0:3000', canonicalHost)).status).toBe(200)
        expect(GET(request(canonicalHost, 'peanutsplit.com')).status).toBe(404)
        expect(GET(request(canonicalHost, `${canonicalHost}, ingress.internal`)).status).toBe(404)
    })
})
