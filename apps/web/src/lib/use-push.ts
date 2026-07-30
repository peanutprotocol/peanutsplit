'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import { vapidPublicKey } from './flags'
import { readIdentity } from './identity'
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
 * Notification opt-in for one device in ONE room.
 *
 * The browser gives this device a single `PushSubscription` per origin, which
 * every room shares. The per-room fact — is this room registered against that
 * endpoint — only exists on the server, so both the read and the off path have
 * to ask it. Trusting the browser's subscription instead is what made a second
 * room render "on", and turning it off in one room silence all the others.
 *
 * The decision logic lives in `push-status.ts`; everything here is the part that
 * has to touch the browser — reading the permission, finding the service worker,
 * and the calls that must stay in lock-step with the server.
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
    subscribe: (memberId: string, memberToken: string) => Promise<SubscribeOutcome>
    unsubscribe: (memberId: string, memberToken: string) => Promise<boolean>
}

/** The synchronous half of the environment. `hasRoomSubscription` is the
 *  server's answer, so it is passed in by whoever already asked. */
function deviceEnvironment(hasRoomSubscription: boolean): PushEnvironment {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
        return {
            hasNotification: false,
            hasServiceWorker: false,
            hasPushManager: false,
            hasVapidKey: false,
            isIOS: false,
            isStandalone: false,
            permission: 'default',
            hasRoomSubscription: false,
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
        hasRoomSubscription,
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

/** The server's answer, or the absence of one. */
export type RoomAnswer = boolean | 'unknown'

/**
 * Ask the server whether this endpoint is registered for `slug`.
 *
 * The credentials come from localStorage rather than from the caller because
 * this runs on mount, with no tap behind it — the same record the room's join
 * gate wrote, and the same one the surface passes back into `subscribe`. A
 * legacy tokenless identity cannot prove membership, so it answers "off"; that
 * device has to pick its name again before it can turn anything on anyway.
 *
 * Exported for the test: this is the one place the honesty of the row is decided.
 */
export async function roomSubscribed(slug: string, subscription: PushSubscription): Promise<RoomAnswer> {
    const keys = readKeys(subscription)
    const identity = readIdentity(slug)
    if (!keys || !identity?.token) return false
    try {
        const { subscribed } = await api.push.status(slug, {
            endpoint: keys.endpoint,
            memberId: identity.memberId,
            memberToken: identity.token,
        })
        return subscribed
    } catch {
        // Offline, or a token this room no longer honours. "Off" would be the
        // convenient answer and it is not a true one: the row is on the server
        // and the phone is still receiving on it, so a switch reading "off"
        // contradicts the notification the person is looking at. Say we could
        // not check and let the surface say so too.
        return 'unknown'
    }
}

/** What asking for permission settled on. A refusal is an answer, not a
 *  failure, so it comes back as a value; everything that actually broke throws. */
export type AddOutcome = { status: 'subscribed' } | { status: 'denied'; permission: NotificationPermission }

/**
 * Turn one room on: ask permission, get the device's channel, register it.
 *
 * Everything the browser has to be told is here rather than in the hook, so the
 * rollback rule below can be tested without rendering anything.
 */
export async function addRoomSubscription(slug: string, memberId: string, memberToken: string): Promise<AddOutcome> {
    const key = vapidPublicKey()
    if (!key) throw new Error('this build has no VAPID key')

    // THE only requestPermission() call site in the app. It is reachable only
    // from a tap, and only in a state where derivePushStatus said 'default' — on
    // iOS outside standalone this resolves 'denied' with no prompt shown and
    // burns the origin's one ask forever, with no way back but a reinstall.
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return { status: 'denied', permission }

    const registration = await activeRegistration()
    // Did THIS call create the channel? `pushManager.subscribe()` hands back the
    // subscription the origin already has rather than minting a second one, so
    // without asking first there is no way to tell a channel we just made from
    // one another room has been delivering on for a week.
    const created = (await registration.pushManager.getSubscription()) === null
    const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
    })

    const keys = readKeys(subscription)
    if (!keys) {
        if (created) await subscription.unsubscribe().catch(() => {})
        throw new Error('push subscription came back without keys')
    }

    try {
        await api.push.subscribe(slug, {
            endpoint: keys.endpoint,
            keys: { p256dh: keys.p256dh, auth: keys.auth },
            memberId,
            memberToken,
            // The server bounds this at 512; sending more is a 400 for a field
            // that is only ever read by a human.
            userAgent: navigator.userAgent.slice(0, 512),
        })
    } catch (err) {
        // The browser is now subscribed to a channel the server does not know
        // about — a rejected member token, an endpoint host we refuse, a room at
        // its device cap. Left in place it is a permanently silent "on" that
        // nothing can clear, so we take back what we made.
        //
        // Only what we made. If the channel was already there, another room is
        // delivering on it, and revoking it to tidy up a failure in this room
        // would take that one dark. Nothing is left behind on the server either:
        // the route writes the row in one transaction, so a call that came back
        // an error wrote nothing to undo.
        if (created) await subscription.unsubscribe().catch(() => {})
        throw err
    }

    return { status: 'subscribed' }
}

/**
 * Drop this device's channel for one room.
 *
 * Exported for `forget()` in `use-identity.ts`, which has to do this before it
 * deletes the token that authorises it. Throws when the server refuses, so the
 * browser subscription is only ever touched after the row is really gone.
 */
export async function dropRoomSubscription(slug: string, memberId: string, memberToken: string): Promise<void> {
    const subscription = await currentSubscription()
    if (!subscription) return

    const keys = readKeys(subscription)
    if (!keys) {
        // A keyless subscription can never have reached the server (subscribe
        // rolls it back), and there is no endpoint to name in a delete. Only the
        // local half exists, so only the local half goes.
        await subscription.unsubscribe().catch(() => {})
        return
    }

    // Server first, then the browser: the reverse order can drop the endpoint we
    // would have needed to name in the delete, leaving a row that keeps being
    // sent to until the push service 410s it.
    const { endpointStillUsed } = await api.push.unsubscribe(slug, { endpoint: keys.endpoint, memberId, memberToken })
    // The endpoint is the device's, not the room's. Revoking it while another
    // room's row still points at it takes that room dark with nothing to show
    // for it — its toggle would keep reading "on" and never deliver again.
    if (!endpointStillUsed) await subscription.unsubscribe()
}

export function usePush(slug: string): PushControls {
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
            // These are also the states that must cost no request: they are
            // decided entirely by this device, and every room open would pay.
            if (preliminary !== 'default') {
                if (!cancelled) setSettled(preliminary)
                return
            }
            const subscription = await currentSubscription().catch(() => null)
            if (cancelled) return
            // No browser subscription means no row can name it. Still local.
            if (!subscription) {
                setSettled('default')
                return
            }
            // Only here — permission granted and a live endpoint — is the
            // per-room answer something only the server can give.
            const answer = await roomSubscribed(slug, subscription)
            if (cancelled) return
            // A failed check is its own state, and deliberately not routed
            // through `derivePushStatus`: that function decides from facts about
            // the device, and "the server did not answer" is not one of them.
            setSettled(answer === 'unknown' ? 'unknown' : derivePushStatus(deviceEnvironment(answer)))
        })()
        return () => {
            cancelled = true
        }
    }, [slug])

    const subscribe = useCallback(
        async (memberId: string, memberToken: string): Promise<SubscribeOutcome> => {
            setBusy(true)
            setError(null)
            try {
                const outcome = await addRoomSubscription(slug, memberId, memberToken)
                if (mounted.current) {
                    if (outcome.status === 'subscribed') setSettled('subscribed')
                    else setSettled(outcome.permission === 'denied' ? 'denied' : 'default')
                }
                return outcome.status
            } catch (err) {
                if (mounted.current) setError(err)
                return 'failed'
            } finally {
                if (mounted.current) setBusy(false)
            }
        },
        [slug]
    )

    const unsubscribe = useCallback(
        async (memberId: string, memberToken: string): Promise<boolean> => {
            setBusy(true)
            setError(null)
            try {
                await dropRoomSubscription(slug, memberId, memberToken)
                if (mounted.current) setSettled('default')
                return true
            } catch (err) {
                // The row may still be there, so the browser subscription stays
                // exactly as it was — reported off is worse than a retry.
                if (mounted.current) setError(err)
                return false
            } finally {
                if (mounted.current) setBusy(false)
            }
        },
        [slug]
    )

    return { status: busy || settled === null ? 'pending' : settled, error, subscribe, unsubscribe }
}
