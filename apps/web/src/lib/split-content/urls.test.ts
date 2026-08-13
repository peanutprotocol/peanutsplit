import { describe, expect, it } from 'vitest'
import { guidePath, splitCalculatorPath, splitGuideLocale, splitHubPath, splitToolsHubPath } from './urls'

describe('Split app and content URL ownership', () => {
    it('builds a guide path with English unprefixed and every other locale prefixed', () => {
        expect(guidePath('en', 'synthetic-guide')).toBe('/guides/synthetic-guide')
        expect(guidePath('es-419', 'synthetic-guide')).toBe('/es-419/guides/synthetic-guide')
        expect(guidePath('pt-br', 'synthetic-guide')).toBe('/pt-br/guides/synthetic-guide')
    })

    it('leaves the hub, tools hub, and calculator builders on their undecided scheme', () => {
        expect(splitHubPath('es-419')).toBe('/es-419/split')
        expect(splitToolsHubPath()).toBe('/en/split/tools')
        expect(splitCalculatorPath('rent-split-calculator')).toBe('/en/split/tools/rent-split-calculator')
    })

    it('reads a guide locale back out of a public path, and refuses anything else', () => {
        expect(splitGuideLocale('/guides/synthetic-guide')).toBe('en')
        expect(splitGuideLocale('/es-419/guides/synthetic-guide')).toBe('es-419')
        expect(splitGuideLocale('/pt-br/guides/synthetic-guide')).toBe('pt-br')
        expect(splitGuideLocale('/fr/guides/synthetic-guide')).toBeNull()
        expect(splitGuideLocale('/en/guides/synthetic-guide')).toBeNull()
        expect(splitGuideLocale('/guides/Unknown')).toBeNull()
        expect(splitGuideLocale('/guides/synthetic-guide/extra')).toBeNull()
        expect(splitGuideLocale('/guides')).toBeNull()
        expect(splitGuideLocale('/split/anything')).toBeNull()
        expect(splitGuideLocale('/splitwise-alternative')).toBeNull()
    })

    it('rejects traversal slugs', () => {
        expect(() => guidePath('en', '../escape')).toThrow(/invalid Split content slug/)
        expect(() => splitCalculatorPath('../escape')).toThrow(/invalid Split calculator slug/)
    })
})
