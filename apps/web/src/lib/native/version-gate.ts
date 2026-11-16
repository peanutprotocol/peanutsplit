import { apiUrl, nativePlatform } from '../platform'
import { productUrl, siteUrl } from '../site'
import { loadHost } from './host'

type Platform = 'ios' | 'android' | 'web'

/** A slow network must never hold the app on an old screen; after this the check gives up. */
const FETCH_TIMEOUT_MS = 4_000
/** Resume checks are cheap but not free: one per 10 minutes is enough for an escape hatch. */
const RESUME_INTERVAL_MS = 10 * 60 * 1_000

function storeUrlFor(config: unknown, platform: Platform): string | null {
    if (platform === 'web' || typeof config !== 'object' || config === null) return null
    const store = (config as { store?: unknown }).store
    if (typeof store !== 'object' || store === null) return null
    const url = (store as Record<string, unknown>)[platform]
    return typeof url === 'string' && url.startsWith('https://') ? url : null
}

function minBuildFor(config: unknown, platform: Platform): number | null {
    if (platform === 'web' || typeof config !== 'object' || config === null) return null
    const minBuild = (config as { minBuild?: unknown }).minBuild
    if (typeof minBuild !== 'object' || minBuild === null) return null
    const value = (minBuild as Record<string, unknown>)[platform]
    return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * True when `config` (public/app-config.json) says this build is too old for `platform`. Fails
 * open: anything it cannot read lets the app run. A config without a store URL for the platform
 * also lets the app run, because the update screen would have no way to update.
 */
export function shouldBlock(config: unknown, platform: Platform, build: number): boolean {
    const minBuild = minBuildFor(config, platform)
    if (minBuild === null || storeUrlFor(config, platform) === null) return false
    return Number.isFinite(build) && build < minBuild
}

/**
 * The web URL that "Open in browser" opens from the update screen, for the screen the person
 * was on: the canonical room link from a room, else the web rooms home. Never a store URL: the
 * web room is always complete, so an old build must never wall someone off from a room.
 */
export function gateFallbackUrl(pathname: string, search: string): string {
    const onRoom = pathname === '/room/' || pathname === '/room' || pathname.startsWith('/room/import')
    const slug = onRoom ? new URLSearchParams(search).get('slug') : null
    // Built from productUrl('/r/') with URL resolution, so the slug is encoded as one path segment.
    if (slug) return new URL(encodeURIComponent(slug), productUrl('/r/')).href
    return `${siteUrl}/app`
}

/**
 * Fetches the version config and returns the store URL to show when this build must update, or
 * null to let the app run. Every failure (network, timeout, HTTP error, bad JSON, missing fields,
 * unknown platform or build) returns null: offline use is never blocked.
 */
export async function fetchGateStoreUrl(
    fetchConfig: (url: string, init: RequestInit) => Promise<Response>,
    platform: Platform,
    build: number | null
): Promise<string | null> {
    if (build === null || platform === 'web') return null
    try {
        const response = await fetchConfig(apiUrl('/app-config.json'), {
            cache: 'no-store',
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        })
        if (!response.ok) return null
        const config: unknown = await response.json()
        return shouldBlock(config, platform, build) ? storeUrlFor(config, platform) : null
    } catch {
        return null
    }
}

// The gate state lives at module level so NativeLinks (resume) and VersionGate (render) share it
// without a context provider.
let storeUrl: string | null = null
let lastCheckAt = 0
const listeners = new Set<(url: string | null) => void>()

async function runCheck(): Promise<void> {
    lastCheckAt = Date.now()
    const build = (await loadHost()?.then((host) => host.app.getBuildNumber())) ?? null
    const next = await fetchGateStoreUrl(fetch, nativePlatform(), build)
    if (next === storeUrl) return
    storeUrl = next
    listeners.forEach((listener) => listener(next))
}

/**
 * Fetches the version config again, at most once per 10 minutes. NativeLinks calls it when the
 * app resumes; VersionGate runs the first check on boot through subscribeVersionGate.
 */
export function checkVersionNow(): void {
    if (Date.now() - lastCheckAt < RESUME_INTERVAL_MS) return
    void runCheck()
}

/**
 * Calls `listener` with the store URL whenever the gate opens or closes, and runs the boot check
 * once. Returns a disposer.
 */
export function subscribeVersionGate(listener: (url: string | null) => void): () => void {
    listeners.add(listener)
    if (lastCheckAt === 0) void runCheck()
    else listener(storeUrl)
    return () => {
        listeners.delete(listener)
    }
}
