import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
    useLocale: () => 'en',
    useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}))

import { ToolCalculator } from './ToolCalculator'

/**
 * The four hooks the sticker skin paints the calculator through (fun-engine.md Wave 2 / S3).
 *
 * The calculator is a client component, but it is a client component with a full server render —
 * `ToolPage` ships the default answer in the first response — so `renderToStaticMarkup` sees the
 * real DOM, with `next-intl` mocked the way the room's client-component tests mock it. Three of
 * the four hooks are class names with no styling of their own; the fourth, `aria-pressed`, is an
 * a11y fix that stands on its own merits.
 */
const html = renderToStaticMarkup(<ToolCalculator slug="mileage-split-calculator" />)
const presets = html.match(/<button[^>]*data-testid="tool-preset-[^"]*"[^>]*>/g) ?? []

describe('the preset chips', () => {
    it('announce themselves as toggles — one per preset, pressed only where the choice is live', () => {
        expect(presets.length).toBeGreaterThan(1)
        for (const button of presets) expect(button, button).toMatch(/aria-pressed="(true|false)"/)
        expect(presets.filter((button) => button.includes('aria-pressed="true"'))).toHaveLength(1)
    })

    it('presses the chip whose option the fields are actually filled from', () => {
        const pressed = presets.find((button) => button.includes('aria-pressed="true"'))
        expect(pressed).toContain('data-testid="tool-preset-GB"')
    })
})

describe('the result card’s skin hooks', () => {
    it('marks the workings list — the tool inlines its own <ul>, it does not render <Working>', () => {
        expect(html).toMatch(/<ul class="[^"]*split-working[^"]*"/)
    })

    it('marks the per-person rows, which are a <dl> here rather than the article’s <li>', () => {
        expect(html).toMatch(/<dl class="[^"]*split-tool-shares[^"]*"/)
    })

    it('marks the headline amount, the one element the mock’s big result maps onto', () => {
        expect(html).toMatch(/<dd class="[^"]*split-tool-amount[^"]*"/)
    })
})
