'use client'

/**
 * Minimal content measurement — the first real consumer of `pageRecipe`'s chapter output
 * (fun-engine.md S2). One `content_pageview` on mount, one `content_scroll_depth` per milestone
 * the first time a 1px sentinel crosses it, never a second time even if the reader scrolls back
 * up through it later.
 *
 * `template` and `chapter` are the pageview's whole property bag: both closed enums describing the
 * PAGE, not the reader — no slug, no room, no session length. `content_cta_clicked` adds `source`,
 * the page's own public slug — still a fact about the page, and the CTA links already carry the
 * same value as a campaign code. `contentPageviewProps`/`contentScrollDepthProps`/
 * `contentCtaClickedProps` are exported so their exact key set is provable without a DOM (see
 * ContentAnalytics.test.tsx). Tool pages mount this island too, with no chapter: `toolWallpaperChapter`
 * is ruled wallpaper-only, so their events simply omit the property.
 *
 * Also the one place that wires `<Script>`'s copy/recompute behavior (fun-engine.md S4,
 * Invariants #3), `<Calc>`'s preset chips (Wave 2 / S4) and `<Share>`'s share/copy button (SEO
 * loop B): all three sit in the shared `mdxComponents` map every content route statically imports,
 * so a block-specific client component there would ship to every route regardless of whether its
 * page ever authors the tag. The three `enhance*Blocks` functions are plain DOM, not components, so
 * calling them from this island's existing mount effect adds no new client chunk — the JS-budget
 * walk counts them honestly (js-budget.test.ts).
 */

import { useEffect, useRef, useState } from 'react'
import { track } from '@/lib/analytics'
import { enhanceCalcBlocks } from '@/lib/calc-enhancer-dom'
import type { Collection } from '@/lib/content'
import { isProductHost } from '@/lib/domains'
import { enhanceScriptBlocks } from '@/lib/script-enhancer-dom'
import { enhanceShareBlocks } from '@/lib/share-enhancer-dom'
import type { Chapter } from '@/lib/split-content/chapter-tokens'

export const SCROLL_MILESTONES = [25, 50, 75, 100] as const
export type ScrollMilestone = (typeof SCROLL_MILESTONES)[number]
export type ContentTemplate = Collection | 'guide' | 'tool' | 'room-template'

export function contentPageviewProps(template: ContentTemplate, chapter?: Chapter) {
    return chapter ? { template, chapter } : { template }
}

export function contentScrollDepthProps(
    template: ContentTemplate,
    chapter: Chapter | undefined,
    milestone: ScrollMilestone
) {
    return chapter ? { template, chapter, milestone } : { template, milestone }
}

export function contentCtaClickedProps(template: ContentTemplate, source: string) {
    return { template, source }
}

/**
 * The click allowlist: a link counts as the content→product CTA only when it opens the room
 * composer — `/new` on this deployment or on a product host. Every other link a content page
 * renders (related articles, hubs, the footer) stays silent, and this island only mounts on
 * content surfaces, so nothing in the app or a room can ever reach it.
 */
export function isRoomCreationLink(
    link: { origin: string; hostname: string; pathname: string },
    pageOrigin: string
): boolean {
    return link.pathname === '/new' && (link.origin === pageOrigin || isProductHost(link.hostname))
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

export function ContentAnalytics({
    template,
    chapter,
    source,
}: {
    template: ContentTemplate
    chapter?: Chapter
    source: string
}) {
    const fired = useRef<Set<ScrollMilestone>>(new Set())
    const [pageHeight, setPageHeight] = useState<number | null>(null)

    useEffect(() => {
        track('content_pageview', contentPageviewProps(template, chapter))
    }, [template, chapter])

    // One delegated listener rather than a marker attribute per block: every `/new` link a content
    // page renders IS the CTA, however it was authored (Hero, CTA, ContentCTA, RelatedLink, a tool
    // shell), so selecting by destination cannot miss one added later.
    useEffect(() => {
        const onClick = (event: MouseEvent) => {
            const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
            if (!(anchor instanceof HTMLAnchorElement)) return
            if (!isRoomCreationLink(anchor, window.location.origin)) return
            track('content_cta_clicked', contentCtaClickedProps(template, source))
        }
        document.addEventListener('click', onClick)
        return () => document.removeEventListener('click', onClick)
    }, [template, source])

    // Runs once on mount, independent of motion preference: copy/recompute is behavior, not
    // animation (Island.tsx's docstring makes the same call for activation).
    useEffect(() => {
        enhanceScriptBlocks(document)
        enhanceCalcBlocks(document)
        enhanceShareBlocks(document)
    }, [])

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
