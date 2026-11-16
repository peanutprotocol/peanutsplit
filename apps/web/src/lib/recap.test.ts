import { afterEach, describe, expect, it, vi } from 'vitest'
import { recapImagePath, recapPath } from './recap'

const SLUG = 'ski-trip-kunc-syrup-drum'

afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
})

describe('recap paths', () => {
    it('keeps the web card path relative and unchanged', () => {
        expect(recapImagePath(SLUG)).toBe(`/r/${SLUG}/recap/card`)
        expect(recapPath(SLUG)).toBe(`/r/${SLUG}/recap`)
    })

    it('puts the card on the site origin in the app, whose bundle has no card route', async () => {
        vi.stubEnv('NEXT_PUBLIC_NATIVE_BUILD', '1')
        vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://peanutsplit.com')
        vi.resetModules()
        const native = await import('./recap')

        expect(native.recapImagePath(SLUG)).toBe(`https://peanutsplit.com/r/${SLUG}/recap/card`)
    })
})
