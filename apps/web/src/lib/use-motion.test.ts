import { describe, expect, it } from 'vitest'
import { motionAllowed } from './use-motion'

/**
 * The composition rule, not the hook: vitest runs in `node` here, so there is no
 * DOM to render a hook into. Keeping the decision in a pure function is what
 * makes it testable at all — and this is the one rule in the animation system
 * that has an accessibility obligation behind it, so it gets asserted rather
 * than reviewed.
 */
describe('motionAllowed', () => {
    it('allows motion when nobody has asked otherwise', () => {
        expect(motionAllowed(true, false)).toBe(true)
    })

    it('honours the in-app toggle', () => {
        expect(motionAllowed(false, false)).toBe(false)
    })

    it('lets the OS preference win over the in-app toggle', () => {
        expect(motionAllowed(true, true)).toBe(false)
    })

    it('stays off when both say off', () => {
        expect(motionAllowed(false, true)).toBe(false)
    })

    it('keeps the server frame still while the media query is unresolved', () => {
        // SSR cannot read `prefers-reduced-motion`. Motion starts only after the
        // browser has returned a real "no preference".
        expect(motionAllowed(true, null)).toBe(false)
        expect(motionAllowed(false, null)).toBe(false)
    })
})
