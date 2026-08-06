import { describe, expect, it } from 'vitest'
import { normalizePersonName, safePersonNameForDisplay } from '@/lib/person-name'

describe('person-name normalization', () => {
    it('composes ordinary accents and keeps multilingual names intact', () => {
        expect(normalizePersonName('  Jose\u0301  ')).toBe('José')
        expect(normalizePersonName('مُحَمَّد')).toBe('مُحَمَّد')
        expect(normalizePersonName('श्रेया')).toBe('श्रेया')
    })

    it('bounds combining-mark stacks without changing the base name', () => {
        const zalgo = `p${'\u0336'.repeat(20)}e${'\u035c'.repeat(20)}`
        const normalized = normalizePersonName(zalgo)

        expect([...normalized].filter((character) => /\p{Mark}/u.test(character))).toHaveLength(6)
        expect(normalized.replace(/\p{Mark}/gu, '')).toBe('pe')
    })

    it('turns embedded controls into one safe space and has a neutral legacy fallback', () => {
        expect(normalizePersonName('Ana\n\u200B  Maria')).toBe('Ana Maria')
        expect(safePersonNameForDisplay('\u200B')).toBe('—')
    })
})
