'use client'

/**
 * Minimal content measurement — the first real consumer of `pageRecipe`'s chapter output
 * (fun-engine.md S2). One `content_pageview` on mount, one `content_scroll_depth` per milestone
 * the first time a 1px sentinel crosses it, never a second time even if the reader scrolls back
 * up through it later.
 *
 * `template` and `chapter` are the whole property bag: both closed enums describing the PAGE, not
 * the reader — no slug, no room, no session length. `contentPageviewProps`/`contentScrollDepthProps`
 * are exported so their exact key set is provable without a DOM (see ContentAnalytics.test.tsx).
 */

import { useEffect, useRef, useState } from 'react'
import { track } from '@/lib/analytics'
import type { Collection } from '@/lib/content'
import type { Chapter } from '@/lib/split-content/chapter-tokens'

export const SCROLL_MILESTONES = [25, 50, 75, 100] as const
export type ScrollMilestone = (typeof SCROLL_MILESTONES)[number]
export type ContentTemplate = Collection | 'guide'

export function contentPageviewProps(template: ContentTemplate, chapter: Chapter) {
    return { template, chapter }
}

export function contentScrollDepthProps(template: ContentTemplate, chapter: Chapter, milestone: ScrollMilestone) {
    return { template, chapter, milestone }
}

/**
 * Pure double-fire guard: marks `milestone` fired in-place and reports whether THIS call is the
 * first time. Kept separate from the component so "each milestone fires exactly once" is provable
 * without a DOM — vitest runs in `node` here, the same reason use-motion.test.ts extracts
 * `motionAllowed` as a pure function.
 */
export function markScrollMilestone(milestone: ScrollMilestone, fired: Set<ScrollMilestone>): boolean {
    if (fired.has(milestone)) return false
    fired.add(milestone)
    return true
}

export function ContentAnalytics({ template, chapter }: { template: ContentTemplate; chapter: Chapter }) {
    const fired = useRef<Set<ScrollMilestone>>(new Set())
    const [pageHeight, setPageHeight] = useState<number | null>(null)

    useEffect(() => {
        track('content_pageview', contentPageviewProps(template, chapter))
    }, [template, chapter])

    // Measured after mount, never assumed: the document is not laid out yet during SSR.
    useEffect(() => {
        setPageHeight(document.documentElement.scrollHeight)
    }, [])

    useEffect(() => {
        if (pageHeight === null) return
        const sentinels = document.querySelectorAll<HTMLElement>('[data-content-scroll-sentinel]')
        const observer = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue
                const milestone = Number(entry.target.getAttribute('data-content-scroll-sentinel')) as ScrollMilestone
                if (!markScrollMilestone(milestone, fired.current)) continue
                track('content_scroll_depth', contentScrollDepthProps(template, chapter, milestone))
            }
        })
        sentinels.forEach((node) => observer.observe(node))
        return () => observer.disconnect()
    }, [pageHeight, template, chapter])

    if (pageHeight === null) return null

    return (
        <>
            {SCROLL_MILESTONES.map((milestone) => (
                <span
                    key={milestone}
                    aria-hidden="true"
                    data-content-scroll-sentinel={milestone}
                    style={{ position: 'absolute', top: pageHeight * (milestone / 100), left: 0, width: 1, height: 1 }}
                />
            ))}
        </>
    )
}
