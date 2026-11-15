import { roomPath } from '../platform'
import { dispatchNativeLink, nativePathForUrl, type NativeNav } from './links'

/** The app's rooms home; RecentRoomAppEntry there moves a returning person to their latest room. */
export const NATIVE_HOME = '/app/'

/** The rooms list itself: `/app/` without the redirect to the latest room. */
export const NATIVE_ROOMS_LIST = '/app/?manage=1'

/** On these screens Android back leaves the app instead of walking back into a room. */
const isHomePath = (pathname: string): boolean => pathname === '/' || pathname === '/app' || pathname === '/app/'

/**
 * What Android back does. Without in-app history (every launcher open, cold link and cold push tap
 * reaches the room through replace), back goes to the rooms list, not to `NATIVE_HOME`: that would
 * redirect straight back into the same room, so back would never leave the app.
 */
export function backAction(pathname: string, canGoBack: boolean): 'minimize' | 'history-back' | { replace: string } {
    if (isHomePath(pathname)) return 'minimize'
    // Drawers are history entries (nuqs), so an open drawer closes first.
    if (canGoBack) return 'history-back'
    return { replace: NATIVE_ROOMS_LIST }
}

export interface EntryInputs {
    /** `window.__splitBootPath`: the location the WebView loaded before the boot script reset it to `/`. */
    bootPath: string | undefined
    /** The URL that launched the app, or null. */
    getLaunchUrl(): Promise<string | null>
    /** The notification tap that launched the app (`slug` null for an unknown room key), or null. */
    awaitColdPushTap(): Promise<{ slug: string | null; sendId: string } | null>
    nav: NativeNav
}

export type EntryDecision =
    | { step: 'boot'; path: string }
    | { step: 'launch'; url: string; result: 'navigated' | 'duplicate' }
    | { step: 'push'; slug: string | null; sendId: string }
    | { step: 'home' }

/**
 * Decides the first screen after a cold start or a hard load (ARCHITECTURE 4.3, PLAN 4.1), and
 * navigates there through `nav`. The order is fixed:
 *
 * 1. A non-root boot path (a reload, Android recreating the WebView) is restored. It comes from the
 *    WebView's own location, never from a tap, so an unmapped or external one goes home silently
 *    and never opens a browser.
 * 2. The launch URL goes through `dispatchNativeLink`, the same function `appUrlOpen` uses. If either
 *    delivery already navigated, stop; a replayed or unmappable launch URL falls through.
 * 3. A notification tap that launched the app opens its room, or the rooms list for an unknown room
 *    key (never the most recent room, which would read as the wrong notification).
 * 4. Otherwise the rooms home.
 *
 * Steps 2 and 3 run before step 4, so a cold start from a link or a notification never shows the
 * most recent room first.
 */
export async function decideEntry(inputs: EntryInputs): Promise<EntryDecision> {
    const { bootPath, nav } = inputs

    if (bootPath && bootPath !== '/') {
        const mapped = nativePathForUrl(bootPath)
        const path = mapped && 'path' in mapped ? mapped.path : NATIVE_HOME
        nav.replace(path)
        return { step: 'boot', path }
    }

    const launchUrl = await inputs.getLaunchUrl()
    if (launchUrl) {
        const result = dispatchNativeLink(launchUrl, 'launch', nav)
        if (result === 'navigated' || result === 'duplicate') return { step: 'launch', url: launchUrl, result }
    }

    const tap = await inputs.awaitColdPushTap()
    if (tap) {
        nav.replace(tap.slug ? roomPath(tap.slug) : NATIVE_ROOMS_LIST)
        return { step: 'push', slug: tap.slug, sendId: tap.sendId }
    }

    nav.replace(NATIVE_HOME)
    return { step: 'home' }
}
