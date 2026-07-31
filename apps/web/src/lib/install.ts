'use client'

/**
 * The install opportunity, held in one place.
 *
 * `beforeinstallprompt` fires once per page load and is gone if nobody catches it — long before
 * anyone opens a settings sheet. So the capture happens once, from Providers' mount effect, and
 * both the deferred banner and the settings row read the same store. Two live listeners for one
 * event is the bug this module exists to prevent.
 *
 * Providers is not the earliest code in the app — the motion preflight script beats it — but
 * Chromium only fires `beforeinstallprompt` after its own installability check finishes, which is
 * well after hydration, and Providers is strictly earlier than the banner's own mount was.
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

export type InstallState = 'installed' | 'promptable' | 'dismissed' | 'ios' | 'unsupported'

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
}

export function deriveInstallState(env: InstallEnvironment): InstallState {
    // Installed first: an app already on this device must never be told how to add itself.
    if (env.isStandalone || env.installedHere) return 'installed'
    if (env.hasPrompt) return 'promptable'
    if (env.promptSpent) return 'dismissed'
    if (env.isIOS) return 'ios'
    return 'unsupported'
}

// ------------------------------------------------------------------ the snooze
//
// The deferred banner's exponential backoff. It lives here rather than in the banner because the
// `appinstalled` listener — which has to clear it — lives here now: somebody who installs through
// Chrome's omnibox is not somebody we should keep asking.

const DISMISS_COUNT_KEY = 'ps:pwa-dismiss-count'
const DISMISSED_AT_KEY = 'ps:pwa-dismissed-at'

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

const clearInstallSnooze = (): void => {
    try {
        window.localStorage.removeItem(DISMISS_COUNT_KEY)
        window.localStorage.removeItem(DISMISSED_AT_KEY)
    } catch {
        // Private mode. There was nothing to clear.
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

/**
 * `isIOSDevice` asked of the live navigator.
 *
 * Exported because the settings row's LABEL follows the device rather than the state. Apple has no
 * install verb — Safari's own share sheet says "Add to Home Screen" — and the browsers that do say
 * install have no home screen to add to. Every state but `installed` implies its platform anyway
 * (`promptable` and `dismissed` need a `beforeinstallprompt` no Apple browser fires; `ios` and
 * `unsupported` are the two halves of this same check), so asking the device once is both shorter
 * than a per-state table and the only thing that gets `installed` right.
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

function readEnvironment(): InstallEnvironment {
    const navigator = window.navigator as Navigator & { standalone?: boolean }
    return {
        isStandalone: isStandaloneDisplay(
            window.matchMedia('(display-mode: standalone)').matches,
            navigator.standalone
        ),
        isIOS: isIOSHere(),
        hasPrompt: deferred !== null,
        promptSpent,
        installedHere,
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

    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault()
        deferred = event as BeforeInstallPromptEvent
        publish()
    })

    // The ONE place `pwa_installed` is counted. It used to fire from here and from the accepted
    // branch of the banner's own prompt, so a prompt-accepted install counted twice. Chromium-only,
    // for the same reason iOS install conversion is unmeasurable: Safari never fires this.
    window.addEventListener('appinstalled', () => {
        deferred = null
        installedHere = true
        clearInstallSnooze()
        track('pwa_installed')
        publish()
    })

    publish()
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
    publish()

    await event.prompt()
    const { outcome } = await event.userChoice
    if (outcome === 'accepted') installedHere = true
    else promptSpent = true
    publish()
    return outcome
}

export const useInstallState = (): InstallState | null =>
    useSyncExternalStore(subscribeInstall, readInstallState, () => null)
