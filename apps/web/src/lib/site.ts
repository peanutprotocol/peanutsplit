import { CANONICAL_ORIGIN, isLoopbackHost } from './domains'

/**
 * The one origin used by product links and metadata.
 *
 * `NEXT_PUBLIC_BASE_URL` remains a local/E2E convenience. A public hostname in that
 * build argument is deliberately ignored so stale deployment configuration cannot move
 * the product identity away from peanutsplit.com again.
 */
function configuredLoopbackOrigin(value: string | undefined): string | null {
    if (!value) return null
    try {
        const url = new URL(value)
        if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !isLoopbackHost(url.hostname)) return null
        return url.origin
    } catch {
        return null
    }
}

export function resolveSiteUrl(value: string | undefined): string {
    return configuredLoopbackOrigin(value) ?? CANONICAL_ORIGIN
}

export const siteUrl = resolveSiteUrl(process.env.NEXT_PUBLIC_BASE_URL)
