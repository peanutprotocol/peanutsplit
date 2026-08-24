import { isProductHost } from './domains'
import { parseRequestAuthority, requestAuthorityMatchesOrigin, resolveSiteUrl } from './site'

export interface CanonicalRedirect {
    target: string
    status: 308
}

const PROBE_PATHS = new Set(['/healthcheck', '/readiness'])

/**
 * Collapse every official public host onto the configured product origin while preserving the
 * path and query. The request authority can decide whether a redirect is needed, but it can never
 * choose its destination. Probe endpoints stay host-local so Dokploy can keep checking aliases.
 */
export function canonicalRedirect(
    host: string,
    pathname: string,
    search: string,
    configuredSiteUrl: string
): CanonicalRedirect | null {
    if (PROBE_PATHS.has(pathname)) return null

    const requested = parseRequestAuthority(host)
    if (!requested) return null

    const targetOrigin = resolveSiteUrl(configuredSiteUrl)
    const targetHost = new URL(targetOrigin).hostname.toLowerCase()
    if (!isProductHost(requested.host) && requested.host !== targetHost) return null
    if (requestAuthorityMatchesOrigin(host, targetOrigin)) return null

    return { target: `${targetOrigin}${pathname}${search}`, status: 308 }
}
