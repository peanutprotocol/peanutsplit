import { describe, expect, it } from 'vitest'
import { PLAY_TIER_COMPONENT_NAMES, assertRegisterAllows } from './register-governor'

// S1 has no real play-tier component yet (see register-governor.ts), so the mechanism is
// exercised here against a test-local stub list rather than the still-empty real one.
const STUB_PLAY_TIER_NAMES = ['Script', 'Doodle']

describe('PLAY_TIER_COMPONENT_NAMES', () => {
    it('is empty in S1 — no real play-tier component exists yet', () => {
        expect(PLAY_TIER_COMPONENT_NAMES).toEqual([])
    })
})

describe('assertRegisterAllows', () => {
    it('throws when a flat-register page renders a play-tier component', () => {
        expect(() => assertRegisterAllows('flat', ['Steps', 'Script'], STUB_PLAY_TIER_NAMES)).toThrow(
            /play-tier component/
        )
    })

    it('allows the same component name on a default-register page', () => {
        expect(() => assertRegisterAllows('default', ['Steps', 'Script'], STUB_PLAY_TIER_NAMES)).not.toThrow()
    })

    it('allows a flat-register page that renders no play-tier component', () => {
        expect(() => assertRegisterAllows('flat', ['Steps', 'Checklist'], STUB_PLAY_TIER_NAMES)).not.toThrow()
    })
})
