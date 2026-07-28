'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import { vapidPublicKey } from './flags'
import {
    derivePushStatus,
    isIOSDevice,
    isStandaloneDisplay,
    urlBase64ToUint8Array,
    type PushEnvironment,
    type PushStatus,
    type SettledPushStatus,
} from './push-status'

/**
 * Notification opt-in for one device, across every room it is in.
 *
 * The decision logic lives in `push-status.ts`; everything here is the part that
 * has to touch the browser — reading the permission, finding the service worker,
 * and the two calls that must stay in lock-step with the server.
 */

/** What a subscribe attempt produced. Mapped straight onto analytics by the
 *  caller, which is why "the user said no" is a return value and not an error:
 *  it is an answer, and nothing went wrong. */
export type SubscribeOutcome = 'subscribed' | 'denied' | 'failed'

export interface PushControls {
    status: PushStatus
    /** Last failure, untranslated. The surface turns it into a sentence with
     *  `useErrorMessage`; a lib module has no business holding UI copy. */
    error: unknown
    subscribe: (slug: string, memberId: string, memberToken: string) => Promise<SubscribeOutcome>
    unsubscribe: (slug: string, memberId: string, memberToken: string) => Promise<boolean>
}

/** The synchronous half of the environment. `hasSubscription` needs the service
 *  worker, so it is passed in by whoever already asked. */
function deviceEnvironment(hasSubscription: boolean): PushEnvironment {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
        return {
            hasNotification: false,
            hasServiceWorker: false,
            hasPushManager: false,
            hasVapidKey: false,
            isIOS: false,
            isStandalone: false,
            permission: 'default',
            hasSubscription: false,
        }
    }

    const hasNotification = 'Notification' in window
    return {
        hasNotification,
        hasServiceWorker: 'serviceWorker' in navigator,
        hasPushManager: 'PushManager' in window,
        hasVapidKey: vapidPublicKey() !== undefined,
        isIOS: isIOSDevice({
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            maxTouchPoints: navigator.maxTouchPoints,
        }),
        isStandalone: isStandaloneDisplay(
            window.matchMedia?.('(display-mode: standalone)').matches === true,
            (window.navigator as Navigator & { standalone?: boolean }).standalone
        ),
        // Reading it is free and prompts nothing; only requestPermission() asks.
        permission: hasNotification ? Notification.permission : 'default',
        hasSubscription,
    }
}

/**
 * The registration to subscribe against. `next dev` does not build the service
 * worker (see next.config.js), so `register()` 404s locally and the failure
 * surfaces as a plain error — which is the honest answer: there is no worker to
 * deliver to.
 */
async function activeRegistration(): Promise<ServiceWorkerRegistration> {
    if (!(await navigator.serviceWorker.getRegistration())) await navigator.serviceWorker.register('/sw.js')
    return await navigator.serviceWorker.ready
}

async function currentSubscription(): Promise<PushSubscription | null> {
    const registration = await navigator.serviceWorker.getRegistration()
    return registration ? await registration.pushManager.getSubscription() : null
}

interface SubscriptionKeys {
    endpoint: string
    p256dh: string
    auth: string
}

/** `toJSON()` is typed as everything-optional because the spec allows a
 *  keyless subscription; ours never is, and a half-filled body would only fail
 *  validation server-side. */
function readKeys(subscription: PushSubscription): SubscriptionKeys | null {
    const json = subscription.toJSON()
    const { p256dh, auth } = json.keys ?? {}
    if (!json.endpoint || !p256dh || !auth) return null
    return { endpoint: json.endpoint, p256dh, auth }
}

export function usePush(): PushControls {
    const [settled, setSettled] = useState<SettledPushStatus | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<unknown>(null)
    const mounted = useRef(true)

    useEffect(() => {
        mounted.current = true
        return () => {
            mounted.current = false
        }
    }, [])

    useEffect(() => {
        let cancelled = false
        void (async () => {
            const preliminary = derivePushStatus(deviceEnvironment(false))
            // Anything but 'default' is already final — an unsupported browser,
            // an iOS tab or a blocked origin has no subscription to look up, and
            // touching navigator.serviceWorker on the first of those throws.
            if (preliminary !== 'default') {
                if (!cancelled) setSettled(preliminary)
                return
            }
            const subscription = await currentSubscription().catch(() => null)
            if (cancelled) return
            setSettled(derivePushStatus(deviceEnvironment(subscription !== null)))
        })()
        return () => {
            cancelled = true
        }
    }, [])

    const subscribe = useCallback(
        async (slug: string, memberId: string, memberToken: string): Promise<SubscribeOutcome> => {
            const key = vapidPublicKey()
            if (!key) return 'failed'

            setBusy(true)
            setError(null)
            try {
                // THE only requestPermission() call site in the app. It is
                // reachable only from a tap, and only in a state where
                // derivePushStatus said 'default' — on iOS outside standalone
                // this resolves 'denied' with no prompt shown and burns the
                // origin's one ask forever, with no way back but a reinstall.
                const permission = await Notification.requestPermission()
                if (permission !== 'granted') {
                    if (mounted.current) setSettled(permission === 'denied' ? 'denied' : 'default')
                    return 'denied'
                }

                const registration = await activeRegistration()
                const subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(key),
                })

                const keys = readKeys(subscription)
                if (!keys) {
                    await subscription.unsubscribe().catch(() => {})
                    throw new Error('push subscription came back without keys')
                }

                try {
                    await api.push.subscribe(slug, {
                        endpoint: keys.endpoint,
                        keys: { p256dh: keys.p256dh, auth: keys.auth },
                        memberId,
                        memberToken,
                        // The server bounds this at 512; sending more is a 400
                        // for a field that is only ever read by a human.
                        userAgent: navigator.userAgent.slice(0, 512),
                    })
                } catch (err) {
                    // The browser is now subscribed to a channel the server does
                    // not know about — a rejected member token, an endpoint host
                    // we refuse, a room at its device cap. Leaving it in place
                    // means a permanently silent "on" state that nothing can
                    // ever clear, so the local half is rolled back before the
                    // error is shown.
                    await subscription.unsubscribe().catch(() => {})
                    throw err
                }

                if (mounted.current) setSettled('subscribed')
                return 'subscribed'
            } catch (err) {
                if (mounted.current) setError(err)
                return 'failed'
            } finally {
                if (mounted.current) setBusy(false)
            }
        },
        []
    )

    const unsubscribe = useCallback(async (slug: string, memberId: string, memberToken: string): Promise<boolean> => {
        setBusy(true)
        setError(null)
        try {
            const subscription = await currentSubscription()
            if (!subscription) {
                if (mounted.current) setSettled('default')
                return true
            }
            const keys = readKeys(subscription)
            // Server first, then the browser: the reverse order can drop the
            // endpoint we would have needed to name in the delete, leaving a row
            // that keeps being sent to until the push service 410s it.
            if (keys) await api.push.unsubscribe(slug, { endpoint: keys.endpoint, memberId, memberToken })
            await subscription.unsubscribe()
            if (mounted.current) setSettled('default')
            return true
        } catch (err) {
            if (mounted.current) setError(err)
            return false
        } finally {
            if (mounted.current) setBusy(false)
        }
    }, [])

    return { status: busy || settled === null ? 'pending' : settled, error, subscribe, unsubscribe }
}
