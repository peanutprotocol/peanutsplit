import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * `AnimatedMoney` can't be rendered here — it needs `useLocale()` from a next-intl provider and
 * NumberFlow mounts a custom element into a shadow root, neither of which this suite's `node`
 * environment provides (no jsdom, no testing-library, and adding one is out of scope for an a11y
 * fix). So this asserts on the source shape instead, the same way `ReactionBar.test.ts` does for
 * its own can't-render case: it guards the two things that actually fix the bug — a screen
 * reader spelling a balance out digit by digit, and NumberFlow's empty light-DOM `textContent` —
 * from quietly regressing.
 */
const source = readFileSync(new URL('./Money.tsx', import.meta.url), 'utf8')
const bodyStart = source.indexOf('export function AnimatedMoney')
const body = source.slice(bodyStart, source.indexOf('\n}\n', bodyStart))

describe('AnimatedMoney accessibility', () => {
    it('marks the animated NumberFlow node decorative', () => {
        expect(bodyStart).toBeGreaterThan(-1)
        // Order matters here in one direction only: `aria-hidden` has to land on the element AT
        // would otherwise read digit-by-digit, not on the sr-only text meant to replace it.
        const numberFlowStart = body.indexOf('<NumberFlow')
        const numberFlowEnd = body.indexOf('/>', numberFlowStart)
        expect(numberFlowStart).toBeGreaterThan(-1)
        expect(body.slice(numberFlowStart, numberFlowEnd)).toContain('aria-hidden="true"')
    })

    it('gives AT a real sr-only string instead of the shadow-root digits', () => {
        expect(body).toMatch(/className="sr-only"/)
    })

    it('formats that string through the same helper <Money/> uses, not a hand-rolled one', () => {
        // Reusing `formatMoney` is what makes the animated and static amounts unable to
        // disagree — a hand-rolled `${symbol}${amount}` here would drift the moment a new
        // currency's symbol placement or grouping differs from the static path's.
        expect(body).toContain('formatMoney(signedMinor, currency, catalog, locale)')
    })

    it('feeds NumberFlow and the sr-only label the same signed minor units', () => {
        // Both the visible animation and the accessible text derive `signedMinor` the identical
        // way <Money/> does (`absolute && minor.startsWith('-') ? minor.slice(1) : minor`), so
        // a balance and its accessible name can never point at different signs or magnitudes.
        expect(body).toContain("const signedMinor = absolute && minor.startsWith('-') ? minor.slice(1) : minor")
        expect(body).toContain('minorToNumber(signedMinor, info.decimals)')
    })

    it('imports formatMoney rather than reimplementing it', () => {
        const importLine = source.slice(0, source.indexOf('\n', source.indexOf("from '@/lib/money'")))
        expect(importLine).toContain('formatMoney')
    })
})
