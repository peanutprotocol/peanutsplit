import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SkinFrame } from './SkinFrame'
import { SKIN_TOKENS, skinVars } from '@/lib/split-content/skin'
import { wallpaperDataUri } from '@/lib/split-content/wallpaper'

/** React escapes `"` and `'` inside a rendered `style` attribute — see ChapterFrame.test.tsx. */
const unescaped = (html: string) => html.replaceAll('&quot;', '"').replaceAll('&#x27;', "'")

describe('SkinFrame', () => {
    it('paints data-skin and every --skin-* var, with values from SKIN_TOKENS/wallpaperDataUri', () => {
        const html = unescaped(
            renderToStaticMarkup(
                <SkinFrame skin="sticker" seed={4242} chapter="trips">
                    <span>content</span>
                </SkinFrame>
            )
        )

        expect(html).toContain('data-skin="sticker"')
        for (const [name, value] of Object.entries(skinVars('sticker', 4242, 'trips'))) {
            expect(html, name).toContain(`${name}:${value}`)
        }
        expect(html).toContain(`--skin-ink:${SKIN_TOKENS.sticker.ink}`)
        expect(html).toContain(`--skin-wall:${wallpaperDataUri(4242, 'trips')}`)
    })

    it('emits data-skin="none" and not one --skin- property when unskinned — inert, not absent', () => {
        const html = renderToStaticMarkup(
            <SkinFrame skin="none" seed={1} chapter="home">
                <span>content</span>
            </SkinFrame>
        )
        expect(html).toContain('data-skin="none"')
        expect(html).not.toContain('--skin-')
    })

    it('passes className through — the tool page needs the frame to grow, so the footer stays pinned', () => {
        const html = renderToStaticMarkup(
            <SkinFrame skin="sticker" seed={1} chapter="trips" className="flex flex-1 flex-col">
                <span>content</span>
            </SkinFrame>
        )
        expect(html).toContain('class="flex flex-1 flex-col"')
    })

    it('emits no chapter attribute or var — the chapter is a doodle pool here, not a register', () => {
        const html = renderToStaticMarkup(
            <SkinFrame skin="sticker" seed={1} chapter="trips">
                <span>content</span>
            </SkinFrame>
        )
        expect(html).not.toContain('data-chapter')
        expect(html).not.toContain('--chapter-')
    })

    it('emits no text node of its own — only what its children render, skinned or not', () => {
        const inner = (html: string) => html.replace(/^<div[^>]*>/, '').replace(/<\/div>$/, '')

        expect(
            inner(
                renderToStaticMarkup(
                    <SkinFrame skin="sticker" seed={1} chapter="trips">
                        {null}
                    </SkinFrame>
                )
            )
        ).toBe('')
        expect(
            inner(
                renderToStaticMarkup(
                    <SkinFrame skin="none" seed={1} chapter="trips">
                        {null}
                    </SkinFrame>
                )
            )
        ).toBe('')
    })
})
