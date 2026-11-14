import { CANONICAL_ORIGIN, isProductHost } from '../domains'
import { roomSlugFromLink } from '../recent-rooms'
import { siteUrl } from '../site'

/** Every route in the bundled app, as `src/app/(native)` exports them (trailing slash on). */
export const NATIVE_ROUTES: readonly string[] = ['/', '/app/', '/new/', '/room/', '/room/import/', '/import/']

/** The navigation calls `dispatchNativeLink` needs, injected so the function stays pure. */
export type NativeNav = {
    currentPath(): string
    replace(p: string): void
    push(p: string): void
    openExternal(u: string): void
}

/** Room query keys the room screen reads (its nuqs drawers); anything else on a shared link is chat decoration. */
const ROOM_QUERY_KEYS = ['add', 'expense', 'shared', 'manage', 'settings'] as const

/** Real links are short. A longer input is refused before any parsing work. */
const MAX_LINK_LENGTH = 2048

/** The shared room link's path prefix. */
const ROOM_LINK_PREFIX = '/r/'

/** `/r/<segment>` plus an optional tail such as `/import`, `/recap` or `/card/...`. */
const ROOM_LINK_PATH = /^(\/r\/[^/]+)(\/.*)?$/

/** App screens that keep their own path; the value is the exported route. */
const APP_SCREENS: Record<string, string> = {
    '/app': '/app/',
    '/new': '/new/',
    '/import': '/import/',
}

const ROOM_SCREENS: Record<string, string> = {
    '/room': '/room/',
    '/room/import': '/room/import/',
}

function parse(input: string): URL | null {
    const trimmed = input.trim()
    if (!trimmed || trimmed.length > MAX_LINK_LENGTH) return null
    try {
        // A path resolves against the product origin. Anything URL-shaped (`//host`, `/\host`,
        // `javascript:`) keeps its own host or scheme and is checked below like any other URL.
        if (trimmed.startsWith('/')) return new URL(trimmed, CANONICAL_ORIGIN)
        return new URL(/^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`)
    } catch {
        return null
    }
}

/** A room slug from a `/r/<segment>` prefix, validated by the same contract as pasted links. */
function slugFromRoomPrefix(prefix: string): string | null {
    return roomSlugFromLink(CANONICAL_ORIGIN + prefix, CANONICAL_ORIGIN)
}

function roomTarget(base: '/room/' | '/room/import/', slug: string, url: URL): string {
    const query = new URLSearchParams({ slug })
    for (const key of ROOM_QUERY_KEYS) {
        const value = url.searchParams.get(key)
        if (value !== null) query.set(key, value)
    }
    return `${base}?${query.toString()}${url.hash}`
}

/**
 * Maps a URL (a universal link, an App Link, a pasted link or a boot path) to an in-app path, an
 * external URL for the system browser, or null when the app has nothing to show for it.
 * ARCHITECTURE 4.4 is the table this follows.
 *
 * Only product hosts count. Room slugs pass the permanent `roomSlugFromLink` contract, so an
 * invalid slug never reaches navigation. An external result is rebuilt from the parsed path on
 * `siteUrl`, never echoed from the input.
 */
export function nativePathForUrl(input: string): { path: string } | { external: string } | null {
    const url = parse(input)
    if (!url) return null
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (url.username || url.password || !isProductHost(url.hostname)) return null

    const pathname = url.pathname

    const roomLink = pathname.match(ROOM_LINK_PATH)
    if (roomLink) {
        const slug = slugFromRoomPrefix(roomLink[1])
        if (!slug) return null
        const tail = roomLink[2] ?? ''
        const base = tail === '/import' || tail === '/import/' ? '/room/import/' : '/room/'
        return { path: roomTarget(base, slug, url) }
    }

    const trimmedPath = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname

    const appScreen = APP_SCREENS[trimmedPath]
    if (appScreen) return { path: `${appScreen}${url.search}${url.hash}` }

    const roomScreen = ROOM_SCREENS[trimmedPath]
    if (roomScreen) {
        return nativeRoomSlug(url.searchParams.get('slug')) ? { path: `${roomScreen}${url.search}${url.hash}` } : null
    }

    return { external: `${siteUrl}${pathname}${url.search}${url.hash}` }
}

/** The `?slug=` of a native room screen if it is a valid room slug, else null (the screen then goes home). */
export function nativeRoomSlug(slugParam: string | null): string | null {
    return slugParam ? slugFromRoomPrefix(ROOM_LINK_PREFIX + encodeURIComponent(slugParam)) : null
}

/** The room slug an in-app path opens, or null for any other screen. Used for the opened event. */
export function roomSlugOfNativePath(path: string): string | null {
    const url = parse(path)
    if (!url || !/^\/room\/(?:import\/)?$/.test(url.pathname)) return null
    return nativeRoomSlug(url.searchParams.get('slug'))
}

/** A link delivered twice within this window is one link (cold start: launch URL plus the replayed `appUrlOpen`). */
export const DUPLICATE_WINDOW_MS = 3_000
/** The launch URL an earlier page load of this WebView already handled; `getLaunchUrl` returns it after every reload. */
export const LAUNCH_HANDLED_KEY = 'ps:native:launch-handled'

// Shared by NativeEntry (source 'launch') and NativeLinks (source 'open'): the module lives as
// long as the page, and both callers must see the same last link.
let lastUrl: string | null = null
let lastAt = 0

function readLaunchHandled(): string | null {
    try {
        return globalThis.sessionStorage?.getItem(LAUNCH_HANDLED_KEY) ?? null
    } catch {
        return null
    }
}

function writeLaunchHandled(url: string): void {
    try {
        globalThis.sessionStorage?.setItem(LAUNCH_HANDLED_KEY, url)
    } catch {
        // Without sessionStorage a reload may replay the launch link once; the room is still right.
    }
}

/**
 * The one handler for a link, whether it arrives as the launch URL or through `appUrlOpen`, so a
 * cold start navigates exactly once. Rules in PLAN.md 4.1:
 *
 * 1. The same URL again within 3 s is a duplicate: no navigation.
 * 2. A launch URL this WebView session already handled is a replay (a reload returns it again).
 * 3. A URL the app cannot map is ignored.
 * 4. A product page the app does not have opens in the system browser. When that happens on the
 *    native root `/`, the app also moves to `/app/`, so the person never returns to a blank root.
 * 5. An in-app path replaces the current entry for the launch URL or from the root `/` (so `/`
 *    never stays in history under the room), else it is pushed (Android back returns).
 */
export function dispatchNativeLink(
    url: string,
    source: 'launch' | 'open',
    nav: NativeNav,
    now: number = Date.now()
): 'navigated' | 'duplicate' | 'replayed' | 'ignored' {
    if (url === lastUrl && now - lastAt <= DUPLICATE_WINDOW_MS) return 'duplicate'
    if (source === 'launch' && readLaunchHandled() === url) return 'replayed'

    const target = nativePathForUrl(url)
    if (!target) return 'ignored'

    lastUrl = url
    lastAt = now
    if (source === 'launch') writeLaunchHandled(url)

    const fromRoot = nav.currentPath() === '/'
    if ('external' in target) {
        nav.openExternal(target.external)
        if (fromRoot) nav.replace('/app/')
        return 'navigated'
    }
    if (source === 'launch' || fromRoot) nav.replace(target.path)
    else nav.push(target.path)
    return 'navigated'
}
