import { describe, expect, it } from 'vitest'
import { PLAY_TIER_COMPONENT_NAMES, assertRegisterAllows } from './register-governor'

// Exercised against a test-local stub list, separate from the real one, so a future component
// name added to the real list cannot make these particular assertions pass for the wrong reason.
const STUB_PLAY_TIER_NAMES = ['Script', 'Doodle']

describe('PLAY_TIER_COMPONENT_NAMES', () => {
    it('lists Script, the one real play-tier component (fun-engine.md S4)', () => {
        expect(PLAY_TIER_COMPONENT_NAMES).toEqual(['Script'])
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
