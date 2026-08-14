'use client'

/**
 * fun-engine.md S2's hydration primitive: `children` is the full server-rendered answer and stays
 * in the DOM exactly as-is until one concrete moment — an IntersectionObserver firing, or a tap
 * when `trigger="tap"` — swaps it for `render()`'s output. No consumer yet; the contract and its
 * test land first (fun-engine.md S2 notes).
 *
 * Motion preference (`useMotionAllowed`) never gates activation — a reduced-motion reader still
 * gets the enhancement, just without the fade. It only decides whether `ISLAND_SWAP_TRANSITION_CLASS`
 * is present on the swap.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMotionAllowed } from '@/lib/use-motion'

export type IslandTrigger = 'intersection' | 'tap'
export type IslandEvent = 'observed-intersecting' | 'tap'

export const ISLAND_SWAP_TRANSITION_CLASS = 'transition-opacity duration-300'

/**
 * Pure activation decision, kept separate from the component so it is testable without a DOM
 * (vitest runs in `node` here — the same reason use-motion.ts extracts `motionAllowed`). An
 * intersection-trigger Island only reacts to an intersection event; a tap-trigger Island only
 * reacts to a tap — the component wires each trigger mode to exactly one of these events, never
 * both, so this stays a direct match rather than a policy with exceptions.
 */
export function islandActivates(trigger: IslandTrigger, event: IslandEvent): boolean {
    return trigger === 'tap' ? event === 'tap' : event === 'observed-intersecting'
}

/** Pure swap: which content to show. `render` is only ever invoked once `activated` is true. */
export function islandContent<T>(activated: boolean, children: T, render: () => T): T {
    return activated ? render() : children
}

export function Island({
    children,
    render,
    trigger = 'intersection',
}: {
    children: ReactNode
    render: () => ReactNode
    trigger?: IslandTrigger
}) {
    const [activated, setActivated] = useState(false)
    const containerRef = useRef<HTMLDivElement | null>(null)
    const motionAllowed = useMotionAllowed()

    useEffect(() => {
        if (activated || !islandActivates(trigger, 'observed-intersecting')) return
        const node = containerRef.current
        if (!node) return

        const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) setActivated(true)
        })
        observer.observe(node)
        return () => observer.disconnect()
    }, [trigger, activated])

    const handleTap = (): void => {
        if (!activated && islandActivates(trigger, 'tap')) setActivated(true)
    }

    return (
        <div
            ref={containerRef}
            onClick={trigger === 'tap' && !activated ? handleTap : undefined}
            className={motionAllowed ? ISLAND_SWAP_TRANSITION_CLASS : undefined}
        >
            {islandContent(activated, children, render)}
        </div>
    )
}
