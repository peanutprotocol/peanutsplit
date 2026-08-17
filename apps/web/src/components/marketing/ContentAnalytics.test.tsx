import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * vitest runs in `node` here (see use-motion.test.ts) — there is no jsdom, so IntersectionObserver
 * firing and a real mount/re-render cycle cannot be exercised directly. `contentPageviewProps` /
 * `contentScrollDepthProps` / `markScrollMilestone` are exported as pure functions for exactly
 * this reason (the same split `use-motion.ts` makes for `motionAllowed`): the property bag and the
 * once-per-milestone guard are asserted directly, and a lightweight IntersectionObserver stub plus
 * `renderToStaticMarkup` cover the parts that only need the component not to crash before mount.
 */

const trackMock = vi.fn()
vi.mock('@/lib/analytics', () => ({ track: (...args: unknown[]) => trackMock(...args) }))

class StubIntersectionObserver {
    observe() {}
    disconnect() {}
    unobserve() {}
}
// @ts-expect-error test stub, not a full IntersectionObserver implementation
global.IntersectionObserver = StubIntersectionObserver

afterEach(() => {
    trackMock.mockClear()
})

describe('contentPageviewProps / contentScrollDepthProps', () => {
    it('carries exactly template and chapter for a pageview, nothing else', async () => {
        const { contentPageviewProps } = await import('./ContentAnalytics')
        expect(Object.keys(contentPageviewProps('blog', 'trips')).sort()).toEqual(['chapter', 'template'])
        expect(contentPageviewProps('blog', 'trips')).toEqual({ template: 'blog', chapter: 'trips' })
    })

    it('carries exactly template, chapter and milestone for a scroll-depth event, nothing else', async () => {
        const { contentScrollDepthProps } = await import('./ContentAnalytics')
        expect(Object.keys(contentScrollDepthProps('guide', 'home', 50)).sort()).toEqual([
            'chapter',
            'milestone',
            'template',
        ])
        expect(contentScrollDepthProps('guide', 'home', 50)).toEqual({
            template: 'guide',
            chapter: 'home',
            milestone: 50,
        })
    })

    it('never carries a slug- or room-shaped value — the property bag is closed to two/three keys', async () => {
        const { contentPageviewProps, contentScrollDepthProps } = await import('./ContentAnalytics')
        const bags = [
            contentPageviewProps('capture', 'versus'),
            contentScrollDepthProps('alternatives', 'currencies', 100),
        ]
        for (const bag of bags) {
            expect(Object.keys(bag).every((key) => ['template', 'chapter', 'milestone'].includes(key))).toBe(true)
        }
    })
})

describe('markScrollMilestone', () => {
    it('fires exactly once per milestone, even across repeated calls (re-intersect guard)', async () => {
        const { markScrollMilestone } = await import('./ContentAnalytics')
        const fired = new Set<25 | 50 | 75 | 100>()

        expect(markScrollMilestone(50, fired)).toBe(true)
        expect(markScrollMilestone(50, fired)).toBe(false)
        expect(markScrollMilestone(50, fired)).toBe(false)
    })

    it('tracks each milestone independently', async () => {
        const { markScrollMilestone } = await import('./ContentAnalytics')
        const fired = new Set<25 | 50 | 75 | 100>()

        expect(markScrollMilestone(25, fired)).toBe(true)
        expect(markScrollMilestone(50, fired)).toBe(true)
        expect(markScrollMilestone(75, fired)).toBe(true)
        expect(markScrollMilestone(100, fired)).toBe(true)
        expect(fired.size).toBe(4)
    })
})

describe('ContentAnalytics component', () => {
    it('renders nothing before mount and calls track zero times during the server pass', async () => {
        const { ContentAnalytics } = await import('./ContentAnalytics')
        const html = renderToStaticMarkup(<ContentAnalytics template="blog" chapter="trips" />)

        // Effects never run under renderToStaticMarkup, so pageHeight stays null and the
        // component renders nothing extra — the pageview only fires once the browser mounts it.
        expect(html).toBe('')
        expect(trackMock).not.toHaveBeenCalled()
    })
})

describe('Script enhancer wiring', () => {
    // fun-engine.md S4/Invariants #3: `<Script>`'s copy/recompute behavior rides in on THIS
    // island rather than its own client component, so this is the one place that has to call it.
    const source = readFileSync(new URL('./ContentAnalytics.tsx', import.meta.url), 'utf8')

    it('imports enhanceScriptBlocks from the plain-DOM module, not a component', () => {
        expect(source).toContain("import { enhanceScriptBlocks } from '@/lib/script-enhancer-dom'")
    })

    it('calls it once on mount, over the whole document', () => {
        expect(source).toContain('enhanceScriptBlocks(document)')
    })
})
