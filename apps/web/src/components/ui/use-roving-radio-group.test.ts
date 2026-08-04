import { describe, expect, it } from 'vitest'
import { nextRovingRadioIndex } from './use-roving-radio-group'

describe('nextRovingRadioIndex', () => {
    it('moves in both visual directions and wraps', () => {
        expect(nextRovingRadioIndex('ArrowRight', 1, 3)).toBe(2)
        expect(nextRovingRadioIndex('ArrowDown', 2, 3)).toBe(0)
        expect(nextRovingRadioIndex('ArrowLeft', 0, 3)).toBe(2)
        expect(nextRovingRadioIndex('ArrowUp', 2, 3)).toBe(1)
    })

    it('moves directly to either edge', () => {
        expect(nextRovingRadioIndex('Home', 2, 4)).toBe(0)
        expect(nextRovingRadioIndex('End', 0, 4)).toBe(3)
    })

    it('has no destination in an empty group', () => {
        expect(nextRovingRadioIndex('Home', 0, 0)).toBe(-1)
    })
})
