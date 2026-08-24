import { describe, expect, it } from 'vitest'
import { CANONICAL_APP_ENTRY, CANONICAL_HOST, CANONICAL_ORIGIN, isProductHost, LEGACY_ALIAS_HOST } from './domains'
import { parseRequestAuthority, productUrl, requestAuthorityMatchesOrigin, resolveSiteUrl } from './site'

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

    it('accepts an exact HTTPS public origin and loopback-only HTTP', () => {
        expect(resolveSiteUrl('https://split.example.org')).toBe('https://split.example.org')
        expect(resolveSiteUrl('https://split.example.org:8443/')).toBe('https://split.example.org:8443')
        expect(resolveSiteUrl('http://127.0.0.1:8777')).toBe('http://127.0.0.1:8777')
        expect(resolveSiteUrl('https://localhost:3100')).toBe('https://localhost:3100')
    })

    it.each([
        'http://split.example.org',
        'https://split.example.org/path',
        'https://user:password@split.example.org',
        'https://split.example.org?from=config',
        'https://split.example.org#fragment',
        'https://split.example.org.',
        'https://bad_host.example',
        'http://localhost:3100/path',
        ' https://split.example.org',
        'not a URL',
    ])('rejects non-origin or unsafe public configuration %j', (value) => {
        expect(resolveSiteUrl(value)).toBe(CANONICAL_ORIGIN)
    })

    it('compares a strict request authority with the configured origin and its effective port', () => {
        expect(parseRequestAuthority('SPLIT.EXAMPLE.ORG:8443')).toEqual({ host: 'split.example.org', port: 8443 })
        expect(requestAuthorityMatchesOrigin('SPLIT.EXAMPLE.ORG:8443', 'https://split.example.org:8443')).toBe(true)
        expect(requestAuthorityMatchesOrigin('split.example.org', 'https://split.example.org')).toBe(true)
        expect(requestAuthorityMatchesOrigin('split.example.org:443', 'https://split.example.org')).toBe(true)
        expect(requestAuthorityMatchesOrigin('split.example.org:80', 'https://split.example.org')).toBe(false)
        expect(requestAuthorityMatchesOrigin('split.example.org, attacker.example', 'https://split.example.org')).toBe(
            false
        )
    })

    it('builds product links from the configured origin rather than a request host', () => {
        expect(productUrl('/r/trip-R7LxQ3TBJV_uQ2PMhzc8rw', 'https://split.example.org')).toBe(
            'https://split.example.org/r/trip-R7LxQ3TBJV_uQ2PMhzc8rw'
        )
    })
})
