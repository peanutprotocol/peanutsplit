import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The skin wrap on the template shell, read as source — the same idiom `ToolPage.test.tsx`
 * documents, and for the same reason: this is an async Server Component whose descendants are
 * client components, and `react-dom/server`'s synchronous renderer cannot await one. The DOM proof
 * lives in `SkinFrame.test.tsx` and in `e2e/content-skin.spec.ts`.
 *
 * This shipped unwrapped on 24 Aug and rendered flat: every `split-*` class the page already
 * carried is scoped `[data-skin='sticker']` in `globals.css`, so without the frame they were inert
 * markup. That is the regression these assertions exist to hold.
 */
const source = fs.readFileSync(path.join(process.cwd(), 'src/components/templates/TemplatePage.tsx'), 'utf8')

describe('TemplatePage skin wiring', () => {
    it('resolves the skin and the wallpaper pool from the template slug', () => {
        expect(source).toContain('const skin = templateSkin(template.slug)')
        expect(source).toContain('seed={hashSlug(template.slug)}')
        expect(source).toContain('chapter={templateWallpaperChapter(template.slug)}')
    })

    it('lets the frame grow, so the paper ground fills the column instead of hugging its content', () => {
        expect(source).toContain('className="flex flex-1 flex-col"')
    })

    it('keeps the footer a direct child of <main>, outside the wrap — the mt-auto pin', () => {
        expect(source.indexOf('<SiteFooter')).toBeGreaterThan(source.indexOf('</SkinFrame>'))
        expect(source).toMatch(/<SiteFooter showLocaleSwitcher=\{false\} \/>\s*<\/main>/)
    })

    it('leaves the breadcrumbs outside the wrap too', () => {
        expect(source.indexOf('<Breadcrumbs crumbs={crumbs} />')).toBeLessThan(source.indexOf('<SkinFrame'))
    })

    it('renders the unskinned template exactly as before — no wrapper div, no layout change', () => {
        expect(source).toContain("{skin === 'none' ? (")
    })

    /** The one card the page hand-rolls. Without a die-cut hook it stays flat beside the CTA. */
    it('puts the setup panel in the sticker group', () => {
        expect(source).toContain('split-cta-card rounded-sm border border-n-1 bg-white p-5')
    })
})
