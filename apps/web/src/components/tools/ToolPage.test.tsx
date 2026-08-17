import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The skin wrap on the tool shell, read as source.
 *
 * `ToolPage` is an async Server Component whose descendants (`ToolCalculator` and the MDX blocks)
 * are client components, and `react-dom/server`'s synchronous renderer — this repo's only renderer
 * in `node` vitest — cannot await a nested async component. So this uses the same idiom
 * `ArticleLayout.test.tsx` documents. The DOM proof lives in `SkinFrame.test.tsx` and in
 * `e2e/content-skin.spec.ts`.
 *
 * The assertion that earns its keep is the footer's position. `SiteFooter` pins to the bottom with
 * `mt-auto`, which only works while it is a direct flex child of `<main>`'s column: wrap it in the
 * frame and on a short page the footer floats mid-viewport over bare background.
 * `e2e/ux-foundations.spec.ts` drives this page but asserts only the focus ring's `outlineColor`,
 * so nothing else in the suite would catch it.
 */
const source = fs.readFileSync(path.join(process.cwd(), 'src/components/tools/ToolPage.tsx'), 'utf8')

describe('ToolPage skin wiring', () => {
    it('resolves the skin and the wallpaper pool from the tool slug', () => {
        expect(source).toContain('const skin = toolSkin(tool.slug)')
        expect(source).toContain('seed={hashSlug(tool.slug)}')
        expect(source).toContain('chapter={toolWallpaperChapter(tool.slug)}')
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

    it('renders the unskinned tool exactly as before — no wrapper div, no layout change', () => {
        expect(source).toContain("{skin === 'none' ? (")
    })
})
