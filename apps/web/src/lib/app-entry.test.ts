import { describe, expect, it } from 'vitest'
import { shouldRedirectStandaloneLanding } from './app-entry'

describe('installed app entry', () => {
    it('moves only a standalone visit to the marketing root into the app', () => {
        expect(shouldRedirectStandaloneLanding('/', true, false)).toBe(true)
        expect(shouldRedirectStandaloneLanding('/', false, true)).toBe(true)
        expect(shouldRedirectStandaloneLanding('/', false, false)).toBe(false)
        expect(shouldRedirectStandaloneLanding('/app', true, true)).toBe(false)
        expect(shouldRedirectStandaloneLanding('/r/weekend-abc-def-ghi', true, true)).toBe(false)
    })
})
