import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ChapterFrame } from './ChapterFrame'
import { CHAPTER_TOKENS, ink28, type Chapter } from '@/lib/split-content/chapter-tokens'
import { SKIN_TOKENS, skinVars } from '@/lib/split-content/skin'
import { wallpaperDataUri } from '@/lib/split-content/wallpaper'

const CHAPTERS = Object.keys(CHAPTER_TOKENS) as Chapter[]

/**
 * React escapes both `"` (`&quot;`) and `'` (`&#x27;`) inside a rendered `style` attribute, so a
 * raw `toContain` on any token value carrying a quote is a false failure — the single-quoted
 * wallpaper data-URI included. Un-escaping is applied uniformly so the next token to grow a quote
 * does not break this test either. An HTML parser decodes these, so the DOM sees the real string.
 */
const unescaped = (html: string) => html.replaceAll('&quot;', '"').replaceAll('&#x27;', "'")

describe('ChapterFrame', () => {
    it('emits all four chapter CSS custom properties, with values from CHAPTER_TOKENS/ink28, for every chapter', () => {
        for (const chapter of CHAPTERS) {
            const tokens = CHAPTER_TOKENS[chapter]
            const html = renderToStaticMarkup(
                <ChapterFrame chapter={chapter}>
                    <span>content</span>
                </ChapterFrame>
            )
            expect(html, chapter).toContain(`data-chapter="${chapter}"`)
            expect(html, chapter).toContain(`--chapter-wash:${tokens.wash}`)
            expect(html, chapter).toContain(`--chapter-ink:${tokens.ink}`)
            expect(html, chapter).toContain(`--chapter-hairline:${tokens.hairline}`)
            expect(html, chapter).toContain(`--chapter-ink-28:${ink28(chapter)}`)
        }
    })

    it('paints data-skin and every --skin-* var for the sticker skin, in every chapter', () => {
        for (const chapter of CHAPTERS) {
            const html = unescaped(
                renderToStaticMarkup(
                    <ChapterFrame chapter={chapter} skin="sticker" seed={4242}>
                        <span>content</span>
                    </ChapterFrame>
                )
            )
            expect(html, chapter).toContain('data-skin="sticker"')
            for (const [name, value] of Object.entries(skinVars('sticker', 4242, chapter))) {
                expect(html, `${chapter} ${name}`).toContain(`${name}:${value}`)
            }
            expect(html, chapter).toContain(`--skin-ink:${SKIN_TOKENS.sticker.ink}`)
            expect(html, chapter).toContain(`--skin-wall:${wallpaperDataUri(4242, chapter)}`)
        }
    })

    it('emits data-skin="none" by default, and not one --skin- property — the seam is inert, not absent', () => {
        const html = renderToStaticMarkup(
            <ChapterFrame chapter="trips">
                <span>content</span>
            </ChapterFrame>
        )
        expect(html).toContain('data-skin="none"')
        expect(html).not.toContain('--skin-')
    })

    it('emits no text node of its own — only what its children render, skinned or not', () => {
        const inner = (html: string) => html.replace(/^<div[^>]*>/, '').replace(/<\/div>$/, '')

        expect(inner(renderToStaticMarkup(<ChapterFrame chapter="trips">{null}</ChapterFrame>))).toBe('')
        expect(
            inner(
                renderToStaticMarkup(
                    <ChapterFrame chapter="trips" skin="sticker" seed={1}>
                        {null}
                    </ChapterFrame>
                )
            )
        ).toBe('')

        const withChildren = renderToStaticMarkup(
            <ChapterFrame chapter="trips">
                <span>hello</span>
            </ChapterFrame>
        )
        expect(withChildren).toContain('<span>hello</span>')
    })
})
