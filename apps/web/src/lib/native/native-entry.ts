import { roomPath } from '../platform'
import { dispatchNativeLink, nativePathForUrl, type NativeNav } from './links'

/** The app's rooms home; RecentRoomAppEntry there moves a returning person to their latest room. */
export const NATIVE_HOME = '/app/'

export interface EntryInputs {
    /** `window.__splitBootPath`: the location the WebView loaded before the boot script reset it to `/`. */
    bootPath: string | undefined
    /** The URL that launched the app, or null. */
    getLaunchUrl(): Promise<string | null>
    /** The room of a notification tap that launched the app, or null. */
    awaitColdPushTap(): Promise<{ slug: string; sendId: string } | null>
    nav: NativeNav
}

export type EntryDecision =
    | { step: 'boot'; path: string }
    | { step: 'launch'; url: string; result: 'navigated' | 'duplicate' }
    | { step: 'push'; slug: string; sendId: string }
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
 * 3. A notification tap that launched the app opens its room.
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
        nav.replace(roomPath(tap.slug))
        return { step: 'push', slug: tap.slug, sendId: tap.sendId }
    }

    nav.replace(NATIVE_HOME)
    return { step: 'home' }
}
