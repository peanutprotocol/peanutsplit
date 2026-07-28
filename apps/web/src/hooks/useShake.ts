'use client'

/**
 * "That didn't go through", said with the element itself.
 *
 * A CSS class rather than a motion component: the shake is attached to containers
 * that already exist (a drawer body, a card) and wrapping them in a `motion.div`
 * to borrow a 500ms animation would change their layout for the other 99% of the
 * time they are not shaking.
 */

import { useCallback, useRef } from 'react'
import { useMotionAllowed } from '@/lib/use-motion'

export const SHAKE_CLASS = 'animate-shake'

/**
 * Restart a CSS animation that is already running.
 *
 * Removing and re-adding a class in the same task is a no-op: the browser only
 * compares computed style at the end of the frame, sees the class present both
 * times, and never restarts the animation — so a second failed submit in a row
 * would sit perfectly still, which reads as the button being dead. Reading
 * `offsetWidth` in between forces a synchronous reflow, which is what makes the
 * removal observable and the re-add a genuine start.
 */
export function replayAnimation(element: HTMLElement | null, className: string): void {
    if (!element) return
    element.classList.remove(className)
    void element.offsetWidth
    element.classList.add(className)
}

/** `ref` on the thing to shake, `shake()` at the point of failure. */
export function useShake<T extends HTMLElement = HTMLDivElement>() {
    const ref = useRef<T>(null)
    const motionAllowed = useMotionAllowed()

    const shake = useCallback(() => {
        if (!motionAllowed) return
        replayAnimation(ref.current, SHAKE_CLASS)
    }, [motionAllowed])

    return { ref, shake }
}
