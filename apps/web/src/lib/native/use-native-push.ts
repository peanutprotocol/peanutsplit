'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { roomProps } from '../analytics'
import { api, isApiError } from '../api'
import type { NativePushTransport } from '../api-types'
import { identityGeneration, memberStorageKey, readIdentity } from '../identity'
import { NATIVE_PUSH_ENABLED, nativePlatform } from '../platform'
import { derivePushStatus, type PushControls, type SettledPushStatus, type SubscribeOutcome } from '../push-status'
import { completeRoomUpdates, muteRoomUpdates, roomUpdatesStorageKey } from '../room-updates'
import { loadHost } from './host'
import { hasPushRoom, removePushRoom, writePushRoom } from './push-room'

/**
 * Notification opt-in for one room in the store app (ARCHITECTURE 10.1). Same contract as the web
 * hook in `use-push.ts`; the channel is the device's APNs or FCM token instead of a browser
 * `PushSubscription`, and the server still holds the per-room fact.
 */

/** The longest wait for the device token. A missing token hides the row instead of hanging the UI. */
export const REGISTRATION_TIMEOUT_MS = 10_000

const PUSH_ROOMS_CHANGE_EVENT = 'ps:native-push-change'

// One device token serves every room, so only one control may change subscriptions at a time,
// including while the OS permission dialog is open.
let activeMutation: symbol | null = null

const announceChange = (): void => {
    if (typeof window !== 'undefined') window.dispatchEvent?.(new Event(PUSH_ROOMS_CHANGE_EVENT))
}

/** `fcm` on Android; on iOS the APNs environment the binary was signed for. Null in a plain browser. */
export function nativeTransport(): NativePushTransport | null {
    const platform = nativePlatform()
    if (platform === 'android') return 'fcm'
    // A literal property access, so the build inlines it. The release lane sets `production`;
    // every other build talks to the APNs sandbox.
    if (platform === 'ios') return process.env.NEXT_PUBLIC_SPLIT_APNS_ENV === 'production' ? 'apns' : 'apns-sandbox'
    return null
}

/**
 * Registers with APNs or FCM and resolves the device token: the first of the `registration` event,
 * the `registrationError` event and the timeout. Registration shows no prompt on either platform.
 */
async function registerDevice(): Promise<string | null> {
    const host = loadHost()
    if (!host) return null
    const { push } = await host
    return await new Promise<string | null>((resolve) => {
        let settled = false
        const disposers: Array<Promise<() => void>> = []
        const finish = (token: string | null) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            disposers.forEach((disposer) => void disposer.then((dispose) => dispose()))
            resolve(token)
        }
        const timer = setTimeout(() => finish(null), REGISTRATION_TIMEOUT_MS)
        disposers.push(push.onRegistration((token) => finish(token || null)))
        disposers.push(push.onRegistrationError(() => finish(null)))
        // Both listeners first: the token event can arrive before register() resolves.
        void Promise.all(disposers).then(async () => {
            if (!settled && !(await push.register())) finish(null)
        })
    })
}

let tokenRequest: Promise<string | null> | null = null

/** The device token, registered once per app run. A failed registration is retried on the next call. */
export function deviceToken(): Promise<string | null> {
    if (!NATIVE_PUSH_ENABLED) return Promise.resolve(null)
    tokenRequest ??= registerDevice().then((token) => {
        if (token === null) tokenRequest = null
        return token
    })
    return tokenRequest
}

/** The server answers this when it has no APNs or FCM credentials yet; the row hides. */
const isUnavailable = (error: unknown): boolean => isApiError(error, 'NATIVE_PUSH_UNAVAILABLE')

/** Thrown when the device could not get a token; the row hides. */
export class NativeRegistrationError extends Error {
    constructor() {
        super('the device did not get a push token')
    }
}

/**
 * The row's state for `slug`. `unknown` when the server did not answer, as on the web.
 *
 * The token is fetched even before the person is asked, because only the server's status answer
 * says whether it can deliver at all (503 NATIVE_PUSH_UNAVAILABLE), and a reviewer must never see a
 * switch that fails.
 */
export async function readNativeStatus(slug: string): Promise<SettledPushStatus> {
    const env = { native: true as const, pushEnabled: NATIVE_PUSH_ENABLED }
    if (!NATIVE_PUSH_ENABLED)
        return derivePushStatus({ ...env, available: false, permission: 'prompt', hasRoomSubscription: false })
    const host = loadHost()
    const transport = nativeTransport()
    const permission = host ? await (await host).push.permission() : null
    const token = transport && permission ? await deviceToken() : null
    if (!transport || !permission || !token)
        return derivePushStatus({ ...env, available: false, permission: 'prompt', hasRoomSubscription: false })

    const identity = readIdentity(slug)
    // A tokenless identity cannot prove membership; the row offers to pick a name again.
    if (!identity?.token) return derivePushStatus({ ...env, available: true, permission, hasRoomSubscription: false })
    try {
        const { subscribed } = await api.push.status(slug, {
            transport,
            token,
            memberId: identity.memberId,
            memberToken: identity.token,
        })
        return derivePushStatus({ ...env, available: true, permission, hasRoomSubscription: subscribed })
    } catch (error) {
        if (isUnavailable(error))
            return derivePushStatus({ ...env, available: false, permission, hasRoomSubscription: false })
        return 'unknown'
    }
}

/** As on the web, a refusal is an answer, not a failure. A dismissed dialog leaves `prompt`. */
export type NativeAddOutcome = { status: 'subscribed' } | { status: 'denied'; permission: 'denied' | 'prompt' | null }

/**
 * Turns one room on: ask the OS (THE only requestPermissions() call, reachable only from the
 * per-room tap), get the token, register it for the room, and remember which room the
 * notification key opens.
 */
export async function addNativeRoomSubscription(
    slug: string,
    memberId: string,
    memberToken: string
): Promise<NativeAddOutcome> {
    const generation = identityGeneration(slug)
    const assertCurrentIdentity = () => {
        if (identityGeneration(slug) !== generation) throw new Error('room identity changed during notification setup')
    }
    const host = loadHost()
    const transport = nativeTransport()
    if (!host || !transport) throw new NativeRegistrationError()
    const { push } = await host

    // Granted already: the plugin answers without a dialog, so later rooms take one tap.
    const permission = await push.requestPermission()
    if (permission !== 'granted') return { status: 'denied', permission }
    assertCurrentIdentity()

    const token = await deviceToken()
    if (!token) throw new NativeRegistrationError()
    assertCurrentIdentity()

    await api.push.subscribe(slug, { transport, token, memberId, memberToken })
    try {
        assertCurrentIdentity()
    } catch (error) {
        // Forget may have deleted the row before this POST committed.
        await api.push.unsubscribe(slug, { transport, token, memberId, memberToken }).catch(() => {})
        throw error
    }

    // The payload names the room by its analyticsKey only. The key is known here because the room
    // screen has loaded its state; without it a tap opens the rooms home, never a wrong room.
    const room = (roomProps(slug) as { room?: unknown }).room
    if (typeof room === 'string') writePushRoom(room, slug)
    return { status: 'subscribed' }
}

/** The per-room switch turned off. Throws when the server refuses, so the row only reads off once the row is gone. */
async function deleteNativeRoomSubscription(slug: string, memberId: string, memberToken: string): Promise<void> {
    const transport = nativeTransport()
    const token = await deviceToken()
    if (!transport || !token) throw new NativeRegistrationError()
    await api.push.unsubscribe(slug, { transport, token, memberId, memberToken })
    removePushRoom(slug)
    announceChange()
}

/**
 * Leave or forget a room in the app (`dropRoomSubscription` in `use-push.ts` routes here). The local
 * entry goes first and synchronously: the leave flow hard-reloads right after, and the room is
 * forgotten whether or not the network call finishes. A room this install never subscribed costs
 * no registration and no request.
 */
export async function dropNativeRoomSubscription(slug: string, memberId: string, memberToken: string): Promise<void> {
    if (!hasPushRoom(slug)) return
    removePushRoom(slug)
    const transport = nativeTransport()
    const token = await deviceToken()
    if (transport && token) await api.push.unsubscribe(slug, { transport, token, memberId, memberToken })
    announceChange()
}

export function useNativePush(slug: string): PushControls {
    // With push compiled out the row is hidden from the first render: no loader, no request.
    const [settled, setSettled] = useState<SettledPushStatus | null>(NATIVE_PUSH_ENABLED ? null : 'unsupported')
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
        if (!NATIVE_PUSH_ENABLED) return
        let cancelled = false
        const refresh = async () => {
            setBusy(activeMutation !== null)
            if (activeMutation !== null || busyRef.current) return
            const requestRevision = ++revision.current
            const next = await readNativeStatus(slug)
            if (!cancelled && !busyRef.current && requestRevision === revision.current) setSettled(next)
        }
        const onRefresh = () => void refresh()
        // The person may have changed the permission in the phone's Settings while away.
        const onVisible = () => {
            if (document.visibilityState === 'visible') onRefresh()
        }
        const onStorage = (event: StorageEvent) => {
            if (event.key === null || event.key === memberStorageKey(slug) || event.key === roomUpdatesStorageKey(slug))
                onRefresh()
        }
        setError(null)
        setSettled(null)
        onRefresh()
        window.addEventListener(PUSH_ROOMS_CHANGE_EVENT, onRefresh)
        window.addEventListener('storage', onStorage)
        document.addEventListener('visibilitychange', onVisible)
        return () => {
            cancelled = true
            window.removeEventListener(PUSH_ROOMS_CHANGE_EVENT, onRefresh)
            window.removeEventListener('storage', onStorage)
            document.removeEventListener('visibilitychange', onVisible)
        }
    }, [slug, identity?.memberId, identity?.token])

    /** Runs one change under the module lock; `undefined` means it did not run or went stale. */
    const mutate = useCallback(
        async <T>(change: () => Promise<T>): Promise<T | undefined> => {
            if (busyRef.current || activeMutation !== null) return undefined
            const mutation = Symbol()
            activeMutation = mutation
            busyRef.current = true
            revision.current += 1
            const id = ++operationId.current
            const current = () => mounted.current && scopeRef.current === scope && operationId.current === id
            setBusy(true)
            setError(null)
            try {
                const result = await change()
                return current() ? result : undefined
            } catch (err) {
                if (current()) {
                    setError(err)
                    // No token, or no server credentials: hide the row rather than offer it again.
                    if (err instanceof NativeRegistrationError || isUnavailable(err)) setSettled('unsupported')
                }
                return undefined
            } finally {
                if (activeMutation === mutation) activeMutation = null
                if (current()) {
                    busyRef.current = false
                    setBusy(false)
                }
                announceChange()
            }
        },
        [scope]
    )

    const subscribe = useCallback(
        async (memberId: string, memberToken: string): Promise<SubscribeOutcome> => {
            const outcome = await mutate(() => addNativeRoomSubscription(slug, memberId, memberToken))
            if (!outcome) return 'failed'
            if (outcome.status === 'subscribed') {
                completeRoomUpdates(slug)
                setSettled('subscribed')
            } else setSettled(outcome.permission === 'denied' ? 'denied' : 'default')
            return outcome.status
        },
        [mutate, slug]
    )

    const unsubscribe = useCallback(
        async (memberId: string, memberToken: string): Promise<boolean> => {
            const done = await mutate(async () => {
                await deleteNativeRoomSubscription(slug, memberId, memberToken)
                return true
            })
            if (!done) return false
            muteRoomUpdates(slug)
            setSettled('default')
            return true
        },
        [mutate, slug]
    )

    return { status: busy || settled === null ? 'pending' : settled, error, subscribe, unsubscribe }
}
