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

export type PushStatus = 'unsupported' | 'ios-needs-pwa' | 'denied' | 'default' | 'subscribed' | 'unknown' | 'pending'

/** Everything the row can show once it has stopped waiting on us. */
export type SettledPushStatus = Exclude<PushStatus, 'pending'>

/**
 * What this device can be asked about itself.
 *
 * `pending` is a fact about our own in-flight work, and `unknown` is the
 * server's silence — neither is a property of the device, so neither is derived
 * here. `unknown` exists because the alternative was worse: answering "off" when
 * the status request failed told the person their notifications were off while
 * their phone kept buzzing.
 */
export type DerivedPushStatus = Exclude<PushStatus, 'pending' | 'unknown'>

/** What a subscribe attempt produced. Mapped straight onto analytics by the
 *  caller, which is why "the user said no" is a return value and not an error:
 *  it is an answer, and nothing went wrong. */
export type SubscribeOutcome = 'subscribed' | 'denied' | 'failed'

/** The per-room push hook's contract, shared by the web and the app implementations. */
export interface PushControls {
    status: PushStatus
    /** Last failure, untranslated. The surface turns it into a sentence with
     *  `useErrorMessage`; a lib module has no business holding UI copy. */
    error: unknown
    subscribe: (memberId: string, memberToken: string) => Promise<SubscribeOutcome>
    unsubscribe: (memberId: string, memberToken: string) => Promise<boolean>
}

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

/**
 * The store app's inputs. The app has no service worker or VAPID key: it asks the push plugin for
 * the permission and the server for this room's row (ARCHITECTURE 10.1).
 */
export interface NativePushEnvironment {
    native: true
    /** `NATIVE_PUSH_ENABLED`: the build compiled the push client in. CI debug builds do not. */
    pushEnabled: boolean
    /**
     * The device has a token and the server can deliver to it. False after a registration error,
     * the registration timeout, or `503 NATIVE_PUSH_UNAVAILABLE` (no APNs or FCM credentials yet).
     */
    available: boolean
    /** The plugin's permission state; `prompt` means the person has not been asked. */
    permission: 'granted' | 'denied' | 'prompt'
    /** The server has a row for (this device's token, this room). */
    hasRoomSubscription: boolean
}

/**
 * Decides the row's state. In the app it is only ever `unsupported` (no row), `denied`, `default`
 * or `subscribed`: the app is installed by definition, so `ios-needs-pwa` cannot apply.
 */
export function derivePushStatus(env: PushEnvironment | NativePushEnvironment): DerivedPushStatus {
    if ('native' in env) {
        if (!env.pushEnabled || !env.available) return 'unsupported'
        if (env.permission === 'denied') return 'denied'
        // As on the web, a granted permission without this room's row is an ordinary 'default'.
        if (env.permission === 'granted' && env.hasRoomSubscription) return 'subscribed'
        return 'default'
    }
    if (!env.hasServiceWorker || !env.hasVapidKey) return 'unsupported'
    // iOS exposes the push APIs in the installed app, not necessarily in the
    // browser that must explain how to install it.
    if (env.isIOS && !env.isStandalone) return 'ios-needs-pwa'
    if (!env.hasNotification || !env.hasPushManager) return 'unsupported'
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
