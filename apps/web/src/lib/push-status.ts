/**
 * What state this device is in with respect to notifications, decided as a pure
 * function of six booleans and a permission string.
 *
 * It is pure because the order of the checks is the whole feature. Ask the
 * questions in the wrong sequence and you either show a "turn on notifications"
 * button that cannot work, or — the expensive one — you reach
 * `Notification.requestPermission()` on iOS Safari outside a home-screen app,
 * where it resolves 'denied' without ever showing a prompt and permanently
 * spends the origin's single ask. See `use-push.ts` for the enforcement side.
 */

export type PushStatus = 'unsupported' | 'ios-needs-pwa' | 'denied' | 'default' | 'subscribed' | 'pending'

/** Everything except `pending`, which is a fact about our own in-flight work
 *  rather than about the device, and so is never derived here. */
export type SettledPushStatus = Exclude<PushStatus, 'pending'>

export interface PushEnvironment {
    hasNotification: boolean
    hasServiceWorker: boolean
    hasPushManager: boolean
    /** `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. A build without it cannot produce a
     *  subscription the server could ever deliver to, so the honest answer is
     *  "this browser does not do push here" rather than a button that 500s. */
    hasVapidKey: boolean
    isIOS: boolean
    /** Running as an installed app (any platform). */
    isStandalone: boolean
    permission: NotificationPermission
    /**
     * The SERVER's answer for THIS room: a subscription row exists for
     * (this device's endpoint, this room).
     *
     * Deliberately not the browser's `PushSubscription`, which belongs to the
     * origin and is shared by every room this device has ever turned on. Reading
     * that instead made room B render "on" because room A had been turned on.
     */
    hasRoomSubscription: boolean
}

export function derivePushStatus(env: PushEnvironment): SettledPushStatus {
    if (!env.hasNotification || !env.hasServiceWorker || !env.hasPushManager || !env.hasVapidKey) return 'unsupported'
    // Before the permission check, deliberately: iOS in a browser tab reports
    // permission 'default', which reads as "just ask" and is a trap.
    if (env.isIOS && !env.isStandalone) return 'ios-needs-pwa'
    if (env.permission === 'denied') return 'denied'
    // 'granted' without a row is normal — the browser drops subscriptions on
    // storage pressure, and this room may simply never have been turned on.
    // Re-subscribing needs no prompt either way.
    if (env.hasRoomSubscription) return 'subscribed'
    return 'default'
}

export interface DeviceHints {
    userAgent: string
    /** `navigator.platform`. Deprecated, and still the only way to tell an iPad
     *  from a Mac: iPadOS 13+ reports the desktop UA. */
    platform: string
    maxTouchPoints: number
}

export const isIOSDevice = ({ userAgent, platform, maxTouchPoints }: DeviceHints): boolean =>
    /iPad|iPhone|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1)

/** The two signals a PWA can be launched from: the standard display-mode media
 *  query, and Safari's pre-standard `navigator.standalone`. */
export const isStandaloneDisplay = (
    displayModeStandalone: boolean,
    navigatorStandalone: boolean | undefined
): boolean => displayModeStandalone || navigatorStandalone === true

/**
 * VAPID keys are published base64url; `PushManager.subscribe` wants raw bytes.
 * `atob` only speaks standard base64, hence the padding and the two character
 * swaps.
 *
 * The explicit `Uint8Array<ArrayBuffer>` is load-bearing: bare `Uint8Array` now
 * means `Uint8Array<ArrayBufferLike>`, which `applicationServerKey` rejects
 * because a SharedArrayBuffer view is not a `BufferSource`.
 */
export function urlBase64ToUint8Array(base64UrlKey: string): Uint8Array<ArrayBuffer> {
    const padding = '='.repeat((4 - (base64UrlKey.length % 4)) % 4)
    const base64 = (base64UrlKey + padding).replace(/-/g, '+').replace(/_/g, '/')
    const raw = atob(base64)
    const bytes = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
    return bytes
}
