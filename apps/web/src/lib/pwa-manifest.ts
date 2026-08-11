import type { MetadataRoute } from 'next'
import { splitV2Enabled } from '@/lib/flags'
import { SHARE_TARGET_ACTION, SHARE_TARGET_FIELD } from '@/lib/shared-receipt'

export const PRODUCTION_PWA_HOST = 'split.peanut.me'

const LOCAL_PWA_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]'])

type HeaderReader = Pick<Headers, 'get'>

type PwaRequestAuthority = {
    host: string
    port: number | null
}

function parsedPwaRequestAuthority(headers: HeaderReader): PwaRequestAuthority | null {
    const forwarded = headers.get('x-forwarded-host')
    const raw = forwarded === null ? headers.get('host') : forwarded
    if (!raw || raw !== raw.trim() || raw.includes(',')) return null

    const ipv6 = raw.match(/^\[(::1)\](?::([0-9]{1,5}))?$/i)
    const domain = raw.match(/^([^:]+)(?::([0-9]{1,5}))?$/)
    if (!ipv6 && !domain) return null

    const host = ipv6 ? `[${ipv6[1].toLowerCase()}]` : domain![1].toLowerCase()
    const portText = (ipv6 ?? domain)![2]
    const port = portText === undefined ? null : Number(portText)
    if (port !== null && (port < 1 || port > 65_535)) return null
    if (port !== null && String(port) !== portText) return null

    if (
        !ipv6 &&
        (host.length > 253 || host.split('.').some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))
    ) {
        return null
    }

    return { host, port }
}

/**
 * Resolve the public request host without ever falling through a present forwarded-host claim.
 * Dokploy supplies X-Forwarded-Host; local Next requests use Host. Reject lists and URL-shaped
 * values rather than guessing which element or substring a proxy meant.
 */
export function pwaRequestHost(headers: HeaderReader): string | null {
    return parsedPwaRequestAuthority(headers)?.host ?? null
}

/** The production manifest belongs to one origin. Loopback remains usable in dev and E2E only. */
export function isCanonicalPwaRequest(
    headers: HeaderReader,
    environment: string | undefined = process.env.NODE_ENV
): boolean {
    const authority = parsedPwaRequestAuthority(headers)
    if (authority === null) return false
    if (authority.host === PRODUCTION_PWA_HOST) return authority.port === null || authority.port === 443
    return environment !== 'production' && LOCAL_PWA_HOSTS.has(authority.host)
}

/**
 * The installed app is "Split". "Peanut Split" stays on the surfaces a search engine or a group
 * chat sees — the root `<title>`, `SITE_NAME`, the OG unfurls. A home screen has room for one word.
 *
 * Nothing per-room can appear here. The manifest is one static file fetched without credentials,
 * and a room slug IS the credential — so there is no shortcut to a room, and there never can be.
 */
export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'Split',
        short_name: 'Split',
        description: 'Split expenses with a link. No signup.',
        // Pin the identity the old implicit manifest had while moving only its launch surface.
        // Without `id`, some browsers derive it from start_url and can treat this as a second app.
        id: '/',
        start_url: '/app',
        scope: '/',
        display: 'standalone',
        display_override: ['standalone'],
        orientation: 'portrait',
        theme_color: '#FFC900',
        background_color: '#FAF4F0',
        /**
         * Long-press the launcher icon. English in every language, deliberately: the manifest is
         * fetched without credentials, so the `ps-locale` cookie cannot reach it, and `name` and
         * `description` above are English for the same reason.
         *
         * No icons — they are optional, every launcher falls back to the app icon, and three more
         * 96x96 assets are exactly the work that waits on `feat-logo`.
         */
        shortcuts: [
            // The one thing somebody opens the app cold to do, and the only screen that works with
            // no room on this device at all. `start_url` already covers "take me to my rooms".
            { name: 'New split', url: '/new' },
            { name: 'Import from Splitwise', url: '/import' },
        ],
        // Android only exposes this entry for an installed PWA. Keep it on the same build-time
        // boundary as the scanner: a rollback build must not advertise a destination it will
        // immediately refuse. The OS handoff intentionally starts at receipt review rather than
        // passing through the camera screen's provider-terms note; that product decision is
        // documented in ROADMAP.md.
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
