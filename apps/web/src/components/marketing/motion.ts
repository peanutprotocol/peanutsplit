import { useEffect, useRef, useState } from 'react'
import type { Variants } from 'motion/react'

/**
 * The landing page's shared motion vocabulary. A section reveals as a scene:
 * the root fades in while its children stagger with `rise` or `pop` — never as
 * one opaque block, which reads as a screenshot loading rather than a page
 * assembling. Extracted from LandingProof, which pioneered the pattern.
 *
 * The contract every marketing surface keeps (e2e pins it):
 * - Scene roots spread `sceneProps(motionAllowed)` and stamp
 *   `data-motion={motionAllowed ? 'ready' : 'still'}` + `data-motion-surface`.
 * - When motion is not allowed, the still path renders complete meaning on the
 *   first frame (`initial: false`) — SSR and no-JS always get the full page.
 * - Opacity and transforms only; nothing that moves layout.
 */

export const sceneVariants: Variants = {
    hidden: { opacity: 0 },
    shown: {
        opacity: 1,
        transition: { duration: 0.28, staggerChildren: 0.08, delayChildren: 0.04 },
    },
}

/** Copy and full-width pieces arrive from below. */
export const riseVariants: Variants = {
    hidden: { opacity: 0, y: 24 },
    shown: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 210, damping: 24 } },
}

/** Softer rise for list rows and fine print — half the travel, quicker settle. */
export const riseSoftVariants: Variants = {
    hidden: { opacity: 0, y: 10 },
    shown: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 26 } },
}

/** Playful pieces — avatars, doodles, emoji, badges — scale in. */
export const popVariants: Variants = {
    hidden: { opacity: 0, scale: 0.94 },
    shown: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 260, damping: 20 } },
}

/**
 * The standard reveal prop bag for a scene root; children pick a child variant
 * and inherit the stagger. `amount` stays low because on a phone a tall
 * section never reaches high visibility ratios and would never fire.
 */
export function sceneProps(motionAllowed: boolean, amount = 0.25) {
    return {
        variants: sceneVariants,
        initial: motionAllowed ? ('hidden' as const) : false,
        animate: motionAllowed ? undefined : ('shown' as const),
        whileInView: motionAllowed ? ('shown' as const) : undefined,
        viewport: { once: true, amount },
    }
}

/**
 * Remount key for a scene root — REQUIRED next to `sceneProps` or the scene
 * never plays on a first visit. `initial` is resolved once, at mount, and the
 * first client render happens during hydration, when `useMotionAllowed()` still
 * reports the server's still snapshot — so the gated `initial` lands as `false`
 * and later renders cannot re-arm it. Keying the root on `useSceneArm`'s answer
 * remounts it hidden once the real answer arrives, and `whileInView` then fires
 * the reveal on scroll.
 */
export function sceneKey(name: string, armed: boolean): string {
    return armed ? name : `${name}-still`
}

/**
 * Decides whether a scene may arm at all: only once motion is allowed AND the
 * root sits fully below the viewport. SSR has already painted the page, so
 * arming a visible scene blanks real content for a few hundred milliseconds
 * before `whileInView` restores it — a scene the visitor can see when the
 * answer arrives therefore stays still and simply doesn't play. Turning motion
 * off mid-session disarms, which remounts the scene into full visibility.
 */
export function useSceneArm<T extends HTMLElement = HTMLElement>(motionAllowed: boolean) {
    const ref = useRef<T | null>(null)
    const [armed, setArmed] = useState(false)

    useEffect(() => {
        if (!motionAllowed) {
            setArmed(false)
            return
        }
        const el = ref.current
        if (el && el.getBoundingClientRect().top >= window.innerHeight) setArmed(true)
    }, [motionAllowed])

    return { ref, armed }
}
