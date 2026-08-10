import { describe, expect, it } from 'vitest'
import { CANONICAL_APP_ENTRY, CANONICAL_APP_ORIGIN } from './domains'

describe('canonical app entry', () => {
    it('targets the operational /app route rather than the marketing-routed origin root', () => {
        const entry = new URL(CANONICAL_APP_ENTRY)
        expect(entry.origin).toBe(CANONICAL_APP_ORIGIN)
        expect(entry.pathname).toBe('/app')
        expect(entry.search).toBe('')
        expect(entry.hash).toBe('')
    })
})
