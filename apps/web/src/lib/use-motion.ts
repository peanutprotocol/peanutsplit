'use client'

/**
 * Two signals decide whether anything moves, and they are not equal.
 *
 * `prefers-reduced-motion` is an accessibility declaration made once, at the OS,
 * by someone who may get motion sick or seizure-prone from a bouncing mascot. The
 * in-app `animationsEnabled` toggle is a taste preference. So the OS signal always
 * wins: it can only ever *remove* motion, and no in-app setting can restore it.
 *
 * Components that need a meaningful still first frame consult
 * `useMotionAllowed()`. The root `MotionConfig` consumes the same answer as a
 * backstop for every motion/react surface, so there is exactly one composition
 * of the two preferences.
 */

import { useEffect, useSyncExternalStore } from 'react'
import { useSettings } from './use-settings'

/** The class stamped on `<html>` so CSS-keyframe decoration obeys the same rule. */
export const REDUCE_ANIMATIONS_CLASS = 'reduce-animations'
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

const reducedMotionSnapshot = (): boolean | null =>
    typeof window === 'undefined' ? null : window.matchMedia(REDUCED_MOTION_QUERY).matches

const reducedMotionServerSnapshot = (): null => null

/**
 * Motion's own hook keeps one module-level media-query snapshot. Separate Next
 * client boundaries can initialise separate copies at different moments, which
 * made the hero honour reduced motion while a lower proof section did not.
 * Reading the platform query through React's external-store contract gives
 * every boundary the same live answer and responds when the OS setting changes.
 */
const subscribeToReducedMotion = (onChange: () => void): (() => void) => {
    const query = window.matchMedia(REDUCED_MOTION_QUERY)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
}

/**
 * The whole decision, as a pure function so it can be tested without a DOM
 * (vitest runs in `node` here — there is no jsdom to render a hook into).
 *
 * `osReducedMotion` is `boolean | null` because motion/react reports `null` until
 * it has read the media query; unknown is treated as "no preference expressed",
 * which is what the browser default is anyway.
 */
export function motionAllowed(animationsEnabled: boolean, osReducedMotion: boolean | null): boolean {
    if (osReducedMotion === true) return false
    return animationsEnabled
}

/** True when this render is allowed to move things. */
export function useMotionAllowed(): boolean {
    const { settings } = useSettings()
    const osReducedMotion = useSyncExternalStore(
        subscribeToReducedMotion,
        reducedMotionSnapshot,
        reducedMotionServerSnapshot
    )
    return motionAllowed(settings.animationsEnabled, osReducedMotion)
}

/**
 * Mirrors the in-app setting onto `<html>` for the CSS-keyframe animations, which
 * cannot consult a React hook.
 *
 * No cookie and no server pass, unlike the locale: this preference does not change
 * the DOM *shape*, only whether transforms run, so a one-frame delay before the
 * class lands costs nothing visible — and a cookie would make every page dynamic
 * for the sake of a decoration toggle.
 *
 * Only the in-app setting is mirrored. The OS preference is already handled in CSS
 * by a `prefers-reduced-motion` media query in `globals.css`, and duplicating it
 * here would mean two sources for one rule.
 */
export function useAnimationPreferenceClass(): void {
    const { settings } = useSettings()

    useEffect(() => {
        document.documentElement.classList.toggle(REDUCE_ANIMATIONS_CLASS, !settings.animationsEnabled)
    }, [settings.animationsEnabled])
}
