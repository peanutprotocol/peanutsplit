import manifest from '@/lib/pwa-manifest'

export const dynamic = 'force-static'

export function GET(): Response {
    return Response.json(manifest(), {
        headers: {
            'cache-control': 'public, max-age=0, must-revalidate',
            'content-type': 'application/manifest+json',
        },
    })
}
