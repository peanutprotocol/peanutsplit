'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { playSound, warmAudio, type SoundName } from './sounds'

const STORAGE_KEY = 'ps:settings'

export interface Settings {
    soundEnabled: boolean
    hapticsEnabled: boolean
}

/** Both ON — the palette is the product, and it is quiet by design. */
const DEFAULTS: Settings = { soundEnabled: true, hapticsEnabled: true }

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
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) return
        const parsed = JSON.parse(raw) as Partial<Settings>
        current = {
            soundEnabled: parsed.soundEnabled ?? DEFAULTS.soundEnabled,
            hapticsEnabled: parsed.hapticsEnabled ?? DEFAULTS.hapticsEnabled,
        }
    } catch {
        // Corrupt or blocked storage just means defaults. Never throw here.
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

    return { settings, setSoundEnabled, setHapticsEnabled }
}

/** Semantic haptics, mapped to the four cues. Durations are deliberately tiny —
 *  anything over ~30ms reads as a buzz, not a tap. iOS ignores the duration (its
 *  switch element gives one fixed system tap), so this is the Android curve. */
const HAPTIC_MS: Record<SoundName, number> = { tick: 5, pop: 8, thunk: 16, bell: 28 }

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

/**
 * The one call site for "something happened": plays the cue and fires the
 * matching haptic, each gated on its own setting. Also warms the iOS audio
 * thread on the first invocation, which is always inside a real gesture.
 */
export function useFeedback() {
    const { settings } = useSettings()

    return useCallback(
        (name: SoundName) => {
            if (settings.soundEnabled) {
                warmAudio()
                playSound(name)
            }
            if (settings.hapticsEnabled) triggerHaptic(HAPTIC_MS[name])
        },
        [settings.soundEnabled, settings.hapticsEnabled]
    )
}
