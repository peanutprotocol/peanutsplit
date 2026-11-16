import { CANONICAL_ORIGIN } from './domains'
import { isIOSDevice } from './push-status'

/**
 * Where the web offers the store app, and where it does not.
 *
 * Only iPhone and iPad browsers get the App Store. An installed Android PWA shares Chrome's storage
 * for this origin, so every room and member token is already there on first launch, while the Play
 * app starts empty: pointing Android at the store would cost people their rooms. Desktop has no
 * store app. Everything here is off until Hugo sets `NEXT_PUBLIC_IOS_APP_STORE_ID` as a build arg.
 */

/**
 * Read as a literal property access so Next inlines it into the client bundle. An App Store ID is
 * digits only; anything else is treated as unset, which also keeps the banner `<meta>` content
 * free of separators a typo could inject.
 */
const configuredStoreId = (): string | null => {
    const id = process.env.NEXT_PUBLIC_IOS_APP_STORE_ID
    return id && /^\d+$/.test(id) ? id : null
}

/** Pure: the App Store listing for an Apple touch device, `null` everywhere else. */
export function appStoreUrlFor(isIOS: boolean, storeId: string | null = configuredStoreId()): string | null {
    return isIOS && storeId ? `https://apps.apple.com/app/id${storeId}` : null
}

/**
 * The store link for this browser. Asks the same device question as `isIOSHere()` in
 * `install.ts`; it reads the navigator itself because `install.ts` imports this file.
 */
export function storeAppUrl(): string | null {
    if (typeof window === 'undefined') return null
    const { userAgent, platform, maxTouchPoints } = window.navigator
    return appStoreUrlFor(isIOSDevice({ userAgent, platform, maxTouchPoints }))
}

/**
 * Content of Apple's Smart App Banner tag for a room page. The `app-argument` is the canonical room
 * link, because the app's link mapper accepts only that host. `null` when the store ID is unset.
 */
export function smartAppBannerContent(slug: string, storeId: string | null = configuredStoreId()): string | null {
    if (!storeId) return null
    return `app-id=${storeId}, app-argument=${CANONICAL_ORIGIN}/r/${encodeURIComponent(slug)}`
}
