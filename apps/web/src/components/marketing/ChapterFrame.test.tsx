import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ChapterFrame } from './ChapterFrame'
import { CHAPTER_TOKENS, ink28, type Chapter } from '@/lib/split-content/chapter-tokens'

const CHAPTERS = Object.keys(CHAPTER_TOKENS) as Chapter[]

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

    it('emits no text node of its own — only what its children render', () => {
        const html = renderToStaticMarkup(<ChapterFrame chapter="trips">{null}</ChapterFrame>)
        const inner = html.replace(/^<div[^>]*>/, '').replace(/<\/div>$/, '')
        expect(inner).toBe('')

        const withChildren = renderToStaticMarkup(
            <ChapterFrame chapter="trips">
                <span>hello</span>
            </ChapterFrame>
        )
        expect(withChildren).toContain('<span>hello</span>')
    })
})
