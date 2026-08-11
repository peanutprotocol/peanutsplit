import manifest, { isCanonicalPwaRequest } from '@/lib/pwa-manifest'

export const dynamic = 'force-dynamic'

export function GET(request: Request): Response {
    if (!isCanonicalPwaRequest(request.headers)) {
        return new Response(null, {
            status: 404,
            headers: {
                'cache-control': 'private, no-store',
                vary: 'x-forwarded-host',
            },
        })
    }

    return Response.json(manifest(), {
        headers: {
            'cache-control': 'public, max-age=0, must-revalidate',
            'content-type': 'application/manifest+json',
            vary: 'x-forwarded-host',
        },
    })
}
