import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Island, islandActivates, islandContent, ISLAND_SWAP_TRANSITION_CLASS } from './Island'

/**
 * vitest runs in `node` here (see use-motion.test.ts) — there is no jsdom, so an actual
 * IntersectionObserver firing or a click event cannot be dispatched. `islandActivates` and
 * `islandContent` are exported pure functions for exactly that reason (the same split
 * `use-motion.ts` makes for `motionAllowed`): activation and the children/render() swap are
 * asserted directly. A lightweight IntersectionObserver stub covers the parts that only need the
 * component not to crash before mount, and a source read proves the observer/click handlers are
 * actually wired to those pure functions, and never to motion preference.
 */

class StubIntersectionObserver {
    observe() {}
    disconnect() {}
    unobserve() {}
}
// @ts-expect-error test stub, not a full IntersectionObserver implementation
global.IntersectionObserver = StubIntersectionObserver

const { useMotionAllowedMock } = vi.hoisted(() => ({ useMotionAllowedMock: vi.fn(() => true) }))
vi.mock('@/lib/use-motion', () => ({ useMotionAllowed: useMotionAllowedMock }))

describe('islandContent', () => {
    it('shows children and never calls render() before activation', () => {
        const render = vi.fn(() => 'enhanced')
        expect(islandContent(false, 'static-children', render)).toBe('static-children')
        expect(render).not.toHaveBeenCalled()
    })

    it("replaces children with render()'s output once activated", () => {
        const render = vi.fn(() => 'enhanced')
        expect(islandContent(true, 'static-children', render)).toBe('enhanced')
        expect(render).toHaveBeenCalledTimes(1)
    })
})

describe('islandActivates', () => {
    it('an intersection trigger activates on the intersection event only', () => {
        expect(islandActivates('intersection', 'observed-intersecting')).toBe(true)
        expect(islandActivates('intersection', 'tap')).toBe(false)
    })

    it('a tap trigger activates on the tap event only', () => {
        expect(islandActivates('tap', 'tap')).toBe(true)
        expect(islandActivates('tap', 'observed-intersecting')).toBe(false)
    })
})

describe('Island component', () => {
    it('renders children as the initial static answer, unactivated, before either trigger fires', () => {
        const render = vi.fn(() => <span>enhanced</span>)
        const html = renderToStaticMarkup(
            <Island render={render} trigger="tap">
                <span>static answer</span>
            </Island>
        )
        expect(html).toContain('static answer')
        expect(html).not.toContain('enhanced')
        expect(render).not.toHaveBeenCalled()
    })

    it('carries the swap transition class when motion is allowed', () => {
        useMotionAllowedMock.mockReturnValue(true)
        const html = renderToStaticMarkup(
            <Island render={() => <span>enhanced</span>}>
                <span>static answer</span>
            </Island>
        )
        expect(html).toContain(ISLAND_SWAP_TRANSITION_CLASS)
    })

    it('omits the swap transition class when motion is not allowed — activation itself is unaffected', () => {
        useMotionAllowedMock.mockReturnValue(false)
        const html = renderToStaticMarkup(
            <Island render={() => <span>enhanced</span>}>
                <span>static answer</span>
            </Island>
        )
        expect(html).not.toContain(ISLAND_SWAP_TRANSITION_CLASS)
        expect(html).toContain('static answer')
        useMotionAllowedMock.mockReturnValue(true)
    })

    it('wires the intersection observer and the tap handler to islandActivates, never to motion preference', () => {
        const source = readFileSync(new URL('./Island.tsx', import.meta.url), 'utf8')
        expect(source).toContain('new IntersectionObserver')
        expect(source).toContain("islandActivates(trigger, 'observed-intersecting')")
        expect(source).toContain("islandActivates(trigger, 'tap')")

        const effectBody = source.slice(source.indexOf('useEffect(() => {'), source.indexOf('}, [trigger, activated])'))
        expect(effectBody).not.toContain('motionAllowed')

        const tapBody = source.slice(
            source.indexOf('const handleTap'),
            source.indexOf('return (', source.indexOf('const handleTap'))
        )
        expect(tapBody).not.toContain('motionAllowed')

        // motionAllowed gates ONLY the className.
        expect(source).toContain('className={motionAllowed ? ISLAND_SWAP_TRANSITION_CLASS : undefined}')
    })
})
