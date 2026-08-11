'use client'

/**
 * The install opportunity, held in one place.
 *
 * `beforeinstallprompt` fires once per page load and is gone if nobody catches it. The root layout
 * buffers it before React hydrates, then Providers connects that buffer to this store. Both the
 * deferred banner and the settings row read the same event from here.
 *
 * One deliberate behaviour change came with the move: the event is now `preventDefault()`-ed on
 * every page load, including ones where the banner is snoozed. The settings row has to be able to
 * offer the install even while the banner is asleep, and that is what the snooze means — the
 * banner stops asking, not the app stops being installable.
 *
 * The device questions are `push-status.ts`'s: `isIOSDevice` and `isStandaloneDisplay` are already
 * pure, already tested, and already the answer to "is this an iPad pretending to be a Mac". One
 * name for one thing.
 */

import { useSyncExternalStore } from 'react'
import { track } from './analytics'
import { isIOSDevice, isStandaloneDisplay } from './push-status'

/** Not in lib.dom yet. */
export interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallState = 'installed' | 'promptable' | 'dismissed' | 'ios' | 'waiting' | 'repair'

export interface InstallEnvironment {
    isStandalone: boolean
    isIOS: boolean
    /** A live `beforeinstallprompt` event we are still allowed to replay. */
    hasPrompt: boolean
    /**
     * The event was replayed and the person said no. Chrome will not re-fire it on this page load,
     * so the row must not claim the browser cannot install — it just did offer.
     */
    promptSpent: boolean
    /**
     * `appinstalled` fired, or `prompt()` resolved 'accepted', on THIS page load. The tab that
     * installs the app is still a tab — `display-mode: standalone` never flips in it — so this is
     * the only signal that "installed" is true here.
     */
    installedHere: boolean
    /** This browser has previously launched the canonical `/app` start URL as a standalone app. */
    hasCanonicalLaunchMarker: boolean
    /** The current document is a private room route rather than the canonical app start URL. */
    isRoomPath: boolean
}

export function deriveInstallState(env: InstallEnvironment): InstallState {
    // A prompt accepted in this tab is strongest: do not immediately offer it again while the
    // browser finishes installing.
    if (env.installedHere) return 'installed'
    if (env.isStandalone) {
        // PR11-era room shortcuts launch standalone too, but they have neither the canonical start
        // URL nor the marker written by a real Split launch. Keep that narrow combination on the
        // explicit repair path even if a browser emits an unusual late prompt: directly installing
        // would leave the old room-named icon behind and contaminate ordinary install analytics.
        // A first-ever deep link into a legitimate install can be a false positive; the card remains
        // dismissible and the persistent Device row remains available.
        if (env.isRoomPath && !env.hasCanonicalLaunchMarker) return 'repair'
        return 'installed'
    }
    if (env.hasPrompt) return 'promptable'
    if (env.promptSpent) return 'dismissed'
    if (env.isIOS) return 'ios'
    // Chrome can wait for its engagement threshold before it fires `beforeinstallprompt`.
    // The absence of that event is not a negative installability result.
    return 'waiting'
}

// ------------------------------------------------------------------ the snooze
//
// The deferred banner's exponential backoff. It lives here rather than in the banner because the
// `appinstalled` listener — which has to clear it — lives here now: somebody who installs through
// Chrome's omnibox is not somebody we should keep asking.

const DISMISS_COUNT_KEY = 'ps:pwa-dismiss-count'
const DISMISSED_AT_KEY = 'ps:pwa-dismissed-at'
const SNOOZED_UNTIL_KEY = 'ps:pwa-snoozed-until'
export const CANONICAL_LAUNCH_MARKER_KEY = 'ps:pwa-canonical-launch:v1'
const REPAIR_NOTICE_DISMISSED_KEY = 'ps:pwa-repair-notice-dismissed:v1'

const HOUR = 60 * 60 * 1000
const BASE_BACKOFF_MS = 24 * HOUR
const MAX_BACKOFF_MS = 30 * 24 * HOUR

const readInt = (key: string): number => {
    const raw = window.localStorage.getItem(key)
    const parsed = raw === null ? NaN : Number.parseInt(raw, 10)
    return Number.isFinite(parsed) ? parsed : 0
}

/** 24h → 48h → 96h → … capped at 30 days. */
export const installBackoffMs = (dismissCount: number): number =>
    Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, dismissCount - 1), MAX_BACKOFF_MS)

export const isInstallSnoozed = (): boolean => {
    try {
        const count = readInt(DISMISS_COUNT_KEY)
        if (count === 0) return false
        return Date.now() - readInt(DISMISSED_AT_KEY) < installBackoffMs(count)
    } catch {
        return false
    }
}

/** Records a dismissal and answers how many there have now been. */
export const noteInstallDismissed = (): number => {
    try {
        const next = readInt(DISMISS_COUNT_KEY) + 1
        window.localStorage.setItem(DISMISS_COUNT_KEY, String(next))
        window.localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()))
        return next
    } catch {
        return 1
    }
}

export const isInstallRepairNoticeDismissed = (): boolean => {
    try {
        return window.localStorage.getItem(REPAIR_NOTICE_DISMISSED_KEY) === '1'
    } catch {
        return false
    }
}

/** A separate one-time acknowledgement: an earlier install refusal must never hide migration help. */
export const dismissInstallRepairNotice = (): void => {
    try {
        window.localStorage.setItem(REPAIR_NOTICE_DISMISSED_KEY, '1')
    } catch {
        // Storage denial means the notice may return; the Device row remains usable either way.
    }
}

const clearInstallSnooze = (): void => {
    try {
        window.localStorage.removeItem(DISMISS_COUNT_KEY)
        window.localStorage.removeItem(DISMISSED_AT_KEY)
        window.localStorage.removeItem(SNOOZED_UNTIL_KEY)
    } catch {
        // Private mode. There was nothing to clear.
    }
}

/**
 * The retired instruction drawers wrote a 30-day snooze and, on the automatic surface, an
 * additional dismissal. Reading help was never a refusal. Clear that contaminated trio once on
 * upgrade; future explicit refusals use only the two dismissal keys and are left intact.
 */
export const migrateLegacyInstallSnooze = (): boolean => {
    try {
        if (window.localStorage.getItem(SNOOZED_UNTIL_KEY) === null) return false
        clearInstallSnooze()
        return true
    } catch {
        return false
    }
}

// ------------------------------------------------------------------ the store

let deferred: BeforeInstallPromptEvent | null = null
let promptSpent = false
let installedHere = false
let captured = false
/** `null` until the first browser read, so nothing is ever painted from a guess. */
let state: InstallState | null = null

const listeners = new Set<() => void>()

type InstallWindow = Window & {
    __splitInstallPrompt?: BeforeInstallPromptEvent | null
}

/**
 * `isIOSDevice` asked of the live navigator.
 *
 * Exported because the settings row's LABEL follows the device rather than the state. Apple has no
 * install verb — Safari's own share sheet says "Add to Home Screen" — and the browsers that do say
 * install have no home screen to add to. Every state but `installed` implies its platform anyway
 * (`promptable` and `dismissed` need a `beforeinstallprompt` no Apple browser fires), so asking the
 * device once is both shorter than a per-state table and the only thing that gets `installed` right.
 *
 * A Mac answers false, which is correct rather than a gap: macOS Safari's affordance is "Add to
 * Dock", an install, not a home-screen add. Only an iPad pretending to be a Mac flips it back.
 */
export function isIOSHere(): boolean {
    const navigator = window.navigator
    return isIOSDevice({
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        maxTouchPoints: navigator.maxTouchPoints,
    })
}

const isStandaloneHere = (): boolean => {
    const navigator = window.navigator as Navigator & { standalone?: boolean }
    return isStandaloneDisplay(window.matchMedia('(display-mode: standalone)').matches, navigator.standalone)
}

/**
 * Written only by the canonical `/app` route after it proves it is running standalone. Keeping the
 * version in the key lets a future identity migration disregard old evidence without rewriting it.
 */
export function recordCanonicalStandaloneLaunch(): boolean {
    if (window.location.pathname !== '/app' || new URLSearchParams(window.location.search).get('repair') === '1')
        return false
    if (!isStandaloneHere()) return false
    try {
        window.localStorage.setItem(CANONICAL_LAUNCH_MARKER_KEY, '1')
        return true
    } catch {
        // Storage can be denied in private or embedded contexts. Do not turn that into a crash.
        return false
    }
}

export function hasCanonicalStandaloneLaunch(): boolean {
    try {
        return window.localStorage.getItem(CANONICAL_LAUNCH_MARKER_KEY) === '1'
    } catch {
        return false
    }
}

function readEnvironment(): InstallEnvironment {
    return {
        isStandalone: isStandaloneHere(),
        isIOS: isIOSHere(),
        hasPrompt: deferred !== null,
        promptSpent,
        installedHere,
        hasCanonicalLaunchMarker: hasCanonicalStandaloneLaunch(),
        isRoomPath: window.location.pathname.startsWith('/r/'),
    }
}

function publish(): void {
    state = deriveInstallState(readEnvironment())
    for (const listener of listeners) listener()
}

/** Idempotent: called from Providers' mount effect, which React can run more than once. */
export function captureInstallPrompt(): void {
    if (captured || typeof window === 'undefined') return
    captured = true
    migrateLegacyInstallSnooze()

    const takeBufferedPrompt = () => {
        const event = (window as InstallWindow).__splitInstallPrompt
        if (!event || event === deferred) return
        deferred = event
        publish()
    }
    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault()
        ;(window as InstallWindow).__splitInstallPrompt = event as BeforeInstallPromptEvent
        takeBufferedPrompt()
    })

    // The ONE place `pwa_installed` is counted. It used to fire from here and from the accepted
    // branch of the banner's own prompt, so a prompt-accepted install counted twice. Chromium-only,
    // for the same reason iOS install conversion is unmeasurable: Safari never fires this.
    window.addEventListener('appinstalled', () => {
        deferred = null
        ;(window as InstallWindow).__splitInstallPrompt = null
        installedHere = true
        clearInstallSnooze()
        track('pwa_installed')
        publish()
    })

    takeBufferedPrompt()
    if (deferred === null) publish()
}

export function subscribeInstall(listener: () => void): () => void {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

export const readInstallState = (): InstallState | null => state

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    const event = deferred
    if (!event) return 'unavailable'
    // Cleared before the await: the event is single-use, and a second tap while the browser's own
    // dialog is up would replay a spent event.
    deferred = null
    ;(window as InstallWindow).__splitInstallPrompt = null
    publish()

    // Attach the rejection handler before opening the browser UI. `userChoice` is supplied as an
    // already-live promise, so it can reject while `prompt()` is still pending; awaiting the two
    // sequentially would briefly leave that rejection unhandled. Either browser failure consumes
    // this single-use event but is not a user dismissal (and certainly not an install).
    const choice = Promise.resolve(event.userChoice).catch(() => null)
    try {
        await event.prompt()
    } catch {
        return 'unavailable'
    }

    const result = await choice
    if (!result) return 'unavailable'
    const { outcome } = result
    if (outcome === 'accepted') installedHere = true
    else promptSpent = true
    publish()
    return outcome
}

export const useInstallState = (): InstallState | null =>
    useSyncExternalStore(subscribeInstall, readInstallState, () => null)
