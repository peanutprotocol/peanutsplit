import { describe, expect, it } from 'vitest'
import { CANONICAL_APP_ENTRY, CANONICAL_HOST, CANONICAL_ORIGIN, LEGACY_ALIAS_HOST } from './domains'
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

    it('allows local origins but ignores any public build-arg override', () => {
        expect(resolveSiteUrl('http://localhost:3100/path')).toBe('http://localhost:3100')
        expect(resolveSiteUrl('http://127.0.0.1:8777')).toBe('http://127.0.0.1:8777')
        expect(resolveSiteUrl('https://split.peanut.me')).toBe(CANONICAL_ORIGIN)
        expect(resolveSiteUrl('https://example.com')).toBe(CANONICAL_ORIGIN)
        expect(resolveSiteUrl('not a URL')).toBe(CANONICAL_ORIGIN)
    })
})
