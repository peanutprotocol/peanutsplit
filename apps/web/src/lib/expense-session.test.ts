import { describe, expect, it } from 'vitest'
import { expenseSessionCanStart, expenseSessionShouldOpen } from './expense-session'

describe('expense draft identity suspension', () => {
    it('does not start or open before both the room and identity are resolved', () => {
        expect(expenseSessionCanStart(false, false)).toBe(false)
        expect(expenseSessionShouldOpen(true, false, false, false)).toBe(false)
    })

    it('waits to seed an initially unjoined form until the claimant is known', () => {
        expect(expenseSessionCanStart(true, true)).toBe(false)
        expect(expenseSessionShouldOpen(true, true, true, false)).toBe(false)

        expect(expenseSessionCanStart(true, false)).toBe(true)
        expect(expenseSessionShouldOpen(true, true, false, false)).toBe(true)
    })

    it('keeps an existing expense or settlement draft logically open while identity is reclaimed', () => {
        expect(expenseSessionShouldOpen(true, true, true, true)).toBe(true)
        expect(expenseSessionShouldOpen(false, true, true, true)).toBe(false)
    })
})
