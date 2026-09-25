'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import { vapidPublicKey } from './flags'
import { identityGeneration, memberStorageKey, readIdentity } from './identity'
import { completeRoomUpdates, muteRoomUpdates, roomUpdatesStorageKey } from './room-updates'
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

const PUSH_SUBSCRIPTION_CHANGE_EVENT = 'ps:push-subscription-change'
// Every room and surface shares one browser endpoint. Only one control may
// change it at a time, including while a permission dialog is open.
let activeMutation: symbol | null = null

const announceSubscriptionChange = (): void => {
    if (typeof window !== 'undefined') window.dispatchEvent?.(new Event(PUSH_SUBSCRIPTION_CHANGE_EVENT))
}

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
    const generation = identityGeneration(slug)
    const originalIdentity = readIdentity(slug)
    const assertCurrentIdentity = () => {
        const current = readIdentity(slug)
        if (
            identityGeneration(slug) !== generation ||
            (originalIdentity !== null &&
                (current?.memberId !== originalIdentity.memberId || current?.token !== originalIdentity.token))
        )
            throw new Error('room identity changed during notification setup')
    }

    // THE only requestPermission() call site in the app. It is reachable only
    // from a tap, and only in a state where derivePushStatus said 'default' — on
    // iOS outside standalone this resolves 'denied' with no prompt shown and
    // burns the origin's one ask forever, with no way back but a reinstall.
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    if (permission !== 'granted') return { status: 'denied', permission }
    assertCurrentIdentity()

    const registration = await activeRegistration()
    const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
    })

    const keys = readKeys(subscription)
    if (!keys) throw new Error('push subscription came back without keys')

    assertCurrentIdentity()
    // A failed room save must not revoke the origin's channel: another tab may
    // have registered it for a different room while this request was pending.
    await api.push.subscribe(slug, {
        endpoint: keys.endpoint,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
        memberId,
        memberToken,
        userAgent: navigator.userAgent.slice(0, 512),
    })
    try {
        assertCurrentIdentity()
    } catch (error) {
        // Forget may have deleted the row before this POST committed. Cleanup
        // is conditional on the old member, so a newly rebound row survives.
        await api.push.unsubscribe(slug, { endpoint: keys.endpoint, memberId, memberToken }).catch(() => {})
        throw error
    }

    return { status: 'subscribed' }
}

/**
 * Remove this device's subscription for one room.
 *
 * Exported for `forget()` in `use-identity.ts`, which has to do this before it
 * deletes the token that authorises it. Throws when the server refuses, so the
 * UI only reports the room as off after its row is gone.
 */
export async function dropRoomSubscription(slug: string, memberId: string, memberToken: string): Promise<void> {
    const subscription = await currentSubscription()
    if (!subscription) return

    const keys = readKeys(subscription)
    if (!keys) return

    await api.push.unsubscribe(slug, { endpoint: keys.endpoint, memberId, memberToken })
    // Keep the origin-wide channel. Another tab can register a room after the
    // server counted its users but before this response arrives. Revoking the
    // channel here would silently disable that room too; deleting this room's
    // row already stops its notifications.
    announceSubscriptionChange()
}

export function usePush(slug: string): PushControls {
    const [settled, setSettled] = useState<SettledPushStatus | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<unknown>(null)
    const mounted = useRef(true)
    const busyRef = useRef(false)
    const revision = useRef(0)
    const identity = readIdentity(slug)
    const scope = `${slug}\0${identity?.memberId ?? ''}\0${identity?.token ?? ''}`
    const scopeRef = useRef(scope)
    const operationId = useRef(0)
    if (scopeRef.current !== scope) {
        scopeRef.current = scope
        busyRef.current = false
        revision.current += 1
        operationId.current += 1
    }

    useEffect(() => {
        mounted.current = true
        return () => {
            mounted.current = false
        }
    }, [])

    useEffect(() => {
        let cancelled = false
        const refresh = async () => {
            setBusy(activeMutation !== null)
            if (activeMutation !== null) return
            if (busyRef.current) return
            const requestRevision = ++revision.current
            const current = () => !cancelled && !busyRef.current && requestRevision === revision.current
            const preliminary = derivePushStatus(deviceEnvironment(false))
            // Anything but 'default' is already final — an unsupported browser,
            // an iOS tab or a blocked origin has no subscription to look up, and
            // touching navigator.serviceWorker on the first of those throws.
            // These are also the states that must cost no request: they are
            // decided entirely by this device, and every room open would pay.
            if (preliminary !== 'default') {
                if (current()) setSettled(preliminary)
                return
            }
            const subscription = await currentSubscription().catch(() => null)
            if (!current()) return
            // No browser subscription means no row can name it. Still local.
            if (!subscription) {
                setSettled('default')
                return
            }
            // Only here — permission granted and a live endpoint — is the
            // per-room answer something only the server can give.
            const answer = await roomSubscribed(slug, subscription)
            if (!current()) return
            // A failed check is its own state, and deliberately not routed
            // through `derivePushStatus`: that function decides from facts about
            // the device, and "the server did not answer" is not one of them.
            setSettled(answer === 'unknown' ? 'unknown' : derivePushStatus(deviceEnvironment(answer)))
        }
        const onRefresh = () => void refresh()
        const onVisible = () => {
            if (document.visibilityState === 'visible') onRefresh()
        }
        const onStorage = (event: StorageEvent) => {
            if (event.key === null || event.key === memberStorageKey(slug)) {
                operationId.current += 1
                busyRef.current = false
                setBusy(false)
                setError(null)
            }
            if (event.key === null || event.key === memberStorageKey(slug) || event.key === roomUpdatesStorageKey(slug))
                onRefresh()
        }
        setBusy(activeMutation !== null)
        setError(null)
        setSettled(null)
        onRefresh()
        window.addEventListener(PUSH_SUBSCRIPTION_CHANGE_EVENT, onRefresh)
        window.addEventListener('focus', onRefresh)
        window.addEventListener('storage', onStorage)
        document.addEventListener('visibilitychange', onVisible)
        return () => {
            cancelled = true
            window.removeEventListener(PUSH_SUBSCRIPTION_CHANGE_EVENT, onRefresh)
            window.removeEventListener('focus', onRefresh)
            window.removeEventListener('storage', onStorage)
            document.removeEventListener('visibilitychange', onVisible)
        }
    }, [slug, identity?.memberId, identity?.token])

    const subscribe = useCallback(
        async (memberId: string, memberToken: string): Promise<SubscribeOutcome> => {
            if (busyRef.current || activeMutation !== null) return 'failed'
            const mutation = Symbol()
            activeMutation = mutation
            busyRef.current = true
            revision.current += 1
            const id = ++operationId.current
            const current = () => mounted.current && scopeRef.current === scope && operationId.current === id
            const generation = identityGeneration(slug)
            setBusy(true)
            setError(null)
            announceSubscriptionChange()
            try {
                const outcome = await addRoomSubscription(slug, memberId, memberToken)
                if (identityGeneration(slug) !== generation || !current()) return 'failed'
                if (outcome.status === 'subscribed') completeRoomUpdates(slug)
                if (current()) {
                    if (outcome.status === 'subscribed') setSettled('subscribed')
                    else setSettled(outcome.permission === 'denied' ? 'denied' : 'default')
                }
                return current() ? outcome.status : 'failed'
            } catch (err) {
                if (current()) setError(err)
                return 'failed'
            } finally {
                if (activeMutation === mutation) activeMutation = null
                if (current()) {
                    busyRef.current = false
                    setBusy(false)
                }
                announceSubscriptionChange()
            }
        },
        [slug, scope]
    )

    const unsubscribe = useCallback(
        async (memberId: string, memberToken: string): Promise<boolean> => {
            if (busyRef.current || activeMutation !== null) return false
            const mutation = Symbol()
            activeMutation = mutation
            busyRef.current = true
            revision.current += 1
            const id = ++operationId.current
            const current = () => mounted.current && scopeRef.current === scope && operationId.current === id
            const generation = identityGeneration(slug)
            setBusy(true)
            setError(null)
            announceSubscriptionChange()
            try {
                await dropRoomSubscription(slug, memberId, memberToken)
                if (identityGeneration(slug) !== generation || !current()) return false
                muteRoomUpdates(slug)
                if (current()) setSettled('default')
                return current()
            } catch (err) {
                // The row may still be there, so the browser subscription stays
                // exactly as it was — reported off is worse than a retry.
                if (current()) setError(err)
                return false
            } finally {
                if (activeMutation === mutation) activeMutation = null
                if (current()) {
                    busyRef.current = false
                    setBusy(false)
                }
                announceSubscriptionChange()
            }
        },
        [slug, scope]
    )

    return { status: busy || settled === null ? 'pending' : settled, error, subscribe, unsubscribe }
}
