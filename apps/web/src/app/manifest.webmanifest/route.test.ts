import { describe, expect, it } from 'vitest'
import { GET } from './route'

const request = (forwardedHost: string) =>
    new Request('https://renderer.invalid/manifest.webmanifest', {
        headers: { 'x-forwarded-host': forwardedHost },
    })

describe('the origin-bound PWA manifest route', () => {
    it('serves the manifest on the canonical Split host', async () => {
        const response = GET(request('peanutsplit.com'))

        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toBe('application/manifest+json')
        expect(response.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate')
        await expect(response.json()).resolves.toMatchObject({ name: 'Split', start_url: '/app', scope: '/' })
    })

    it.each([
        'split.peanut.me',
        '@peanutsplit.com',
        '//peanutsplit.com',
        'peanutsplit.com/.',
        'peanutsplit%2ecom',
        'peanutsplit.com?',
        'peanutsplit.com:',
        'peanutsplit.com:444',
    ])('fails closed without publishing an install identity for authority %j', async (authority) => {
        const response = GET(request(authority))

        expect(response.status).toBe(404)
        expect(response.headers.get('cache-control')).toBe('private, no-store')
        expect(await response.text()).toBe('')
    })
})
