import { CANONICAL_ORIGIN, isLoopbackHost } from './domains'

/**
 * The one origin used by product links and metadata.
 *
 * Public deployments must be HTTPS. Plain HTTP remains available only for loopback
 * development and E2E, where browsers treat it as a secure context. This accepts an
 * origin, not an arbitrary URL: credentials, paths, queries and fragments are rejected
 * instead of being silently discarded.
 */
function configuredOrigin(value: string | undefined): string | null {
    if (!value || value !== value.trim()) return null
    const match = value.match(/^https?:\/\/([^/?#]+)\/?$/i)
    if (!match || !parseRequestAuthority(match[1])) return null
    try {
        const url = new URL(value)
        if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null
        if (url.hostname.endsWith('.')) return null
        if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopbackHost(url.hostname))) return null
        return url.origin
    } catch {
        return null
    }
}

export function resolveSiteUrl(value: string | undefined): string {
    return configuredOrigin(value) ?? CANONICAL_ORIGIN
}

export const siteUrl = resolveSiteUrl(process.env.NEXT_PUBLIC_BASE_URL)

/** Build a product URL from the configured origin, never from the current request authority. */
export function productUrl(pathname: string, configuredSiteUrl: string = siteUrl): string {
    const path = pathname.startsWith('/') ? pathname : `/${pathname}`
    return `${resolveSiteUrl(configuredSiteUrl)}${path}`
}

export interface RequestAuthority {
    host: string
    port: number | null
}

/** Parse a single HTTP Host-style authority without URL-shaped or list-shaped ambiguity. */
export function parseRequestAuthority(value: string | null): RequestAuthority | null {
    if (!value || value !== value.trim() || /[\s,/%\\?#@]/.test(value)) return null

    const ipv6 = value.match(/^(\[[0-9a-f:.]+\])(?::([0-9]{1,5}))?$/i)
    const domain = value.match(/^([^:]+)(?::([0-9]{1,5}))?$/)
    if (!ipv6 && !domain) return null

    const rawHost = (ipv6 ?? domain)![1]
    const rawPort = (ipv6 ?? domain)![2]
    const port = rawPort === undefined ? null : Number(rawPort)
    if (port !== null && (port < 1 || port > 65_535 || String(port) !== rawPort)) return null

    let parsed: URL
    try {
        parsed = new URL(`http://${rawHost}`)
    } catch {
        return null
    }
    const host = parsed.hostname.toLowerCase()
    if (host !== rawHost.toLowerCase()) return null
    if (
        !ipv6 &&
        (host.endsWith('.') ||
            host.length > 253 ||
            host.split('.').some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))
    ) {
        return null
    }

    return { host, port }
}

/** Compare an untrusted request authority with a previously validated configured origin. */
export function requestAuthorityMatchesOrigin(value: string | null, configuredSiteUrl: string): boolean {
    const requested = parseRequestAuthority(value)
    if (!requested) return false

    const origin = resolveSiteUrl(configuredSiteUrl)
    const expected = new URL(origin)
    if (requested.host !== expected.hostname.toLowerCase()) return false

    if (expected.port) return requested.port === Number(expected.port)
    const defaultPort = expected.protocol === 'https:' ? 443 : 80
    return requested.port === null || requested.port === defaultPort
}
