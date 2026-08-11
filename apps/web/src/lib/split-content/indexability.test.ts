import { describe, expect, it } from 'vitest'
import { splitContentIndexable, splitContentIndexableFor } from './indexability'

describe('Split content indexability', () => {
    it('cannot be enabled by runtime configuration while the source release bit is false', () => {
        for (const value of [undefined, '', 'false', 'true', '1', 'TRUE', ' true ']) {
            expect(splitContentIndexableFor(value, false)).toBe(false)
        }
        expect(splitContentIndexable()).toBe(false)
    })

    it('allows the reviewed source flip but keeps explicit false and malformed runtime values closed', () => {
        expect(splitContentIndexableFor(undefined, true)).toBe(true)
        expect(splitContentIndexableFor('true', true)).toBe(true)
        for (const value of ['', 'false', '1', 'TRUE', ' true ']) {
            expect(splitContentIndexableFor(value, true)).toBe(false)
        }
    })
})
