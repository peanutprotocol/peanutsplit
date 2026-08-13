import { describe, expect, it } from 'vitest'
import { CANONICAL_APP_ENTRY, CANONICAL_HOST, CANONICAL_ORIGIN, isProductHost, LEGACY_ALIAS_HOST } from './domains'
import { resolveSiteUrl } from './site'

describe('domain constants', () => {
    it('keeps the whole public product on peanutsplit.com', () => {
        const entry = new URL(CANONICAL_APP_ENTRY)
        expect(CANONICAL_HOST).toBe('peanutsplit.com')
        expect(entry.origin).toBe(CANONICAL_ORIGIN)
        expect(entry.pathname).toBe('/app')
        expect(entry.search).toBe('')
        expect(entry.hash).toBe('')
        expect(LEGACY_ALIAS_HOST).toBe('split.peanut.me')
    })

    it('counts the canonical host, the alias, and both www forms as the product', () => {
        for (const host of [
            'peanutsplit.com',
            'www.peanutsplit.com',
            'split.peanut.me',
            'www.split.peanut.me',
            'PEANUTSPLIT.COM',
            'peanutsplit.com:8443',
        ]) {
            expect(isProductHost(host)).toBe(true)
        }
        for (const host of ['peanut.me', 'splitwise.com', 'split.peanut.me.evil.example', 'peanutsplit.com.co', '']) {
            expect(isProductHost(host)).toBe(false)
        }
    })

    /**
     * The fully qualified spelling of the same name. `new URL()` keeps the root dot in `hostname`,
     * so both of these used to walk past the guide prose-link guard and land on the product.
     */
    it('counts the fully qualified form of every product host, literal dot or percent-encoded', () => {
        for (const href of [
            'https://peanutsplit.com./new',
            'https://peanutsplit.com%2e/new',
            'https://www.peanutsplit.com./new',
            'https://www.peanutsplit.com%2e/new',
            'https://split.peanut.me./new',
            'https://split.peanut.me%2e/new',
            'http://peanutsplit.com.:8443/new',
        ]) {
            expect(isProductHost(new URL(href).hostname), href).toBe(true)
        }
        expect(isProductHost('peanutsplit.com')).toBe(true)
        // One root dot is the name; two are not a name at all.
        expect(isProductHost('peanutsplit.com..')).toBe(false)
        expect(isProductHost('.')).toBe(false)
    })

    it('allows local origins but ignores any public build-arg override', () => {
        expect(resolveSiteUrl('http://localhost:3100/path')).toBe('http://localhost:3100')
        expect(resolveSiteUrl('http://127.0.0.1:8777')).toBe('http://127.0.0.1:8777')
        expect(resolveSiteUrl('https://split.peanut.me')).toBe(CANONICAL_ORIGIN)
        expect(resolveSiteUrl('https://example.com')).toBe(CANONICAL_ORIGIN)
        expect(resolveSiteUrl('not a URL')).toBe(CANONICAL_ORIGIN)
    })
})
