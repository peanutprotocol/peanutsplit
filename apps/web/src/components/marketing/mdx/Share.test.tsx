import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ContentRenderContext } from './blocks'
import { Share } from './Share'

/**
 * The article's real props and the real context `content-routes.tsx` builds for it, so the
 * campaign-coded URL asserted below is the one that ships (src/content/blog/who-pays-for-the-wine).
 */
const CONTEXT: ContentRenderContext = {
    chapter: 'table',
    seed: 7,
    register: 'default',
    slug: 'who-pays-for-the-wine',
    canonical: '/blog/who-pays-for-the-wine',
}

const PROPS = {
    title: 'Send this to the group chat',
    body: 'Before the second bottle, ideally. The three sentences are logistics when they arrive with the menus and accusations when they arrive with the bill.',
    buttonLabel: 'Send it round',
    doneLabel: 'Link copied',
}

/** React escapes `&` inside an attribute; nothing else in a share URL needs unescaping. */
const attribute = (html: string, name: string): string | null =>
    html.match(new RegExp(`${name}="([^"]*)"`))?.[1]?.replaceAll('&amp;', '&') ?? null

const textOf = (html: string) =>
    html
        .replace(/<[^>]*>/g, ' ')
        .replace(/&#x27;/g, "'")
        .replace(/&amp;/g, '&')

describe('Share server render', () => {
    const html = renderToStaticMarkup(<Share {...PROPS} context={CONTEXT} />)

    it('ships every authored word as server HTML — a reader with no JS still sees the whole block', () => {
        expect(html).toContain('Send this to the group chat')
        expect(html).toContain('Before the second bottle, ideally.')
        expect(html).toContain('Send it round')
    })

    it('carries the data-share-* attributes the enhancer reads, at the enhanced size', () => {
        expect(html).toContain('data-share-block')
        expect(html).toContain('data-share-button')
        expect(attribute(html, 'data-share-done')).toBe('Link copied')
    })

    /** The whole of loop B in one assertion: the page's own canonical, absolute, campaign-coded by
     *  slug. A locale-keyed or origin-relative spelling here is a share loop reporting to nowhere. */
    it('points at the article canonical with the slug-keyed share campaign', () => {
        expect(attribute(html, 'data-share-url')).toBe(
            'https://peanutsplit.com/blog/who-pays-for-the-wine?campaign=share-who-pays-for-the-wine'
        )
    })

    /**
     * The mechanical half of "the visual layer emits no text nodes" (Invariants #2) — the same gate
     * `Calc.test.tsx` holds. Anything `Share.tsx` itself wrote, down to a stray separator, fails here.
     */
    it('renders zero words of its own: every token is authored copy', () => {
        // A SET, not a substring of the joined props: `includes('to')` is true of almost any prose,
        // so a substring test waves through the short common words most likely to be self-authored.
        const authored = new Set(Object.values(PROPS).join(' ').split(/\s+/).filter(Boolean))
        for (const token of textOf(html).split(/\s+/).filter(Boolean)) {
            expect(authored.has(token), `"${token}" is a word Share.tsx authored — it must arrive as a prop`).toBe(true)
        }
    })

    it('is a pure server component — no interactive markup beyond the button the enhancer wires', () => {
        expect(html).toContain('<button')
        expect(html).not.toContain('onclick')
    })
})

describe('Share without what it needs', () => {
    it('renders nothing at all with no context — a guide compile must not invent a URL', () => {
        expect(renderToStaticMarkup(<Share {...PROPS} />)).toBe('')
    })

    it.each([
        ['title', { title: '' }],
        ['buttonLabel', { buttonLabel: '' }],
        ['doneLabel', { doneLabel: '' }],
    ])('renders nothing rather than throwing when %s is missing', (_name, override) => {
        expect(renderToStaticMarkup(<Share {...PROPS} {...override} context={CONTEXT} />)).toBe('')
    })

    it('drops the body paragraph when the article authored none, and keeps the rest', () => {
        const html = renderToStaticMarkup(<Share {...PROPS} body={undefined} context={CONTEXT} />)
        expect(html).toContain('data-share-block')
        expect(html).not.toContain('Before the second bottle')
    })
})
