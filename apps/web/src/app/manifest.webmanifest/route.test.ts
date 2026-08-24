import { afterEach, describe, expect, it, vi } from 'vitest'

const priorSiteUrl = process.env.NEXT_PUBLIC_BASE_URL

const request = (forwardedHost: string) =>
    new Request('https://renderer.invalid/manifest.webmanifest', {
        headers: { 'x-forwarded-host': forwardedHost },
    })

const getFor = async (configuredSiteUrl: string, forwardedHost: string): Promise<Response> => {
    process.env.NEXT_PUBLIC_BASE_URL = configuredSiteUrl
    vi.resetModules()
    const { GET } = await import('./route')
    return GET(request(forwardedHost))
}

afterEach(() => {
    if (priorSiteUrl === undefined) delete process.env.NEXT_PUBLIC_BASE_URL
    else process.env.NEXT_PUBLIC_BASE_URL = priorSiteUrl
    vi.resetModules()
})

describe('the origin-bound PWA manifest route', () => {
    it('serves the manifest on a configured neutral HTTPS host', async () => {
        const response = await getFor('https://split.example.org:8443', 'split.example.org:8443')

        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toBe('application/manifest+json')
        expect(response.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate')
        await expect(response.json()).resolves.toMatchObject({ name: 'Split', start_url: '/app', scope: '/' })
    })

    it.each([
        'peanutsplit.com',
        'split.peanut.me',
        '@peanutsplit.com',
        '//peanutsplit.com',
        'peanutsplit.com/.',
        'peanutsplit%2ecom',
        'peanutsplit.com?',
        'peanutsplit.com:',
        'peanutsplit.com:444',
        'split.example.org',
        'split.example.org:443',
    ])('fails closed without publishing an install identity for non-configured authority %j', async (authority) => {
        const response = await getFor('https://split.example.org:8443', authority)

        expect(response.status).toBe(404)
        expect(response.headers.get('cache-control')).toBe('private, no-store')
        expect(await response.text()).toBe('')
    })
})
