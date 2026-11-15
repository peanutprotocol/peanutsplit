import { rememberRoomKey, roomProps, track } from '../analytics'
import { apiUrl, NATIVE_PUSH_ENABLED, roomPath } from '../platform'
import { loadHost } from './host'
import { NATIVE_ROOMS_LIST } from './native-entry'
import { readPushRoom } from './push-room'

/**
 * Notification taps in the app (ARCHITECTURE 10.1).
 *
 * The push plugin keeps a tap that launched the app as a retained `pushNotificationActionPerformed`
 * event until a listener takes it (iOS PushNotificationsHandler.swift:79, Android
 * PushNotificationsPlugin.java:86). It is not a launch URL. So `NativeEntry` awaits
 * `awaitColdPushTap()` before it routes to the rooms home, and the warm listener in `NativeLinks`
 * handles only taps while the app runs. Both listeners pass every tap through `claimTap`, so one tap
 * is handled once, whichever listener the plugin hands it to.
 */

/** How long the splash may wait for a retained tap. */
export const COLD_TAP_BARRIER_MS = 500

/** sendIds this tab has already handled. A WebView reload must not open the room again. */
export const PUSH_HANDLED_KEY = 'ps:native:push-handled'
const HANDLED_LIMIT = 20

interface PushTap {
    /** The room's analyticsKey; payloads never carry the slug. */
    room: string
    sendId: string
}

const readTap = (data: Record<string, unknown>): PushTap => ({
    room: typeof data.room === 'string' ? data.room : '',
    sendId: typeof data.sendId === 'string' ? data.sendId : '',
})

/** The cold window is open until awaitColdPushTap() has settled once. */
let coldSettled = false
let coldTap: PushTap | null = null
const handledHere = new Set<string>()

function readHandled(): string[] {
    try {
        const parsed: unknown = JSON.parse(window.sessionStorage.getItem(PUSH_HANDLED_KEY) ?? '[]')
        return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
    } catch {
        return []
    }
}

function rememberHandled(sendId: string): void {
    handledHere.add(sendId)
    try {
        const ids = [...readHandled().filter((id) => id !== sendId), sendId].slice(-HANDLED_LIMIT)
        window.sessionStorage.setItem(PUSH_HANDLED_KEY, JSON.stringify(ids))
    } catch {
        // Without sessionStorage a reload may replay the tap once; the in-memory set still dedupes.
    }
}

/**
 * Claims a tap for exactly one handler. `skip`: already handled (the other listener got it, or a
 * reload replayed it). `cold`: it arrived while the app still shows its root, so `NativeEntry` routes
 * it. `warm`: the caller routes it.
 */
export function claimTap(data: Record<string, unknown>): 'skip' | 'cold' | 'warm' {
    const tap = readTap(data)
    if (tap.sendId) {
        if (handledHere.has(tap.sendId) || readHandled().includes(tap.sendId)) return 'skip'
        rememberHandled(tap.sendId)
    }
    // `/` is NativeEntry, which renders nothing and leaves as soon as it decides. A tap that arrives
    // there, before the cold check has settled, is the one that launched the app.
    if (!coldSettled && window.location.pathname === '/') {
        coldTap ??= tap
        return 'cold'
    }
    return 'warm'
}

/** The opened beacon, as the service worker sends it on the web. Never blocks or fails the tap. */
function sendOpened(sendId: string): void {
    if (!sendId) return
    try {
        // text/plain keeps it a simple CORS request; the route reads the body as JSON either way.
        void fetch(apiUrl('/api/push/opened'), {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
            body: JSON.stringify({ sendId }),
            keepalive: true,
        }).catch(() => {})
    } catch {
        // A beacon that cannot be sent is lost telemetry, nothing more.
    }
}

/** Sends the beacon and, for a known room, the opened event. Returns the room's slug or null. */
function openTap(tap: PushTap): string | null {
    sendOpened(tap.sendId)
    const slug = readPushRoom(tap.room)
    if (!slug) return null
    // The key map is empty after a cold start; the payload's key is this room's key.
    rememberRoomKey(slug, tap.room)
    track('app_room_opened', roomProps(slug, { via: 'push' }))
    return slug
}

/**
 * Resolves with the room of a notification tap that launched the app, or null: no tap, an unknown
 * room key, or a tap this tab already handled. The splash is still up, so the short wait is unseen.
 */
export async function awaitColdPushTap(): Promise<{ slug: string | null; sendId: string } | null> {
    const host = NATIVE_PUSH_ENABLED ? loadHost() : null
    if (!host) {
        coldSettled = true
        return null
    }
    try {
        const { push } = await host
        const dispose = await push.onTap((data) => void claimTap(data))
        // A bridge barrier: the plugin handles one plugin's calls in order and sends the retained
        // event while it handles addListener, so the event is in before this call answers.
        await Promise.race([push.permission(), new Promise((resolve) => setTimeout(resolve, COLD_TAP_BARRIER_MS))])
        dispose()
    } finally {
        coldSettled = true
    }
    const tap = coldTap
    coldTap = null
    if (!tap) return null
    return { slug: openTap(tap), sendId: tap.sendId }
}

/**
 * The warm tap handler for `NativeLinks`: a known room opens on top of the current screen, so
 * Android back returns to it; an unknown key opens the rooms list (not the most recent room). Returns what it did.
 */
export function openWarmTap(data: Record<string, unknown>, push: (path: string) => void): 'skip' | 'room' | 'home' {
    if (claimTap(data) !== 'warm') return 'skip'
    const slug = openTap(readTap(data))
    push(slug ? roomPath(slug) : NATIVE_ROOMS_LIST)
    return slug ? 'room' : 'home'
}
