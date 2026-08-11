import type { MetadataRoute } from 'next'
import { CANONICAL_APP_HOST, isLoopbackHost } from '@/lib/domains'
import { splitV2Enabled } from '@/lib/flags'
import { SHARE_TARGET_ACTION, SHARE_TARGET_FIELD } from '@/lib/shared-receipt'

/** The two headers expose the same public host in production; the forwarded value wins behind ingress. */
export interface PwaRequestHeaders {
    get(name: 'host' | 'x-forwarded-host'): string | null
}

/** The production PWA identity is permanent even if a build-time SEO base URL is misconfigured. */
export const PRODUCTION_PWA_HOST = 'split.peanut.me'

interface PwaRequestAuthority {
    host: string
    port: number | null
}

/**
 * Parse a single HTTP authority without guessing through proxy lists or URL-shaped values.
 *
 * Port is part of an origin. Production therefore accepts only its default HTTPS authority, while
 * local candidate builds may use their configured forwarded port. A present malformed
 * X-Forwarded-Host never falls through to Host.
 */
function parsedPwaRequestAuthority(value: string | null | undefined): PwaRequestAuthority | null {
    if (!value || value !== value.trim() || value.includes(',')) return null

    const ipv6 = value.match(/^\[(::1)\](?::([0-9]{1,5}))?$/i)
    const domain = value.match(/^([^:]+)(?::([0-9]{1,5}))?$/)
    if (!ipv6 && !domain) return null

    const host = ipv6 ? `[${ipv6[1].toLowerCase()}]` : domain![1].toLowerCase()
    const portText = (ipv6 ?? domain)![2]
    const port = portText === undefined ? null : Number(portText)
    if (port !== null && (port < 1 || port > 65_535 || String(port) !== portText)) return null

    if (
        !ipv6 &&
        (host.length > 253 || host.split('.').some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))
    ) {
        return null
    }

    return { host, port }
}

export function hostnameFromHostHeader(value: string | null | undefined): string | null {
    return parsedPwaRequestAuthority(value)?.host ?? null
}

/** Resolve the public request hostname using the same ingress convention as `proxy.ts`. */
export function pwaRequestHostname(headers: PwaRequestHeaders): string | null {
    const forwardedHost = headers.get('x-forwarded-host')
    return parsedPwaRequestAuthority(forwardedHost ?? headers.get('host'))?.host ?? null
}

/**
 * Local builds advertise themselves so installability can be exercised in dev and E2E. Every
 * non-local build is pinned to the real product origin; notably, the historical `siteUrl` fallback
 * of peanutsplit.com can never make the retired origin installable again.
 */
export function pwaCanonicalHost(configuredHost: string = CANONICAL_APP_HOST): string {
    const configured = hostnameFromHostHeader(configuredHost)
    return configured !== null && isLoopbackHost(configured) ? configured : PRODUCTION_PWA_HOST
}

/**
 * Whether this response may advertise or serve Split's install identity.
 *
 * Exact matching is deliberate. `peanutsplit.com`, `www.split.peanut.me`, preview deployments and
 * unknown hosts must not become separate installable applications. Dev/e2e still work because
 * their build config makes `localhost` the canonical host.
 */
export function isCanonicalPwaRequest(headers: PwaRequestHeaders, canonicalHost: string = pwaCanonicalHost()): boolean {
    const forwardedHost = headers.get('x-forwarded-host')
    const request = parsedPwaRequestAuthority(forwardedHost ?? headers.get('host'))
    const canonical = hostnameFromHostHeader(canonicalHost)
    if (request === null || canonical === null || request.host !== canonical) return false
    // `split.peanut.me:8443` is a different origin. Loopback ports remain available for the
    // production-build browser gate and local development only.
    return canonical === PRODUCTION_PWA_HOST ? request.port === null || request.port === 443 : isLoopbackHost(canonical)
}

/**
 * The installed app is "Split". "Peanut Split" stays on the surfaces a search engine or a group
 * chat sees — the document title, SEO schema and OG unfurls. A home screen has room for one word.
 *
 * Nothing per-room can appear here. The manifest is fetched without credentials and a room slug
 * is the credential, so the operating-system identity and launch target must remain room-agnostic.
 */
export default function pwaManifest(): MetadataRoute.Manifest {
    return {
        name: 'Split',
        short_name: 'Split',
        description: 'Split expenses with a link. No signup.',
        // Keep one stable app identity while launching into the operational, room-agnostic home.
        id: '/',
        start_url: '/app',
        scope: '/',
        display: 'standalone',
        display_override: ['standalone'],
        orientation: 'portrait',
        theme_color: '#FFC900',
        background_color: '#FAF4F0',
        shortcuts: [
            { name: 'New split', url: '/new' },
            { name: 'Import from Splitwise', url: '/import' },
        ],
        // A rollback build must not advertise a share destination it will immediately refuse.
        ...(splitV2Enabled()
            ? {
                  share_target: {
                      action: SHARE_TARGET_ACTION,
                      method: 'POST' as const,
                      enctype: 'multipart/form-data' as const,
                      params: {
                          files: [{ name: SHARE_TARGET_FIELD, accept: ['image/*'] }],
                      },
                  },
              }
            : {}),
        // Generated by scripts/generate-icons.mjs (`pnpm icons`) — don't hand-edit the PNGs.
        icons: [
            {
                src: '/icons/icon-192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any',
            },
            {
                src: '/icons/icon-512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any',
            },
            {
                src: '/icons/icon-192-maskable.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'maskable',
            },
            {
                src: '/icons/icon-512-maskable.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable',
            },
        ],
    }
}
