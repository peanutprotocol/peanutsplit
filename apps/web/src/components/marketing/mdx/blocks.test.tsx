import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ToolWorking } from '@/tools/types'
import {
    Cast,
    Checklist,
    ChecklistItem,
    CTA,
    FAQ,
    FAQItem,
    Hero,
    Quote,
    RelatedLink,
    RelatedPages,
    Step,
    Steps,
    type ContentRenderContext,
} from './blocks'
import { localizedMdxComponents, mdxComponents } from './components'
import { ShortVersionSlot } from './ShortVersionSlot'
import { Working } from './Working'

/**
 * The `split-*` class hooks the sticker skin keys off (fun-engine.md Wave 2 / S2). They are class
 * names and nothing else — no default styling — so an unskinned page renders exactly as it did
 * before this stage. The last test in this file is what makes that claim checkable.
 */

const faq = { question: 'Should I put the whole trip on one card?', answer: 'Spread the bookings.' }

const hero = (props: Partial<Parameters<typeof Hero>[0]> = {}) =>
    renderToStaticMarkup(
        <Hero
            eyebrow="group trips"
            title="When every booking lands on your card"
            subtitle="The deposit leaves your account in March."
            cta="Start a split"
            ctaHint="Takes ten seconds."
            {...props}
        />
    )

/** The tag whose class list contains `token`, or undefined. */
const tagWith = (html: string, token: string) =>
    [...html.matchAll(/<[a-z0-9]+[^>]*>/gi)].map(([tag]) => tag).find((tag) => classesOf(tag).includes(token))

const classesOf = (tag: string) => (tag.match(/class="([^"]*)"/)?.[1] ?? '').split(/\s+/)

describe('Hero hooks', () => {
    const html = hero()

    it('puts the band hook on the element carrying bg-primary-1', () => {
        const band = tagWith(html, 'split-hero-band')
        expect(band).toBeDefined()
        expect(classesOf(band!)).toContain('bg-primary-1')
    })

    it('marks the h1 and the eyebrow', () => {
        expect(tagWith(html, 'split-page-title')).toMatch(/^<h1/)
        expect(tagWith(html, 'split-hero-eyebrow')).toMatch(/^<span/)
    })

    it("puts split-btn on the hero's CTA link", () => {
        const button = tagWith(html, 'split-btn')
        expect(button).toMatch(/^<a/)
        expect(button).toContain('href="/new?locale=en"')
    })

    /**
     * The reason the button is a hook at all. `Hero` renders `<ShortVersionSlot>` inside its own
     * `<section>`, and that ends in an inline `#questions` anchor mid-sentence — a descendant
     * `a[href]` rule would turn it into a full yellow pill in the middle of a paragraph.
     */
    it('leaves the short-version jump link unhooked', () => {
        const withSlot = hero({ shortVersionFaq: faq })
        const jump = [...withSlot.matchAll(/<a[^>]*>/g)].map(([tag]) => tag).find((tag) => tag.includes('#questions'))
        expect(jump).toBeDefined()
        expect(jump).not.toContain('split-btn')
    })
})

/**
 * SEO loop A plus the locale handoff. Both are link attributes and nothing else — no text node —
 * and the campaign half still needs a context, which is what keeps every `renderArticle` call
 * that passes none reporting as one uncoded page.
 */
describe('the /new link', () => {
    const context: ContentRenderContext = {
        chapter: 'trips',
        seed: 7,
        register: 'default',
        slug: 'fronting-a-group-trip',
        canonical: '/blog/fronting-a-group-trip',
    }

    it("codes the hero's CTA with the page slug", () => {
        expect(hero({ context })).toContain('href="/new?campaign=content-fronting-a-group-trip&amp;locale=en"')
    })

    it('codes the CTA card the same way, from the same slug', () => {
        const html = renderToStaticMarkup(<CTA text="Start a split" title="Open the room" context={context} />)
        expect(html).toContain('href="/new?campaign=content-fronting-a-group-trip&amp;locale=en"')
    })

    /** A6: `/new` reads a cookie, so a Spanish page that stated its language only in its own URL
     *  handed its reader to an English room creator. Every block carries the page's language. */
    it('carries the page language on every block a localized landing can use', () => {
        expect(hero({ context, locale: 'es-419' })).toContain(
            'href="/new?campaign=content-fronting-a-group-trip&amp;locale=es-419"'
        )
        expect(renderToStaticMarkup(<CTA text="Crear un split" locale="es-419" context={context} />)).toContain(
            'locale=es-419'
        )
        expect(
            renderToStaticMarkup(
                <RelatedPages title="Sigue leyendo">
                    <RelatedLink href="/new" locale="pt-br" context={context}>
                        Abra uma sala
                    </RelatedLink>
                </RelatedPages>
            )
        ).toContain('locale=pt-br')
    })

    it('carries the language with no context — an uncoded page still lands in its own language', () => {
        expect(hero({ locale: 'pt-br' })).toContain('href="/new?locale=pt-br"')
        expect(renderToStaticMarkup(<CTA text="Start a split" />)).toContain('href="/new?locale=en"')
    })

    /** An authored href that is not `/new` is a deliberate destination, and an authored `locale`
     *  or `campaign` on `/new` wins over the page's own — `ToolPage` writes its own campaign. */
    it('never touches an href that is not /new, and never overwrites an authored param', () => {
        expect(hero({ context, ctaHref: '/blog' })).toContain('href="/blog"')
        expect(hero({ context, ctaHref: '/new?locale=es-419' })).toContain('locale=es-419')
        expect(hero({ ctaHref: '/new?campaign=content-rent-split-calculator', locale: 'es-419' })).toContain(
            'href="/new?campaign=content-rent-split-calculator&amp;locale=es-419"'
        )
    })

    it('is a link attribute, never a word on the page', () => {
        const html = hero({ context })
        expect(html.replace(/<[^>]*>/g, '')).not.toContain('campaign')
    })
})

describe('the markdown h1 overrides', () => {
    it('carry split-page-title in both maps — two of the four pilot pages author no Hero', () => {
        const Plain = mdxComponents.h1
        const Localized = localizedMdxComponents('en').h1
        expect(renderToStaticMarkup(<Plain>Who pays for the wine</Plain>)).toContain('split-page-title')
        expect(renderToStaticMarkup(<Localized>Who pays for the wine</Localized>)).toContain('split-page-title')
    })
})

describe('block hooks', () => {
    it('marks the CTA card, its title and its link', () => {
        const html = renderToStaticMarkup(<CTA text="Start a split" title="Open the room" body="One link." />)
        expect(tagWith(html, 'split-cta-card')).toMatch(/^<div/)
        expect(tagWith(html, 'split-block-title')).toMatch(/^<h2/)
        expect(tagWith(html, 'split-btn')).toMatch(/^<a/)
    })

    it('marks every block title', () => {
        const steps = renderToStaticMarkup(
            <Steps title="Three things to settle">
                <Step title="Start the room">Paste the link.</Step>
            </Steps>
        )
        const checklist = renderToStaticMarkup(
            <Checklist title="What being paid back looks like">
                <ChecklistItem title="One ledger">March to August.</ChecklistItem>
            </Checklist>
        )
        const questions = renderToStaticMarkup(
            <FAQ>
                <FAQItem question="Q">A</FAQItem>
            </FAQ>
        )
        const related = renderToStaticMarkup(
            <RelatedPages>
                <RelatedLink href="/a">Splitting a trip</RelatedLink>
            </RelatedPages>
        )
        for (const html of [steps, checklist, questions, related])
            expect(tagWith(html, 'split-block-title')).toBeDefined()
    })

    it('marks the FAQ item and the checklist tick', () => {
        expect(
            tagWith(
                renderToStaticMarkup(
                    <FAQ>
                        <FAQItem question="Q">A</FAQItem>
                    </FAQ>
                ),
                'split-faq-item'
            )
        ).toMatch(/^<div/)
        expect(
            tagWith(renderToStaticMarkup(<ChecklistItem title="One ledger">March.</ChecklistItem>), 'split-tick')
        ).toMatch(/^<span/)
    })

    /** The hook is on the inner `<figure>`, never on the column wrapper: a slip painted on the
     *  column is a full-bleed white band. The `<figcaption>` stays a direct child of that figure —
     *  a level deeper it is not a caption at all and the figure loses its accessible name. */
    it("marks the quote's inner figure, inside the column, and the cast's persona art", () => {
        const quote = renderToStaticMarkup(<Quote source="kb.splitwise.com">Four a day.</Quote>)
        expect(tagWith(quote, 'split-quote')).toMatch(/^<figure/)
        expect(classesOf(tagWith(quote, 'split-quote')!)).not.toContain('px-5')
        expect(quote).toMatch(/^<div class="[^"]*px-5[^"]*"><figure class="split-quote">/)
        expect(quote).toMatch(/<\/blockquote><figcaption/)
        expect(tagWith(renderToStaticMarkup(<Cast name="ana" caption="The Lisbon room." />), 'split-cast-art')).toMatch(
            /^<span/
        )
    })

    /** The LIST is the sticker, not each link — its `overflow-hidden` would clip every child's
     *  halo, offset shadow and rotated corners. */
    it('marks the related LIST and leaves its links unhooked', () => {
        const html = renderToStaticMarkup(
            <RelatedPages>
                <RelatedLink href="/a">Splitting a trip</RelatedLink>
            </RelatedPages>
        )
        expect(tagWith(html, 'split-related-list')).toMatch(/^<ul/)
        const link = [...html.matchAll(/<a[^>]*>/g)].map(([tag]) => tag)[0]
        expect(classesOf(link).filter((name) => name.startsWith('split-'))).toEqual([])
    })

    it('marks the working strip and the short-version slip', () => {
        const workings: ToolWorking[] = [{ label: 'Trip total', amountMinor: 184600 }]
        expect(tagWith(renderToStaticMarkup(<Working workings={workings} currency="EUR" />), 'split-working')).toMatch(
            /^<div/
        )
        expect(
            tagWith(renderToStaticMarkup(<ShortVersionSlot faq={faq} locale="en" />), 'split-short-version')
        ).toMatch(/^<p/)
    })
})

/**
 * The hooks are inert: `Hero` carries four of them and is the densest block, and with the hook
 * tokens filtered out of every class list its markup is byte-for-byte what `main` rendered before
 * this stage. Captured from `main` — not from this branch — so it cannot drift into agreement.
 *
 * A blanket `split-*` filter is safe for this block specifically: `Hero` carried no `split-*` class
 * before S2. It would not be safe for `Steps` (`split-steps`) or `Callout` (`split-callout`).
 */
const HERO_ON_MAIN =
    '<section><div class="border-b border-n-1 bg-primary-1"><div class="mx-auto w-full max-w-xl px-5 pb-8 pt-10">' +
    '<span class="inline-flex items-center rounded-sm border border-n-1 bg-white px-3 py-1 text-h9 uppercase tracking-wide text-n-1">group trips</span>' +
    '<h1 class="mt-5 text-h3 leading-tight text-n-1">When every booking lands on your card</h1>' +
    '<p class="mt-4 text-base font-medium leading-6 text-n-1">The deposit leaves your account in March.</p></div></div>' +
    '<div class="mx-auto w-full max-w-xl px-5 pt-6"><a class="btn flex items-center gap-2 transition-all duration-100 ' +
    'active:translate-x-[3px] active:shadow-none w-full btn-primary btn-shadow-primary-4 justify-center text-h6" href="/new?locale=en">Start a split</a>' +
    '<p class="mt-3 text-center text-sm text-grey-1">Takes ten seconds.</p></div></section>'

/** Drops every `split-*` token and re-joins on single spaces, applied to both sides. */
const withoutHooks = (html: string) =>
    html.replace(/ class="([^"]*)"/g, (whole, value: string) => {
        const kept = value.split(/\s+/).filter((name) => name && !name.startsWith('split-'))
        return kept.length === 0 ? '' : ` class="${kept.join(' ')}"`
    })

describe('the hooks are class names and nothing else', () => {
    it('renders main’s markup exactly, once the hook tokens are removed', () => {
        expect(withoutHooks(hero())).toBe(withoutHooks(HERO_ON_MAIN))
    })
})
