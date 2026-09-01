import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The loading fallback's delay-reveal, read as source — the same idiom as
 * ToolPage.test.tsx (next-intl hooks keep the component out of the sync
 * renderer) and chapter-tokens.test.ts (paint-only CSS is verified by text
 * assertion).
 *
 * The coupling under test: `animate-route-reveal` starts the wrapper at
 * `opacity: 0`, and both reduced-motion policies strip animations with
 * `animation: none !important`. Only the `data-motion-surface` opt-in
 * (`opacity: 1 !important`) brings the screen back for those users. Lose any
 * side of that triangle and either fast loads flash the interstitial again, or
 * reduced-motion users wait on a screen that never paints.
 */
const component = readFileSync(path.join(process.cwd(), 'src/app/(product-shell)/r/[slug]/loading.tsx'), 'utf8')
const css = readFileSync(path.join(process.cwd(), 'src/styles/globals.css'), 'utf8')

describe('room loading fallback delay-reveal', () => {
    it('pairs the reveal animation with the reduced-motion opt-in on one element', () => {
        expect(component).toMatch(/className="animate-route-reveal" data-motion-surface/)
    })

    it('starts invisible and only commits to paint after a delay', () => {
        const rule = css.match(/\.animate-route-reveal\s*\{[^}]*\}/)?.[0]
        expect(rule).toBeDefined()
        expect(rule).toContain('opacity: 0')
        expect(rule).toMatch(/animation: ps-route-reveal \d+ms ease-out \d+ms forwards/)
    })

    it('keeps the reduced-motion escape hatch that forces motion surfaces visible', () => {
        // Both the in-app toggle and the OS media query must retain it.
        const occurrences = css.match(/\[data-motion-surface\]\s*\{[^}]*opacity: 1 !important/g) ?? []
        expect(occurrences.length).toBeGreaterThanOrEqual(2)
    })
})
