'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { IS_NATIVE_APP } from './platform'
import { playSound, warmAudio, type SoundName } from './sounds'

const STORAGE_KEY = 'ps:settings'

export interface Settings {
    soundEnabled: boolean
    hapticsEnabled: boolean
    animationsEnabled: boolean
    /** The person allowed receipt photos to go to the AI model. Read only in the store app. */
    scanConsent: boolean
}

/** All feedback ON — the palette is the product, and it is quiet by design. AI consent starts OFF:
 *  it is only ever given by a tap. */
const DEFAULTS: Settings = { soundEnabled: true, hapticsEnabled: true, animationsEnabled: true, scanConsent: false }

/**
 * Whether the scan must ask before the photo leaves the device.
 *
 * App only (Apple 5.1.2(i) asks for explicit consent before personal data goes to a third-party
 * AI). The web flow keeps its passive provider note and no extra tap until Konrad decides
 * otherwise (decision 8.3 #12 in the native-app plan).
 */
export function scanConsentNeeded(
    settings: Pick<Settings, 'scanConsent'>,
    nativeApp: boolean = IS_NATIVE_APP
): boolean {
    return nativeApp && !settings.scanConsent
}

/** Stored JSON to settings. Missing or non-boolean fields take the default, so a value written
 *  before a setting existed never turns into `false` by accident. */
export function parseSettings(raw: string | null): Settings {
    if (!raw) return DEFAULTS
    try {
        const parsed = JSON.parse(raw) as Partial<Record<keyof Settings, unknown>> | null
        const read = (key: keyof Settings): boolean =>
            typeof parsed?.[key] === 'boolean' ? (parsed[key] as boolean) : DEFAULTS[key]
        return {
            soundEnabled: read('soundEnabled'),
            hapticsEnabled: read('hapticsEnabled'),
            animationsEnabled: read('animationsEnabled'),
            scanConsent: read('scanConsent'),
        }
    } catch {
        return DEFAULTS
    }
}

/**
 * A tiny external store rather than context: the settings are read from the
 * feedback hook on nearly every screen, and a provider would force everything
 * under it to re-render for a preference that changes twice a year.
 */
let current: Settings = DEFAULTS
let hydrated = false
const listeners = new Set<() => void>()

const emit = () => listeners.forEach((listener) => listener())

function hydrate(): void {
    if (hydrated || typeof window === 'undefined') return
    hydrated = true
    try {
        current = parseSettings(window.localStorage.getItem(STORAGE_KEY))
    } catch {
        // Blocked storage just means defaults. Never throw here.
    }
}

function write(next: Settings): void {
    current = next
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
        // Private-mode Safari. The setting still applies for this session.
    }
    emit()
}

const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

// Server render always sees the defaults, so the first client paint matches and
// nothing hydration-mismatches; `hydrate()` runs in an effect right after.
const getSnapshot = () => current
const getServerSnapshot = () => DEFAULTS

export function useSettings() {
    const settings = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

    useEffect(() => {
        if (hydrated) return
        hydrate()
        emit()
    }, [])

    const setSoundEnabled = useCallback((value: boolean) => {
        write({ ...current, soundEnabled: value })
        // Confirm the toggle in its own medium — turning sound on should make a sound.
        if (value) playSound('tick')
    }, [])

    const setHapticsEnabled = useCallback((value: boolean) => {
        write({ ...current, hapticsEnabled: value })
    }, [])

    const setAnimationsEnabled = useCallback((value: boolean) => {
        write({ ...current, animationsEnabled: value })
    }, [])

    const setScanConsent = useCallback((value: boolean) => {
        write({ ...current, scanConsent: value })
    }, [])

    return { settings, setSoundEnabled, setHapticsEnabled, setAnimationsEnabled, setScanConsent }
}

/** Semantic haptics, mapped one-to-one to the cues. Durations are deliberately
 *  tiny — anything over ~30ms reads as a buzz, not a tap. iOS ignores the
 *  duration (its switch element gives one fixed system tap), so this is the
 *  Android curve; the tiers match the loudness tiers in `sounds.ts`. */
export const HAPTIC_MS: Record<SoundName, number> = {
    blip: 4,
    tick: 5,
    pop: 8,
    whoosh: 10,
    thunk: 16,
    error: 18,
    bell: 28,
}

/**
 * Multi-pulse patterns, for the three events that are *outcomes* rather than
 * acknowledgements. A single tap says "received"; a shape says what happened.
 */
export type HapticPattern = 'confirm' | 'error' | 'success'

/**
 * `navigator.vibrate` reads these as alternating buzz/pause, starting on a buzz.
 *
 *   confirm — two even pulses: a multi-step action landed intact.
 *   error   — three even pulses, the universal "no".
 *   success — three accelerating pulses (50 / 100 / 150), so the shape *arrives*
 *             somewhere instead of just repeating. This is the all-settled feel.
 */
export const HAPTIC_PATTERNS: Record<HapticPattern, readonly number[]> = {
    confirm: [50, 70, 50],
    error: [50, 70, 50, 70, 50],
    success: [50, 50, 100, 50, 150],
}

/**
 * iOS has no Vibration API, and the hidden switch gives exactly one fixed system
 * tap — no duration, no pattern. So a pattern has to be *staggered* in wall time
 * instead, and the offsets cannot be derived from the Android curve above: its
 * 50/70ms pulses are shorter than the ~100ms at which two Taptic taps stop
 * blurring into one. These are tuned to the shape, not to the milliseconds:
 * same number of taps, same accelerating/even feel.
 */
export const IOS_PATTERN_OFFSETS_MS: Record<HapticPattern, readonly number[]> = {
    confirm: [120],
    error: [120, 240],
    success: [100, 250],
}

const SWITCH_ID = 'ps-haptic-switch'
let hapticLabel: HTMLLabelElement | null = null

const isIOS = () =>
    typeof navigator !== 'undefined' &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
        // iPadOS 13+ reports as a Mac; the touch points give it away.
        (/Mac/.test(navigator.userAgent) && navigator.maxTouchPoints > 1))

/**
 * iOS has no Vibration API; the only way to get a system tap out of Safari is to
 * click a hidden `input[switch]`. `use-haptic` does this per hook instance, which
 * would mean a duplicate-id pair of elements for every component that wants
 * feedback — so we mint exactly one for the whole app instead.
 */
function iosTap(): void {
    if (typeof document === 'undefined') return
    if (!hapticLabel) {
        const input = document.createElement('input')
        input.type = 'checkbox'
        input.id = SWITCH_ID
        input.setAttribute('switch', '')
        input.style.display = 'none'
        const label = document.createElement('label')
        label.htmlFor = SWITCH_ID
        label.style.display = 'none'
        document.body.append(input, label)
        hapticLabel = label
    }
    hapticLabel.click()
}

export function triggerHaptic(ms: number): void {
    if (typeof navigator === 'undefined') return
    if (!isIOS() && typeof navigator.vibrate === 'function') {
        navigator.vibrate(ms)
        return
    }
    iosTap()
}

/** The pattern twin of `triggerHaptic`. Fail-silent everywhere: a device with no
 *  vibration hardware, a browser that refuses without a gesture, a stale iOS
 *  switch — none of it is worth an exception on the way out of a save. */
export function triggerHapticPattern(pattern: HapticPattern): void {
    if (typeof navigator === 'undefined') return
    try {
        if (!isIOS() && typeof navigator.vibrate === 'function') {
            // Copied because `vibrate` takes a mutable number[] and the table is
            // frozen-by-convention shared state.
            navigator.vibrate([...HAPTIC_PATTERNS[pattern]])
            return
        }
        iosTap()
        for (const offset of IOS_PATTERN_OFFSETS_MS[pattern]) window.setTimeout(iosTap, offset)
    } catch {
        // Nothing to recover from — the user simply does not feel it.
    }
}

/** A pattern overrides the cue's default single tap. Sound and haptic still ride
 *  the same call and stay independently gated. */
export interface FeedbackOptions {
    haptic?: HapticPattern
    /** Own retrigger window, for a cue fired once per step of a repeating action. */
    throttleKey?: string
}

/**
 * The one call site for "something happened": plays the cue and fires the
 * matching haptic, each gated on its own setting. Also warms the iOS audio
 * thread on the first invocation, which is always inside a real gesture.
 */
export function useFeedback() {
    const { settings } = useSettings()

    return useCallback(
        (name: SoundName, options?: FeedbackOptions) => {
            if (settings.soundEnabled) {
                warmAudio()
                playSound(name, options?.throttleKey)
            }
            if (settings.hapticsEnabled) {
                if (options?.haptic) triggerHapticPattern(options.haptic)
                else triggerHaptic(HAPTIC_MS[name])
            }
        },
        [settings.soundEnabled, settings.hapticsEnabled]
    )
}
