import { CANONICAL_HOST, CANONICAL_ORIGIN, LEGACY_ALIAS_HOST } from './domains'

export interface CanonicalRedirect {
    target: string
    status: 308
}

const PROBE_PATHS = new Set(['/healthcheck', '/readiness'])

function bareHost(host: string): string {
    return host.trim().toLowerCase().replace(/:\d+$/, '')
}

/**
 * Collapse every public alias onto peanutsplit.com while preserving the path and query.
 * Probe endpoints stay host-local so Dokploy can keep checking both configured domains.
 */
export function canonicalRedirect(host: string, pathname: string, search: string): CanonicalRedirect | null {
    if (PROBE_PATHS.has(pathname)) return null

    const requestedHost = bareHost(host)
    const isAlias =
        requestedHost === LEGACY_ALIAS_HOST ||
        requestedHost === `www.${LEGACY_ALIAS_HOST}` ||
        requestedHost === `www.${CANONICAL_HOST}`
    if (!isAlias) return null

    return { target: `${CANONICAL_ORIGIN}${pathname}${search}`, status: 308 }
}
