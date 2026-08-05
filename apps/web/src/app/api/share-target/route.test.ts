import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'

describe('POST /api/share-target without a service worker', () => {
    it('redirects to a same-origin relative landing path behind a reverse proxy', async () => {
        const response = await POST(new NextRequest('https://0.0.0.0:3000/api/share-target', { method: 'POST' }))

        expect(response.status).toBe(303)
        expect(response.headers.get('location')).toBe('/share-target')
    })
})
