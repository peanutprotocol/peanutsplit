import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
    useLocale: () => 'en',
    useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}))

import { ToolCalculator } from './ToolCalculator'

/**
 * The hooks the sticker skin paints the calculator through (fun-engine.md Wave 2 / S3).
 *
 * The calculator is a client component, but it is a client component with a full server render —
 * `ToolPage` ships the default answer in the first response — so `renderToStaticMarkup` sees the
 * real DOM, with `next-intl` mocked the way the room's client-component tests mock it. All of them
 * are class names with no styling of their own bar `aria-pressed`, which is an a11y fix that stands
 * on its own merits.
 *
 * They exist because the stylesheet may not select on `data-testid` — the class audit fails on it —
 * so every calculator surface the skin touches has to own a paint hook the skin can name.
 */
const html = renderToStaticMarkup(<ToolCalculator slug="mileage-split-calculator" />)
const presets = html.match(/<button[^>]*data-testid="tool-preset-[^"]*"[^>]*>/g) ?? []

/** The tag whose class list contains `token`, or undefined — blocks.test.tsx's idiom. */
const tagWith = (token: string) =>
    [...html.matchAll(/<[a-z0-9]+[^>]*>/gi)].map(([tag]) => tag).find((tag) => classesOf(tag).includes(token))

const classesOf = (tag: string) => (tag.match(/class="([^"]*)"/)?.[1] ?? '').split(/\s+/)

const tagsWith = (token: string) =>
    [...html.matchAll(/<[a-z0-9]+[^>]*>/gi)].map(([tag]) => tag).filter((tag) => classesOf(tag).includes(token))

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

    it('carries the paint hook on every chip, so the on-state is the aria state and nothing else', () => {
        expect(tagsWith('split-tool-preset')).toHaveLength(presets.length)
        for (const chip of tagsWith('split-tool-preset')) expect(chip, chip).toMatch(/^<button/)
    })
})

describe('the input hooks', () => {
    it('marks the text and number fields', () => {
        const fields = tagsWith('split-tool-field')
        expect(fields.length).toBeGreaterThan(1)
        for (const field of fields) expect(field, field).toMatch(/^<input/)
    })

    /** The skin's 2px border, white fill and 10px radius destroy a native range track, and a
     *  repainted `sr-only` checkbox is invisible either way — so neither carries the hook. */
    it('leaves the range and the sr-only checkbox unhooked', () => {
        for (const field of tagsWith('split-tool-field')) {
            expect(field, field).not.toMatch(/type="(range|checkbox)"/)
        }
    })

    it('marks the currency slot rather than the picker inside it', () => {
        expect(tagWith('split-tool-currency')).toMatch(/^<div/)
    })

    it('marks the builder fold’s summary row', () => {
        expect(tagWith('split-tool-builder-summary')).toMatch(/^<button/)
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

    /** The die-cut card and the copy pill — the two surfaces the skin used to reach by test id. */
    it('marks the result card and its copy button', () => {
        expect(tagWith('split-tool-result')).toMatch(/^<div/)
        expect(tagWith('split-tool-copy')).toMatch(/^<button/)
    })
})
