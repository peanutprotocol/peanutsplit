import { describe, expect, it } from 'vitest'
import { expenseSessionShouldOpen } from './expense-session'

describe('expense draft identity suspension', () => {
    it('waits to seed an initially unjoined form until the claimant is known', () => {
        expect(expenseSessionShouldOpen(true, true, false)).toBe(false)
        expect(expenseSessionShouldOpen(true, false, false)).toBe(true)
    })

    it('keeps an existing expense or settlement draft logically open while identity is reclaimed', () => {
        expect(expenseSessionShouldOpen(true, true, true)).toBe(true)
        expect(expenseSessionShouldOpen(false, true, true)).toBe(false)
    })
})
