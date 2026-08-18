import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Calc } from './Calc'

/**
 * The article's real props, so the "server HTML carries the whole answer" assertions are about the
 * page that ships rather than about a fixture nobody reads (src/content/blog/fronting-a-group-trip).
 */
const PROPS = {
    title: 'The damage, live',
    presets: 'Weekend=920|Week=1846|Blowout=3210',
    preset: 'Week',
    currency: 'EUR',
    people: '4',
    eachLabel: 'a head',
    totalLabel: 'Trip total',
    peopleLabel: 'People',
    shareLabel: 'Fair share',
    amountLabel: 'Trip total',
    footLabel: 'IOUs collapsed',
    footValue: '20 → 3',
    note: 'Rounded to the cent. A room runs this continuously as expenses land.',
}

/** React escapes `"` inside an attribute, so a raw `JSON.parse` of rendered HTML throws — the same
 *  un-escape `ChapterFrame.test.tsx` applies before comparing a `style` value. */
const unescape = (html: string) => html.replaceAll('&quot;', '"')

/** Matched against the RAW html — un-escaping first would put real `"` inside the value and end
 *  the match early — then un-escaped once the value is captured. */
const attribute = (html: string, name: string): string | null => {
    const value = html.match(new RegExp(`${name}="([^"]*)"`))?.[1]
    return value === undefined ? null : unescape(value)
}

const textOf = (html: string) =>
    html
        .replace(/<[^>]*>/g, ' ')
        .replace(/&#x27;/g, "'")
        .replace(/&amp;/g, '&')

describe('Calc server render', () => {
    const html = renderToStaticMarkup(<Calc {...PROPS} />)

    it('ships the fully computed default preset — a reader with no JS gets the whole answer', () => {
        expect(html).toContain('€461.50')
        expect(html).toContain('€1,846.00')
        expect(html).toContain('€920.00')
        expect(html).toContain('€3,210.00')
    })

    it('carries every data-calc-* attribute the enhancer reads, at the enhanced size', () => {
        expect(html).toContain('data-calc-block')
        expect(attribute(html, 'data-calc-currency')).toBe('EUR')
        expect(attribute(html, 'data-calc-people')).toBe('4')
        expect(JSON.parse(attribute(html, 'data-calc-presets')!)).toEqual({
            Weekend: 92000,
            Week: 184600,
            Blowout: 321000,
        })
    })

    // The enhancer's other three selectors, pinned to shipping markup rather than to its test
    // stub: renaming any of these in Calc.tsx would kill click-to-recompute with the suite green.
    it('carries the selectors calc-enhancer-dom.ts queries beyond data-calc-*', () => {
        expect(html).toContain('data-calc-each')
        expect([...html.matchAll(/split-calc-chip-amount/g)]).toHaveLength(3)
        for (const row of html.match(/data-calc-row="[a-z]+"[^]*?<\/li>/g) ?? []) {
            expect(row).toContain('tabular-nums')
        }
    })

    /**
     * The headline amount's label is a visually-hidden span INSIDE `.split-calc-result` and BEFORE
     * the `<strong>`. Not an `aria-label` on the `<strong>`: that element maps to a generic role and
     * assistive tech drops the label, which is the bug this replaced. Not inside it either: the
     * enhancer overwrites that node's whole `textContent` on every chip click.
     */
    it('announces the headline amount with the authored label, outside the node the enhancer rewrites', () => {
        expect(html).not.toContain('aria-label')
        expect(html).toContain('<span class="sr-only">Trip total</span><strong data-calc-each')
    })

    it('presses exactly one chip, and it is the authored default', () => {
        expect([...html.matchAll(/aria-pressed="true"/g)]).toHaveLength(1)
        expect(html).toMatch(/data-calc-preset="Week" aria-pressed="true"/)
    })

    it('rows run total, people, share, foot — the order globals.css and the enhancer both rely on', () => {
        expect([...html.matchAll(/data-calc-row="([a-z]+)"/g)].map((match) => match[1])).toEqual([
            'total',
            'people',
            'share',
            'foot',
        ])
    })

    /**
     * The mechanical half of "the visual layer emits no text nodes, and `<Calc>`'s every word
     * arrives as an authored MDX prop" (Invariants #2). Anything the component itself wrote — a `·`
     * between a chip's label and its amount, a hardcoded "each", a stray "of" — fails here.
     */
    it('renders zero words of its own: every token is authored copy or formatted money', () => {
        // A SET of authored tokens, not a substring of the joined props: `authored.includes('to')`
        // is true of almost any prose, so a substring test waves through exactly the short common
        // words a component is most likely to have written itself.
        //
        // Split on `|` and `=` as well as whitespace, because `presets` is one prop carrying its own
        // authored grammar (`Weekend=920|Week=1846`) — the chip labels on screen are its keys, and
        // splitting on spaces alone would leave them unrecognised inside a single long token.
        const authored = new Set(
            Object.values(PROPS)
                .join(' ')
                .split(/[\s|=]+/)
                .filter(Boolean)
        )
        for (const token of textOf(html).split(/\s+/).filter(Boolean)) {
            expect(
                authored.has(token) || /^[\d.,€$÷→-]+$/.test(token),
                `"${token}" is a word Calc.tsx authored — it must arrive as a prop`
            ).toBe(true)
        }
    })
})

describe('Calc input validation', () => {
    it.each([
        ['a preset with no amount', { presets: 'Weekend|Week=1846' }],
        ['a repeated preset label', { presets: 'Weekend=920|Weekend=1846' }],
        ['a non-numeric amount', { presets: 'Weekend=lots' }],
        ['an empty presets string', { presets: '' }],
        ['a headcount that is not a positive integer', { people: '0' }],
        ['a currency outside the catalog', { currency: 'XXZ' }],
    ])('renders an inert block for %s rather than throwing', (_name, override) => {
        const html = renderToStaticMarkup(<Calc {...PROPS} {...override} />)
        expect(html).toContain('The damage, live')
        expect(html).not.toContain('data-calc-block')
        expect(html).not.toContain('data-calc-preset')
    })

    it('falls back to the first preset when the named default is not one of them', () => {
        const html = renderToStaticMarkup(<Calc {...PROPS} preset="Fortnight" />)
        expect(html).toMatch(/data-calc-preset="Weekend" aria-pressed="true"/)
        expect([...html.matchAll(/aria-pressed="true"/g)]).toHaveLength(1)
    })

    it('drops the footnote row when only half of it is authored', () => {
        const html = renderToStaticMarkup(<Calc {...PROPS} footValue={undefined} />)
        expect(html).not.toContain('data-calc-row="foot"')
    })
})
