import type { NextRequest } from 'next/server'
import pwaManifest, { isCanonicalPwaRequest } from '@/lib/pwa-manifest'

export const dynamic = 'force-dynamic'

/**
 * Serve the install identity only on the configured app origin. The legacy and preview origins
 * intentionally return an uncacheable 404 so Chrome cannot install a second, wrong-scope app.
 */
export function GET(request: NextRequest): Response {
    if (!isCanonicalPwaRequest(request.headers)) {
        return new Response(null, {
            status: 404,
            headers: { 'cache-control': 'private, no-store', vary: 'x-forwarded-host' },
        })
    }

    return Response.json(pwaManifest(), {
        headers: {
            'cache-control': 'public, max-age=0, must-revalidate',
            'content-type': 'application/manifest+json',
            vary: 'x-forwarded-host',
        },
    })
}
