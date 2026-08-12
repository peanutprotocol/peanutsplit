import { afterEach, describe, expect, it } from 'vitest'
import {
    appOrigin,
    appUrl,
    contentOrigin,
    contentUrl,
    guidePath,
    guideUrl,
    splitCalculatorPath,
    splitHubPath,
    splitToolsHubPath,
} from './urls'

const priorAppOrigin = process.env.APP_ORIGIN
const priorContentOrigin = process.env.CONTENT_ORIGIN

afterEach(() => {
    if (priorAppOrigin === undefined) delete process.env.APP_ORIGIN
    else process.env.APP_ORIGIN = priorAppOrigin
    if (priorContentOrigin === undefined) delete process.env.CONTENT_ORIGIN
    else process.env.CONTENT_ORIGIN = priorContentOrigin
})

describe('Split app and content URL ownership', () => {
    it('keeps public content and product handoffs on separate locked origins', () => {
        delete process.env.APP_ORIGIN
        delete process.env.CONTENT_ORIGIN

        expect(appOrigin()).toBe('https://split.peanut.me')
        expect(contentOrigin()).toBe('https://peanut.me')
        expect(appUrl('/new?locale=en')).toBe('https://split.peanut.me/new?locale=en')
        expect(guidePath('pt-br', 'synthetic-guide')).toBe('/pt-br/split/guides/synthetic-guide')
        expect(guideUrl('pt-br', 'synthetic-guide')).toBe('https://peanut.me/pt-br/split/guides/synthetic-guide')
        expect(splitHubPath('es-419')).toBe('/es-419/split')
        expect(splitToolsHubPath()).toBe('/en/split/tools')
        expect(splitCalculatorPath('rent-split-calculator')).toBe('/en/split/tools/rent-split-calculator')
    })

    it('accepts exact HTTPS origin overrides without consulting the transport origin', () => {
        process.env.APP_ORIGIN = 'https://app.example'
        process.env.CONTENT_ORIGIN = 'https://content.example'
        process.env.SPLIT_CONTENT_ORIGIN = 'https://renderer.internal'

        expect(appUrl('/new')).toBe('https://app.example/new')
        expect(contentUrl('/en/split/guides/synthetic-guide')).toBe(
            'https://content.example/en/split/guides/synthetic-guide'
        )
        expect(`${appUrl('/new')} ${contentUrl('/')}`).not.toContain('renderer.internal')
        delete process.env.SPLIT_CONTENT_ORIGIN
    })

    it('rejects paths, credentials, insecure origins, protocol-relative paths, and bad slugs', () => {
        for (const value of [
            'http://peanut.me',
            'https://user:pass@peanut.me',
            'https://peanut.me/path',
            'https://peanut.me/?query=1',
        ]) {
            process.env.CONTENT_ORIGIN = value
            expect(() => contentOrigin()).toThrow(/CONTENT_ORIGIN/)
        }

        delete process.env.CONTENT_ORIGIN
        expect(() => contentUrl('//attacker.example')).toThrow(/root-relative/)
        expect(() => guidePath('en', '../escape')).toThrow(/invalid Split content slug/)
        expect(() => splitCalculatorPath('../escape')).toThrow(/invalid Split calculator slug/)
    })
})
