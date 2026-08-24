import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
    COLLECTIONS,
    ROOT_COLLECTIONS,
    basePathFor,
    getAuthoredDoc,
    getDoc,
    hrefFor,
    isDocAvailable,
    listAllAuthoredTranslations,
    listAllDocs,
    listAllTranslations,
    listDocs,
    listSlugs,
    localesForSlug,
    type Collection,
} from './content'
import { CAST_NAMES, isCastName } from './cast'
import { findDroppedDiacritics } from './diacritics'
import { STATIC_PAGES, staticPageSlugs } from '@/data/static-pages'
import { SPLIT_CONTENT_INDEX_RELEASED_PATHS } from './split-content/index-release'
import { DEFAULT_LOCALE, HREFLANG, INDEXED_LOCALES, LOCALES, type IndexedLocale } from '@/i18n/locales'
import { hreflangAlternates, localizedPath } from '@/i18n/paths'
import sitemap from '@/app/sitemap'
import { absoluteUrl, pageTitle } from './seo'
import { TEMPLATES, templatePath } from '@/templates/registry'
import { TOOLS, getTool, toolLocales, toolPath, toolsIn } from '@/tools/registry'
import { MILEAGE_RATES } from '@/tools/mileage-rates'
import { mileageSplitCalculator } from '@/tools/mileage-split-calculator'
import { MILEAGE_COUNTRY_PAGES, mileageCountryLinks } from '@/tools/mileage-split-calculator.countries'
import { getToolCountry, toolMetadata } from './tool-routes'
import type { Tool, ToolField } from '@/tools/types'

/**
 * These run against the real src/content/ tree rather than fixtures. That is deliberate: the
 * failure mode this engine actually has is a bad article, not a bad parser — a missing date, a
 * slug that collides with a hand-built route, an internal link to a page that was renamed. A
 * fixture directory would pass while the site 404s.
 */

/**
 * Every language of every article, not just English. The length limits, the link check and the
 * FAQ/schema agreement are properties of a published page — a translation is a published page,
 * and checking only `en` is how a 70-character Spanish title ships unnoticed.
 */
/** Drafts included: an unreviewed draft is held to every rule below, it is only kept off routes. */
const ALL = listAllAuthoredTranslations()

/** Lowercased, accent-folded words — the unit the head-term check compares. */
const words = (text: string): string[] =>
    text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean)

/** Every word of `term` is the start of some word in `text` — "alternative" covers "alternatives". */
const carriesTerm = (text: string, term: string): boolean => {
    const have = words(text)
    return words(term).every((needle) => have.some((word) => word.startsWith(needle)))
}

/** The headings a page renders: the `<Hero title>` (its H1) and every `#`–`###` line of the body. */
function renderedHeadings(doc: (typeof ALL)[number]): string[] {
    const hero = doc.body.match(/<Hero\b[\s\S]*?title="([^"]*)"[\s\S]*?\/?>/)
    const markdown = [...doc.body.matchAll(/^#{1,3} (.*)$/gm)].map((match) => match[1])
    return [...(hero ? [hero[1]] : []), ...markdown]
}

describe('content tree', () => {
    /**
     * The loader swallows a broken file on purpose — a half-written article must not be able to
     * fail `next build`. The cost is that a translation with one bad line of YAML silently does
     * not publish, which is exactly how three of these shipped unparsed. This turns that silence
     * into a red test: every .md on disk must survive the loader.
     *
     * (The usual culprit is `: ` inside an unquoted frontmatter scalar — YAML reads it as a
     * mapping. Quote the string.)
     */
    it('parses every markdown file that exists', () => {
        const root = path.join(process.cwd(), 'src/content')
        for (const collection of COLLECTIONS) {
            const dir = path.join(root, collection)
            // Directories only. A collection may hold a loose file (a README holding the directory
            // open before its first page lands), and the loader ignores those — so must this.
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                if (!entry.isDirectory()) continue
                for (const file of fs.readdirSync(path.join(dir, entry.name))) {
                    const locale = file.replace(/\.md$/, '')
                    expect(
                        INDEXED_LOCALES,
                        `${collection}/${entry.name}/${file} has no indexed locale route`
                    ).toContain(locale)
                    expect(
                        getAuthoredDoc(collection, entry.name, locale as (typeof INDEXED_LOCALES)[number]),
                        `${collection}/${entry.name}/${file} exists but did not parse`
                    ).not.toBeNull()
                }
            }
        }
    })

    /** A routed collection with no pages is a dead route. */
    it('publishes at least one doc per collection', () => {
        for (const collection of COLLECTIONS) {
            expect(listDocs(collection).length, `${collection} is empty`).toBeGreaterThan(0)
        }
    })

    /**
     * Both root-level collections are served by one `[page]` segment, so a slug in both of them is
     * two pages fighting over one URL. `generateStaticParams` would emit it twice and the route
     * would serve whichever collection is listed first — silently, and not necessarily the one the
     * author meant.
     */
    it('never gives two root-level collections the same slug', () => {
        for (const locale of INDEXED_LOCALES) {
            const slugs = ROOT_COLLECTIONS.flatMap((collection) => listSlugs(collection, locale))
            expect(new Set(slugs).size, `duplicate root slug in ${locale}`).toBe(slugs.length)
        }
    })

    /**
     * A capture page exists because a query exists. Without `intent` there is nothing to check the
     * page against later, and nothing stopping the next one from being written for a query nobody
     * types.
     */
    it('gives every capture page the query it answers', () => {
        for (const doc of ALL.filter((doc) => doc.collection === 'capture')) {
            expect(doc.frontmatter.intent, `capture/${doc.slug}/${doc.locale}.md has no intent`).toBeTruthy()
        }
    })

    /**
     * The head term has to be in the title and in a heading. The page voice keeps the headings
     * human — "Why people go looking", "The difference, plainly" — which is right for Google and
     * invisible to Bing, whose ranking leans on an exact heading match and which feeds DuckDuckGo,
     * Ecosia, Copilot and ChatGPT search. A six-month-old AdSense site with no links outranked
     * this engine's Splitwise page there on a single "## Best Free Splitwise Alternatives"
     * heading (2026-08-22). One heading per page carrying the term is the whole cost.
     *
     * Word-prefix match after folding case and accents, so "alternativa splitwise" is satisfied
     * by "Alternativa a Splitwise" and "expense" by "expenses". The H1 is the stronger slot but
     * comparison H1s name the wedge on purpose (§11.3), so any rendered heading counts.
     */
    it('puts every capture and comparison head term in the title and in a heading', () => {
        for (const doc of ALL) {
            if (!['capture', 'comparison'].includes(doc.frontmatter.type ?? '')) continue
            const where = `${doc.collection}/${doc.slug}/${doc.locale}.md`
            const term = doc.frontmatter.headTerm
            expect(term, `${where} has no headTerm`).toBeTruthy()
            const headings = renderedHeadings(doc)
            expect(headings.length, `${where} renders no heading`).toBeGreaterThan(0)
            expect(carriesTerm(doc.frontmatter.title, term!), `${where}: title lacks "${term}"`).toBe(true)
            expect(
                headings.some((heading) => carriesTerm(heading, term!)),
                `${where}: no heading carries "${term}" — headings: ${headings.join(' | ')}`
            ).toBe(true)
        }
    })

    it('gives every doc a title, a description and an ISO date', () => {
        for (const doc of ALL) {
            expect(doc.frontmatter.title, doc.slug).toBeTruthy()
            expect(doc.frontmatter.description, doc.slug).toBeTruthy()
            expect(doc.frontmatter.date, `${doc.slug} date`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        }
    })

    /**
     * Past these lengths the tail is truncated in the result, so the last clause is written for
     * nobody. The title budget has to include the ` | Peanut Split` suffix `pageTitle()` adds —
     * measuring the frontmatter alone is how three of four articles shipped over the limit.
     */
    it('keeps titles and descriptions inside what Google renders', () => {
        for (const doc of ALL) {
            expect(pageTitle(doc.frontmatter.title).length, `${doc.slug} title too long`).toBeLessThanOrEqual(60)
            expect(doc.frontmatter.description.length, `${doc.slug} description too long`).toBeLessThanOrEqual(160)
        }
    })

    it('reserves every root path Next already owns', () => {
        // The guard is only worth having if it knows the real routes — deriving it from the
        // marketing pages alone left /new, /blog and /api free to be shadowed by an article.
        for (const segment of ['new', 'blog', 'r', 'api', 'healthcheck', 'readiness']) {
            expect(staticPageSlugs.has(segment), `${segment} is not reserved`).toBe(true)
        }
        for (const collection of ROOT_COLLECTIONS) {
            for (const slug of listSlugs(collection)) {
                expect(staticPageSlugs.has(slug), `${slug} collides with a static route`).toBe(false)
            }
        }
    })

    it('derives hrefs that match the routes', () => {
        expect(hrefFor('blog', 'foo')).toBe('/blog/foo')
        expect(hrefFor('alternatives', 'foo-alternative')).toBe('/foo-alternative')
        expect(hrefFor('capture', 'split-bill-no-signup')).toBe('/split-bill-no-signup')
        expect(hrefFor('capture', 'split-bill-no-signup', 'es-419')).toBe('/es-419/split-bill-no-signup')
        // The canonical and the hreflang base are the same derivation as the href, minus the prefix.
        expect(basePathFor('blog', 'foo')).toBe('/blog/foo')
        expect(basePathFor('capture', 'foo')).toBe('/foo')
    })

    it('returns null for an unknown slug', () => {
        expect(getDoc('blog', 'no-such-article')).toBeNull()
    })

    it('refuses a slug that would walk out of the content tree', () => {
        expect(getDoc('blog', '../alternatives/tricount-alternative')).toBeNull()
        expect(getDoc('blog', 'Not-A-Slug')).toBeNull()
    })

    it('lists every doc exactly once in the hub', () => {
        const hrefs = listAllDocs().map((doc) => doc.href)
        expect(new Set(hrefs).size).toBe(hrefs.length)
    })

    it('keeps v2-only guides valid but undiscoverable in v1', () => {
        const prior = process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED
        try {
            delete process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED
            expect(getDoc('blog', 'scan-a-receipt-to-split-a-bill')).not.toBeNull()
            expect(listSlugs('blog')).not.toContain('scan-a-receipt-to-split-a-bill')

            process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED = '1'
            expect(listSlugs('blog')).toContain('scan-a-receipt-to-split-a-bill')
        } finally {
            if (prior === undefined) delete process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED
            else process.env.NEXT_PUBLIC_SPLIT_V2_ENABLED = prior
        }
    })

    it('keeps the canonical comparison routable while gating its public-source upgrade', () => {
        const prior = process.env.NEXT_PUBLIC_FOSS_RELEASED
        try {
            delete process.env.NEXT_PUBLIC_FOSS_RELEASED
            const safe = getAuthoredDoc('alternatives', 'splitwise-alternative')
            expect(safe).not.toBeNull()
            expect(isDocAvailable(safe!)).toBe(true)
            expect(listSlugs('alternatives')).toContain('splitwise-alternative')
            expect(safe!.frontmatter.title).toBe('Splitwise alternative, free with no signup')
            expect(safe!.frontmatter.description).not.toMatch(/AGPL|open[- ]source|self[- ]host/i)
            expect(safe!.frontmatter.faqs?.map((faq) => faq.question)).toEqual([
                'Do I need an account?',
                'Is there a limit on how many expenses we can add?',
                'Can I import my Splitwise history?',
            ])

            process.env.NEXT_PUBLIC_FOSS_RELEASED = '1'
            const released = getAuthoredDoc('alternatives', 'splitwise-alternative')
            expect(isDocAvailable(released!)).toBe(true)
            expect(listSlugs('alternatives')).toContain('splitwise-alternative')
            expect(released!.frontmatter.title).toBe('Free and open-source Splitwise alternative')
            expect(released!.frontmatter.description).toContain('AGPL')
            expect(released!.frontmatter.faqs?.map((faq) => faq.question).slice(0, 3)).toEqual([
                'Is Split FOSS or only free to use?',
                'Can I self-host Split?',
                'Who maintains Split, and why can another product appear?',
            ])
        } finally {
            if (prior === undefined) delete process.env.NEXT_PUBLIC_FOSS_RELEASED
            else process.env.NEXT_PUBLIC_FOSS_RELEASED = prior
        }
    })

    it('still withholds a whole-page public-source candidate without a complete release receipt', () => {
        const candidate = getAuthoredDoc('alternatives', 'splitwise-alternative')!
        const wholePageCandidate = {
            ...candidate,
            frontmatter: { ...candidate.frontmatter, publicSourceUpgrade: false },
        }
        const prior = process.env.NEXT_PUBLIC_FOSS_RELEASED
        try {
            delete process.env.NEXT_PUBLIC_FOSS_RELEASED
            expect(isDocAvailable(wholePageCandidate)).toBe(false)

            process.env.NEXT_PUBLIC_FOSS_RELEASED = '1'
            expect(isDocAvailable(wholePageCandidate)).toBe(true)
        } finally {
            if (prior === undefined) delete process.env.NEXT_PUBLIC_FOSS_RELEASED
            else process.env.NEXT_PUBLIC_FOSS_RELEASED = prior
        }
    })

    it('requires the public-source claim and release gate to travel together', () => {
        const publicSourceLanguage =
            /\b(?:AGPL(?:-3\.0(?:-or-later)?)?|FOSS|open[- ]source|self[- ]host(?:ed|ing|able)?)\b|código abierto|código aberto|software libre|software livre/iu
        for (const doc of ALL) {
            const claimsPublicSource = doc.frontmatter.claims?.includes('public-source-and-self-hosting') ?? false
            const usesPublicSourceLanguage = publicSourceLanguage.test(
                [
                    doc.frontmatter.title,
                    doc.frontmatter.description,
                    ...(doc.frontmatter.faqs ?? []).flatMap((faq) => [faq.question, faq.answer]),
                    doc.body,
                ].join('\n')
            )
            expect(
                doc.frontmatter.releaseGate === 'public-source',
                `${doc.collection}/${doc.slug}/${doc.locale}.md must pair the public-source claim with its gate`
            ).toBe(claimsPublicSource)
            expect(
                claimsPublicSource,
                `${doc.collection}/${doc.slug}/${doc.locale}.md uses public-source language without the claim and gate`
            ).toBe(usesPublicSourceLanguage)
        }

        expect(
            ALL.filter((doc) => doc.frontmatter.releaseGate === 'public-source').map(
                (doc) => `${doc.collection}/${doc.slug}/${doc.locale}.md`
            )
        ).toEqual([
            'alternatives/splitwise-alternative/en.md',
            'alternatives/splitwise-alternative/es-419.md',
            'alternatives/splitwise-alternative/pt-br.md',
        ])
    })
})

/**
 * The loader's own behaviour, against a scratch tree rather than the real articles — a draft, a
 * malformed file and a dateless file cannot be committed to src/content/ just to be asserted on,
 * and asserting them against a tree that contains none of those is how the previous version of
 * these tests passed without being able to fail.
 */
describe('loader, against a scratch tree', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'split-content-'))
    const cwd = process.cwd()

    beforeAll(() => {
        const write = (rel: string, body: string) => {
            const full = path.join(root, 'src/content', rel)
            fs.mkdirSync(path.dirname(full), { recursive: true })
            fs.writeFileSync(full, body)
        }
        const doc = (title: string, date: string, extra = '') =>
            `---\ntitle: ${title}\ndescription: d\ndate: ${date}\n${extra}---\nbody\n`

        write('blog/older/en.md', doc('Older', '2026-01-01'))
        write('blog/newer/en.md', doc('Newer', '2026-06-01'))
        write('blog/draft/en.md', doc('Draft', '2026-06-02', 'published: false\n'))
        write('blog/dateless/en.md', '---\ntitle: Dateless\ndescription: d\n---\nbody\n')
        write('blog/broken/en.md', '---\ntitle: "unterminated\ndescription: d\ndate: 2026-06-03\n---\nbody\n')
        // Would be served by /new, not by the content route — must never be listed.
        write('alternatives/new/en.md', doc('New', '2026-06-04'))
        write('alternatives/keep-alternative/en.md', doc('Keep', '2026-06-05'))

        // Capture pages share the root slot with alternatives, and are shadowed by the same routes.
        write('capture/split-bill-no-signup/en.md', doc('No signup', '2026-06-06', 'intent: split bill no signup\n'))
        write('capture/split-bill-no-signup/es-419.md', doc('Sin registro', '2026-06-06', 'intent: dividir cuenta\n'))
        write('capture/blog/en.md', doc('Blog', '2026-06-07'))

        // Translations: one article fully localised, one Spanish-only draft, one English-only.
        write('blog/newer/es-419.md', doc('Nuevo', '2026-06-01'))
        write('blog/newer/pt-br.md', doc('Novo', '2026-06-01'))
        write('blog/older/es-419.md', doc('Viejo', '2026-01-01', 'published: false\n'))

        process.chdir(root)
    })

    afterAll(() => {
        process.chdir(cwd)
        fs.rmSync(root, { recursive: true, force: true })
    })

    it('survives malformed frontmatter instead of failing the build', () => {
        expect(() => listDocs('blog')).not.toThrow()
        expect(listSlugs('blog')).not.toContain('broken')
    })

    it('drops drafts and dateless articles', () => {
        const slugs = listSlugs('blog')
        expect(slugs).not.toContain('draft')
        expect(slugs).not.toContain('dateless')
        expect(getDoc('blog', 'draft')).toBeNull()
    })

    it('sorts newest first', () => {
        expect(listSlugs('blog')).toEqual(['newer', 'older'])
    })

    it('hides a slug that a static route would shadow', () => {
        expect(listSlugs('alternatives')).toEqual(['keep-alternative'])
        expect(getDoc('alternatives', 'new')).toBeNull()
        // The shadow rule follows the root slot, not the collection name — a capture page called
        // `blog` is as unreachable as an alternative called `new`.
        expect(getDoc('capture', 'blog')).toBeNull()
        expect(listSlugs('capture')).toEqual(['split-bill-no-signup'])
    })

    /**
     * The whole point of generalising `[alternative]` to `[page]`: two collections, one root slot,
     * and a capture page that gets the same hrefs, the same translations and the same sitemap
     * treatment as a comparison page without another route.
     */
    it('serves capture pages from the root slot beside alternatives', () => {
        expect(getDoc('capture', 'split-bill-no-signup')?.href).toBe('/split-bill-no-signup')
        expect(getDoc('capture', 'split-bill-no-signup', 'es-419')?.href).toBe('/es-419/split-bill-no-signup')
        expect(getDoc('capture', 'split-bill-no-signup')?.frontmatter.intent).toBe('split bill no signup')
        expect(localesForSlug('capture', 'split-bill-no-signup')).toEqual(['en', 'es-419'])

        const hrefs = listAllTranslations().map((doc) => doc.href)
        expect(hrefs).toContain('/split-bill-no-signup')
        expect(hrefs).toContain('/es-419/split-bill-no-signup')
        expect(hrefs).toContain('/keep-alternative')
    })

    /**
     * The rule the whole design rests on: a missing translation is a missing page, never an
     * English body at a translated URL. Every assertion here is one that a fallback would break.
     */
    describe('translations', () => {
        it('serves each language its own file', () => {
            expect(getDoc('blog', 'newer', 'en')?.frontmatter.title).toBe('Newer')
            expect(getDoc('blog', 'newer', 'es-419')?.frontmatter.title).toBe('Nuevo')
            expect(getDoc('blog', 'newer', 'pt-br')?.frontmatter.title).toBe('Novo')
        })

        it('never falls back to English for an untranslated article', () => {
            // `older` has no pt-br file at all, and its es-419 file is a draft.
            expect(getDoc('blog', 'older', 'pt-br')).toBeNull()
            expect(getDoc('blog', 'older', 'es-419')).toBeNull()
        })

        it('lists only what exists in that language', () => {
            expect(listSlugs('blog', 'es-419')).toEqual(['newer'])
            expect(listSlugs('blog', 'pt-br')).toEqual(['newer'])
        })

        it('reports only the locales a slug is published in, in a stable order', () => {
            expect(localesForSlug('blog', 'newer')).toEqual(['en', 'es-419', 'pt-br'])
            // `older` has a live English page beside a committed Spanish draft; `dateless` and
            // `broken` never parse. A file that 404s must not enter hreflang or the sitemap.
            expect(localesForSlug('blog', 'older')).toEqual(['en'])
            expect(localesForSlug('blog', 'dateless')).toEqual([])
            expect(localesForSlug('blog', 'broken')).toEqual([])
            expect(localesForSlug('blog', 'no-such-slug')).toEqual([])
        })

        it('keeps the draft translation out of its live sibling page hreflang', () => {
            // Exactly what `alternatesFor` and the sitemap build: with the draft removed, `older`
            // has one language left, which is not a set of alternates.
            expect(hreflangAlternates(basePathFor('blog', 'older'), localesForSlug('blog', 'older'))).toBeUndefined()
        })

        it('prefixes non-default locales and leaves English bare', () => {
            expect(getDoc('blog', 'newer', 'en')?.href).toBe('/blog/newer')
            expect(getDoc('blog', 'newer', 'es-419')?.href).toBe('/es-419/blog/newer')
            expect(getDoc('blog', 'newer', 'pt-br')?.href).toBe('/pt-br/blog/newer')
            expect(getDoc('alternatives', 'keep-alternative', 'en')?.href).toBe('/keep-alternative')
        })

        it('enumerates every published translation for the sitemap', () => {
            const hrefs = listAllTranslations().map((doc) => doc.href)
            expect(hrefs).toContain('/blog/newer')
            expect(hrefs).toContain('/es-419/blog/newer')
            expect(hrefs).toContain('/pt-br/blog/newer')
            // The Spanish draft of `older` is published:false — a live English page beside it
            // must not drag the unfinished translation into the sitemap.
            expect(hrefs).not.toContain('/es-419/blog/older')
            expect(new Set(hrefs).size).toBe(hrefs.length)
        })
    })
})

describe('article bodies', () => {
    /**
     * Internal links are the only thing here that can rot silently — a renamed slug 404s.
     *
     * Both spellings, because the body is MDX and an author has two of them: `href="/x"` on a
     * component, and `[label](/x)` in prose. Checking only the attribute left every markdown link
     * unchecked, which is most of the links a capture page has — its whole job is routing the
     * reader onward. A fragment or a query is cut off before the lookup: `/tools#rent` rots when
     * `/tools` does, and the anchor is not a page.
     *
     * Two sets, because a draft is not a page: `getDoc` returns null for one and every route pins
     * `dynamicParams = false`. Publishing is deleting one line (`_system/README.md`), so a
     * published page linking to a still-draft sibling is a live 404 the moment that line goes —
     * which is why only a draft may link to a draft. `/` and `/new` are cookie-localized and have
     * no prefixed twin, so they are seeded unprefixed only.
     */
    it('only links internally to pages that exist', () => {
        const routed = new Set<string>([
            ...INDEXED_LOCALES.map((locale) => localizedPath('/blog', locale)),
            ...listAllTranslations().map((doc) => doc.href),
            ...[...staticPageSlugs].map((slug) => `/${slug}`),
            ...TOOLS.flatMap((tool) => toolLocales(tool).map((locale) => toolPath(tool, locale))),
            // Template rooms. English only, so one path each and no prefixed twin.
            ...TEMPLATES.map(templatePath),
            ...STATIC_PAGES.flatMap((page) =>
                (page.locales ?? [DEFAULT_LOCALE]).map((locale) => localizedPath(page.href, locale))
            ),
            // Released guides only — the reviewed registry, not the manifest. A body link to a
            // parked guide must keep failing here.
            ...SPLIT_CONTENT_INDEX_RELEASED_PATHS,
        ])
        const authored = new Set<string>([...routed, ...ALL.map((doc) => doc.href)])

        for (const doc of ALL) {
            const known = doc.frontmatter.draft === true ? authored : routed
            const links = [
                ...[...doc.body.matchAll(/href="(\/[^"#?]*)"/g)].map((m) => m[1]),
                ...[...doc.body.matchAll(/\]\((\/[^)]*)\)/g)].map((m) => m[1].replace(/[#?].*$/, '')),
            ].filter(Boolean)
            for (const link of links) {
                expect(known.has(link), `${doc.slug}/${doc.locale} links to missing ${link}`).toBe(true)
            }
        }
    })

    /** Rendered FAQ and FAQPage schema come from different places; they have to agree. */
    it('puts every rendered FAQ question into frontmatter too', () => {
        for (const doc of ALL) {
            const rendered = [...doc.body.matchAll(/<FAQItem question="([^"]+)"/g)].map((m) => m[1])
            if (rendered.length === 0) continue

            const declared = new Set((doc.frontmatter.faqs ?? []).map((faq) => faq.question))
            for (const question of rendered) {
                expect(declared.has(question), `${doc.slug} renders an FAQ missing from frontmatter`).toBe(true)
            }
        }
    })

    /**
     * A competitor's words are evidence, and evidence is not translated (`competitor-claims.md`).
     * Every `<Quote>` on a translated page therefore has to be the same bytes as one on the
     * English page for the same slug — a Spanish page that "quotes" a Spanish rendering of an
     * English sentence is quoting nobody, and a quote that drifted by a character while being
     * carried across three files is no longer verbatim on any of them.
     *
     * Byte-identical on the trimmed body, so re-wrapping a long quote is still a failure: the
     * three files should hold one string, not three renderings of it.
     */
    it('quotes the same source bytes in every language of a page', () => {
        const quotes = (body: string) => [...body.matchAll(/<Quote[^>]*>([\s\S]*?)<\/Quote>/g)].map((m) => m[1].trim())

        for (const doc of ALL) {
            if (doc.locale === DEFAULT_LOCALE) continue
            const translated = quotes(doc.body)
            if (translated.length === 0) continue

            const english = getDoc(doc.collection, doc.slug, DEFAULT_LOCALE)
            expect(english, `${doc.collection}/${doc.slug}/${doc.locale}.md quotes a source its en.md does not`) //
                .not.toBeNull()
            const source = new Set(quotes(english!.body))
            for (const quote of translated) {
                expect(
                    source.has(quote),
                    `${doc.collection}/${doc.slug}/${doc.locale}.md: "${quote}" is not byte-identical to a <Quote> in the same slug's en.md — a competitor's words are evidence and are never translated or re-typed`
                ).toBe(true)
            }
        }
    })

    /** next-mdx-remote parses the body as MDX, so an unbalanced brace is a build failure. */
    it('has balanced custom-component tags', () => {
        const paired = ['Hero', 'CTA', 'Steps', 'Step', 'FAQ', 'FAQItem', 'Callout', 'Quote', 'Cast', 'Checklist', 'ChecklistItem', 'RelatedPages', 'RelatedLink', 'Calc', 'Share'] // prettier-ignore
        for (const doc of ALL) {
            for (const tag of paired) {
                const opens = (doc.body.match(new RegExp(`<${tag}[\\s>]`, 'g')) ?? []).length
                const selfClosing = (doc.body.match(new RegExp(`<${tag}[^>]*/>`, 'gs')) ?? []).length
                const closes = (doc.body.match(new RegExp(`</${tag}>`, 'g')) ?? []).length
                expect(opens - selfClosing, `${doc.slug}: <${tag}> is unbalanced`).toBe(closes)
            }
        }
    })
})

/**
 * The mechanical half of the stylebook.
 *
 * Split has no CI in front of `main` and a push is production in about five minutes, so a tone rule
 * that lives only in a document is a tone rule that gets broken on a Friday. Every rule that CAN be
 * a regex is one, and it lives here because `pnpm test` is the gate a human actually runs.
 *
 * Each rule is one entry. Adding the next one is a line, and the `why` is the message the failure
 * prints — a rule whose failure does not say what to write instead gets worked around.
 *
 * The rules are deliberately narrow. A blanket ban on "real-time" would fail
 * `blog/split-expenses-in-real-time`, whose subject is a shipped feature; what is actually banned is
 * "real-time" applied to an FX RATE, which is the claim `fx.ts` cannot support. Same shape for the
 * money-amount rule: a guide teaches with "the €47 taxi" and should, while a comparison page with a
 * number in it is a competitor price that rots. Narrow rules survive; broad ones get suppressed.
 */

const RATE_WORD = 'rates?|exchange|conversion|fx|tasas?|tipo de cambio|cotizaci[óo]n|taxas?|c[âa]mbio'
const LIVE_WORD = 'live|real[-\\s]?time|en vivo|ao vivo|(?:en|em) tiempo real|(?:en|em) tempo real'

interface StyleRule {
    id: string
    /**
     * `prose` is everything we wrote in our own voice: the title, the description and the body with
     * attributed `<Quote>` blocks and MDX comments removed. The metadata is in there because it is
     * the most-read prose on the page and the least often re-read by us.
     *
     * `meta` is the title and description alone, for rules about how a search result renders.
     */
    target: 'prose' | 'meta'
    pattern: RegExp
    /** Printed on failure. Say what to write instead, not just what is wrong. */
    why: string
    /** Collections the rule applies to. Omitted means all of them. */
    collections?: readonly Collection[]
    /** Locales the rule applies to. Omitted means all of them. */
    locales?: readonly IndexedLocale[]
}

export const NEVER_STRINGS: readonly StyleRule[] = [
    {
        id: 'unguessable-link',
        target: 'prose',
        pattern: /\bunguessable\b|\binadivinable\b/i,
        why: 'we make no claim about room-slug entropy — see product-truths.md#link-is-the-key',
    },
    {
        id: 'room-speaks-three',
        target: 'prose',
        pattern: /whichever of the three|of the three the phone|de esos tres|existe en los tres|existe nos tr[êe]s/i,
        why: 'the room speaks all seven locales, not three — only this page tree is three (product-truths.md#languages-seven)',
    },
    {
        id: 'minimal-transfers',
        target: 'prose',
        pattern:
            /\b(?:fewest|smallest|minimum|minimal|optimal|m[íi]nim\w+|menor n[úu]mero)\b[^.\n]{0,24}\b(?:transfers?|payments?|transferencias?|transfer[êe]ncias?|pagos?|pagamentos?)\b/i,
        why: 'the exact solver is bounded — say "two or three transfers instead of twenty" (product-truths.md#netting-is-bounded-exact)',
    },
    {
        id: 'live-fx-rate',
        target: 'prose',
        pattern: new RegExp(`\\b(?:${LIVE_WORD})\\b[\\s-]*(?:${RATE_WORD})\\b`, 'i'),
        why: 'the FX ceiling is "converted at the day\'s indicative rate" — never live or real-time (product-truths.md#automatic-currency-conversion)',
    },
    {
        id: 'live-fx-rate-reversed',
        target: 'prose',
        pattern: new RegExp(`\\b(?:${RATE_WORD})\\b[^.\\n]{0,16}\\b(?:${LIVE_WORD})\\b`, 'i'),
        why: 'same rule, other word order: a rate is never described as live or in real time',
    },
    {
        id: 'legacy-currency-count',
        target: 'prose',
        pattern:
            /\btwelve currencies\b|\bany of (?:the )?twelve\b|\bdoce monedas\b|\bcualquiera de (?:las )?doce\b|\bdoze moedas\b|\bqualquer(?:a)? uma das doze\b/i,
        why: 'automatic conversion covers 156 currencies; twelve is only the static outage/dev fallback (product-truths.md#automatic-currency-conversion)',
    },
    {
        id: 'unlimited',
        target: 'prose',
        pattern: /\bunlimited\b|\bilimitad\w+\b/i,
        why: 'nothing here is unlimited — "up to twenty people" (product-truths.md#room-size-20)',
    },
    {
        id: 'money-amount-on-a-root-page',
        target: 'prose',
        collections: ROOT_COLLECTIONS,
        // Both orders, because "€140" and "140 €" are the same claim in different languages and a
        // one-sided regex would gate English and wave Spanish through.
        pattern: /[$€£¥]\s?\d|\d[\d.,]*\s?[$€£¥]/,
        why: 'a comparison or capture page states no prices — the paid-tier fact without the number (competitor-claims.md rule 3)',
    },
    {
        id: 'emoji-in-metadata',
        target: 'meta',
        pattern: /\p{Extended_Pictographic}/u,
        why: 'Google renders the title and description as plain text; an emoji there is a truncated character',
    },
    {
        id: 'marketing-adjective',
        target: 'prose',
        pattern:
            /seamless|effortless|robust|powerful|world-class|cutting-edge|game-changing|revolutionary|empower|supercharge|truly|incredibly|\bsimply\b/i,
        why: '§6.4 bans the marketing adjective — state what the product does',
    },
    {
        id: 'contrast-frame',
        target: 'prose',
        pattern: /not just|isn['’]t just|is not just|it['’]s not about|whether you['’]re|whether you are/i,
        why: 'say the thing, not what it is not (§11.1)',
    },
    {
        id: 'transition-tell',
        target: 'prose',
        pattern:
            /\bimagine\b|picture this|let['’]s dive|in today['’]s world|look no further|now that we['’]ve|now that we have covered/i,
        why: 'a sentence that announces the next sentence carries nothing (§11.1) — delete it',
    },
    {
        id: 'split-bills-tagline',
        target: 'prose',
        pattern: /split bills,? not friendships/i,
        why: "the line is Splid's and PartyTab's (§6.10)",
    },
    {
        id: 'concession-title',
        target: 'prose',
        pattern: /split (?:is )?not good at|split does not do|the honest bit/i,
        why: 'title the concession from the §4.1 table (§4.3)',
    },
    {
        id: 'gamification',
        target: 'prose',
        pattern: /streak|level up|achievement|badge|confetti|woohoo/i,
        why: 'no celebration and no gamification register (§6.1/§6.3)',
    },
    {
        id: 'burned-phrase',
        target: 'prose',
        pattern: /punished for earning more|wanderlust|unforgettable memories/i,
        why: 'retired phrase (§11.1) — write the concrete line item instead',
    },
    {
        id: 'uk-slang',
        target: 'prose',
        pattern: /\blads\b|\bquid\b|\bskint\b|venmo me|😂/i,
        why: 'no dated slang and no 😂 (§6.2/§6.9)',
    },
    {
        id: 'es-spain-forms',
        locales: ['es-419'],
        target: 'prose',
        pattern: /vosotros|estáis|habéis|vuestr[oa]|a escote|a pachas|\bcoger\b/i,
        why: 'Spain-only grammar (§9.2) — es-419 uses tú and ustedes',
    },
    {
        id: 'es-spain-slang',
        locales: ['es-419'],
        target: 'prose',
        pattern: /\bpasta\b|\bguita\b|\blana\b|\bplata\b|\bchaval|\btío\b|\bguay\b|compañero de piso/i,
        why: 'dinero, roomie, compañero de departamento (localization.es-419.md §3)',
    },
    {
        id: 'es-bote',
        locales: ['es-419'],
        target: 'prose',
        pattern: /\bbote\b(?! común)/i,
        why: '"bote" is legal only as "bote común" in a Spain-scoped block (§11.1)',
    },
    {
        // Whole words only: "pagándole" and "enviábamos" are tuteo, and `\b` cannot see past an accent.
        id: 'es-voseo',
        locales: ['es-419'],
        target: 'prose',
        pattern: /vos podés|\bsos\b|dejalo|probalo|(?<!\p{L})(?:pagá|enviá|poné)s?(?!\p{L})/iu,
        why: 'tú is locked (§9.2) — no voseo',
    },
    {
        id: 'es-no-account-overclaim',
        locales: ['es-419'],
        target: 'prose',
        pattern: /saltarte el registro|sin identificarte|sin documentos|elimina esa barrera/i,
        why: 'frame no-account as "sin registrarse", from the no-app claim block (localization.es-419.md §4)',
    },
    {
        id: 'es-concession-title',
        locales: ['es-419'],
        target: 'prose',
        pattern: /no es bueno|la parte honesta/i,
        why: 'title the concession from the §4.1 table (§4.3)',
    },
    {
        id: 'pt-acerto-de-contas',
        locales: ['pt-br'],
        target: 'meta',
        pattern: /acerto de contas/i,
        why: 'never in a title or description (§11.1) — rateio, acerto, "quem deve a quem"',
    },
    {
        // The noun. "racha" is also the você-present of "rachar", which localization.pt-br.md
        // conjugates on purpose, so only a determiner in front of it marks the banned sense.
        id: 'pt-racha',
        locales: ['pt-br'],
        target: 'prose',
        pattern: /\b(?:o|um|do|no|ao|num|pelo|esse|este|aquele|nosso|seu|meu|outro|mesmo)\s+racha\b/i,
        why: 'the standalone token is banned (§11.1) — "rachar a conta"',
    },
    {
        id: 'pt-dated-slang',
        locales: ['pt-br'],
        target: 'prose',
        pattern: /passar a régua|lacrou|arrasou/i,
        why: 'slang with a shelf life (§6.9)',
    },
    {
        id: 'pt-no-account-overclaim',
        locales: ['pt-br'],
        target: 'prose',
        pattern:
            /sem CPF|pular o cadastro|furar a fila|burlar|driblar|sem precisar se identificar|sem documentos|elimina essa barreira/i,
        why: 'frame no-account from the no-app claim block (localization.pt-br.md §6)',
    },
    {
        id: 'pt-concession-title',
        locales: ['pt-br'],
        target: 'prose',
        pattern: /não é bom|a parte honesta/i,
        why: 'title the concession from the §4.1 table (§4.3)',
    },
]

/**
 * §6.16, the half of it a regex can carry.
 *
 * These are not banned for being machine-written. They are banned for being sentences with no cargo
 * — a warm-up, a hand-off, a narrator telling you the next fact matters — and a model reaches for
 * them first because they are the cheapest thing to write. They are split out from `NEVER_STRINGS`
 * because the two lists fail for different reasons: a never-string is a CLAIM we cannot support, and
 * one of these is a sentence we would not have written.
 *
 * Only the phrases with no legal reading on these pages are here. §6.16 covers a much larger family
 * — explore, navigate, journey, landscape, dive, unpack, ultimately, notably, keep in mind — and
 * every one of those is left to the cold read on purpose, because this is a travel site: you explore
 * the old town, you navigate to the ferry, you unpack at the villa. Gating the figurative sense of a
 * word whose literal sense is our subject matter fails correct copy, and a gate that fails correct
 * copy gets suppressed. The one narrow figurative form that survives is "let's unpack", which nobody
 * writes about luggage.
 */
export const ANTI_AI_STRINGS: readonly StyleRule[] = [
    {
        id: 'rhetorical-question-transition',
        target: 'prose',
        pattern:
            /\bthe (?:result|catch|kicker|upshot|twist|best part)\?|\bsound familiar\?|\bso what does (?:this|that) mean/i,
        why: 'a question asked so the page can answer it is a transition (§6.16.1) — delete the question and keep the answer',
    },
    {
        id: 'fake-chummy-opener',
        target: 'prose',
        pattern:
            /\blet'?s (?:be honest|face it)\b|\bwe'?ve all been there\b|\bhere'?s (?:the thing|where it gets)\b|\b(?:seamos|sejamos|vamos a ser|vamos ser) honestos\b/i,
        why: "open on the fact, not on an arm round the shoulder (§6.16.1) — warmth is §3.1's concrete thing",
    },
    {
        id: 'conclusion-tell',
        target: 'prose',
        pattern:
            /\bat the end of the day\b|\bwhen all is said and done\b|\bthe bottom line\b|\bin short,|\bin conclusion\b|\bto sum up\b/i,
        why: 'a last paragraph is already last (§6.16.1) — cut the opener and keep the sentence',
    },
    {
        id: 'importance-narrator',
        target: 'prose',
        pattern:
            /\bit'?s worth noting\b|\bit is worth noting\b|\bworth noting that\b|\b(?:importantly|interestingly),/i,
        why: 'telling the reader a fact matters is the tell that it does not (§6.16.1) — state the fact',
    },
    {
        id: 'anthropomorphic-reassurance',
        target: 'prose',
        pattern:
            /\b(?:we'?ve|we have) (?:got )?you covered\b|\b(?:got|has) your back\b|\bsay (?:goodbye|hello) to\b|\byour new best friend\b/i,
        why: 'Split is a page that counts, not a friend with feelings about you (§6.16.2) — say what it does',
    },
    {
        id: 'metaphor-vocabulary',
        target: 'prose',
        pattern: /\bdelve\b|\bdeep[-\s]dive\b|\bgame[-\s]chang/i,
        why: 'use the plain verb — work out, look at, compare (§6.16.2); §6.4 bans the adjective form as well',
    },
    {
        id: 'figurative-unpack',
        target: 'prose',
        pattern: /\blet'?s unpack\b/i,
        why: 'unpacking is what you do at the villa (§6.16.2) — for an argument, say "work out", or make the argument',
    },
]

/** Both gates run the whole book. The two lists are separate for their reasons, not their scope. */
const STYLE_RULES: readonly StyleRule[] = [...NEVER_STRINGS, ...ANTI_AI_STRINGS]

/**
 * What a prose rule is matched against. A `<Quote>` is somebody else's words, attributed and dated,
 * and it is the one place a phrase we would not write ourselves is allowed to appear — stripping it
 * is what lets the rules be absolute everywhere else. MDX comments go too: the check-date note at the
 * top of a comparison page is instructions to the next editor, not copy.
 */
function ownProse(doc: (typeof ALL)[number]): string {
    const body = doc.body.replace(/<Quote[\s\S]*?<\/Quote>/g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    return `${doc.frontmatter.title}\n${doc.frontmatter.description}\n${body}`
}

describe('style gate', () => {
    it.each(STYLE_RULES.map((rule) => [rule.id, rule] as const))('never says %s', (_id, rule) => {
        for (const doc of ALL) {
            if (rule.collections && !rule.collections.includes(doc.collection)) continue
            if (rule.locales && !rule.locales.includes(doc.locale)) continue
            const subject =
                rule.target === 'meta' ? `${doc.frontmatter.title} ${doc.frontmatter.description}` : ownProse(doc)
            const hit = subject.match(rule.pattern)
            expect(hit?.[0], `${doc.collection}/${doc.slug}/${doc.locale}.md: ${rule.why}`).toBeUndefined()
        }
    })
})

/**
 * The other half of §11: the rules that count rather than ban.
 *
 * A never-string is a phrase we never write; these are phrases we write ONCE. One exclamation
 * mark is the voice's interjection, two is a sales floor; one "Peanut Split" is the product
 * entering by name, two is a brochure. A cap cannot be a `NEVER_STRINGS` row because a row is
 * matched against the page as a blob and has no idea it is the second hit — so they live here,
 * one `it` per rule, each iterating every published translation.
 *
 * They run in `pnpm test` rather than in `scripts/marketing-copy-audit.mjs` for the same reason
 * the style gate above does: the audit script is the "free" claim checker, it walks raw files and
 * knows nothing about frontmatter, drafts or locales, and the gate a human actually runs before
 * pushing to `main` is `pnpm test`.
 */

/**
 * Body copy only: no frontmatter, no attributed `<Quote>` (§7.1 — somebody else's words), no MDX
 * comments (instructions to the next editor), and no `![` image marker, which is a markdown
 * token rather than an exclamation mark.
 */
function bodyProse(doc: (typeof ALL)[number]): string {
    return doc.body
        .replace(/<Quote[\s\S]*?<\/Quote>/g, ' ')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
        .replace(/!\[/g, '[')
}

/**
 * The body chopped into the units a sentence rule can be applied to.
 *
 * MDX is not one stream of prose. A `<Step title="…">` holds a line of copy, a `|` divides two
 * table cells, and the tag syntax between them is not text — so every attribute value and every
 * cell becomes its own segment, and markdown scaffolding (bullets, blockquote and heading
 * markers, emphasis) is stripped off the front. Opening quotation marks go too: a line of quoted
 * dialogue (§3.12) still starts a sentence, and treating `"Just send it to me"` as mid-sentence
 * would fail approved copy.
 */
function proseSegments(doc: (typeof ALL)[number]): string[] {
    return bodyProse(doc)
        .replace(/<\/?[A-Za-z][\w.]*/g, '\n')
        .replace(/\/?>/g, '\n')
        .replace(/\b[a-zA-Z]+="/g, '\n')
        .replace(/\|/g, '\n')
        .split('\n')
        .map((line) =>
            line
                .replace(/^[\s>#*+-]+/, '')
                .replace(/["“”'‘’*_`]/g, '')
                .trim()
        )
        .filter(Boolean)
}

/** The places §11.2 allows no exclamation mark at all, labelled so the failure says which one. */
function noExclamationZones(doc: (typeof ALL)[number]): [string, string][] {
    const body = bodyProse(doc)
    const zones: [string, string][] = [
        ['the title', doc.frontmatter.title],
        ['the description', doc.frontmatter.description],
    ]
    for (const faq of doc.frontmatter.faqs ?? []) zones.push(['a frontmatter FAQ', `${faq.question} ${faq.answer}`])
    for (const [heading] of body.matchAll(/^#{1,6} .*/gm)) zones.push(['a heading', heading])
    for (const [row] of body.matchAll(/^\s*\|.*/gm)) zones.push(['a table row', row])
    for (const [, label] of body.matchAll(/\b(?:text|cta)="([^"]*)"/g)) zones.push(['a CTA label', label])
    for (const [item] of body.matchAll(/<FAQItem[\s\S]*?<\/FAQItem>/g)) zones.push(['an FAQ item', item])
    return zones
}

/**
 * §11.2's question cap: the questions the page asks in its own voice, which is what is left once
 * the three kinds of legitimate question mark are taken out.
 *
 * An `<FAQ>` block is the reader's questions, not ours. A component attribute — `title=` on a
 * `<Step>` or a `<ChecklistItem>`, `question=` on an `<FAQItem>` — is a heading, and a heading
 * phrased as a question is navigation ("Does it net the debts down?"), the same way §11.2 treats a
 * heading as its own zone for exclamation marks. A `?` inside quotation marks is somebody speaking:
 * the §3.12 quoted opening, a line of dialogue, a sentence written for the reader to say at a table.
 *
 * What survives all three is the tell — a question with no asker, standing in front of its own
 * answer. §6.16.1 wants it deleted; the one that is allowed to stay is the §8.1 pre-emption, which
 * is why this counts to one rather than to zero.
 */
function ownVoiceQuestions(text: string): string[] {
    const asked = text
        .replace(/<FAQ>[\s\S]*?<\/FAQ>/g, ' ')
        .replace(/\b[a-zA-Z]+="[^"]*"/g, ' ')
        .replace(/["“][^"”]*["”]/g, ' ')
    return [...asked.matchAll(/[^.!?\n]*\?/g)].map((match) => match[0].trim()).filter(Boolean)
}

/**
 * §11.1 verbatim. Every banned minimising use of "just" sits mid-sentence — "it's just easy",
 * "just a few taps", "it's just a link" — and the one approved use (§3.18, the imperative of
 * relief) is always the first word of a sentence, so the check follows the grammar and leaves the
 * judgement to the cold read.
 */
const MID_SENTENCE_JUST = /(?:[^\s.!?\n][^.!?\n]*)\bjust\b/i
/** §11.2's cap on the approved use: one sentence may open on "Just", not three. */
const SENTENCE_INITIAL_JUST = /(?:^|[.!?]\s+)Just\s/gm

describe('page style gate', () => {
    /** §3.13: one interjection per page, and it is the only exclamation mark the page gets. */
    it('spends at most one exclamation mark per page', () => {
        for (const doc of ALL) {
            const count = (bodyProse(doc).match(/!/g) ?? []).length
            expect(
                count,
                `${doc.collection}/${doc.slug}/${doc.locale}.md: one interjection per page (§3.13) — the rest of the page is deadpan`
            ).toBeLessThanOrEqual(1)
        }
    })

    it('keeps exclamation marks out of metadata, headings, tables, CTAs and FAQs', () => {
        for (const doc of ALL) {
            for (const [where, text] of noExclamationZones(doc)) {
                expect(
                    text.includes('!'),
                    `${doc.collection}/${doc.slug}/${doc.locale}.md: no exclamation mark in ${where} (§11.2) — the interjection lives in body copy`
                ).toBe(false)
            }
        }
    })

    /**
     * §3.13/§3.7.4: an exclamation mark next to money reads as a sales floor. Clauses are split on
     * `.` and `?` only, so the text either side of the `!` counts as its sentence — which is the
     * point, because "…! You are ninety euros down" is the same sales floor in two sentences.
     */
    it('never puts an exclamation mark near a number', () => {
        for (const doc of ALL) {
            for (const segment of proseSegments(doc)) {
                for (const clause of segment.split(/[.?]+/)) {
                    if (!clause.includes('!')) continue
                    expect(
                        /[\d$€£¥]/.test(clause),
                        `${doc.collection}/${doc.slug}/${doc.locale}.md: "${clause.trim()}" — no exclamation mark in a sentence with a number in it (§3.13)`
                    ).toBe(false)
                }
            }
        }
    })

    it('only uses "just" as the first word of a sentence', () => {
        for (const doc of ALL) {
            for (const segment of proseSegments(doc)) {
                const hit = segment.match(MID_SENTENCE_JUST)
                expect(
                    hit?.[0],
                    `${doc.collection}/${doc.slug}/${doc.locale}.md: mid-sentence "just" minimises what it describes (§3.18) — cut the word, or open the sentence with it`
                ).toBeUndefined()
            }
        }
    })

    it('opens at most one sentence with "Just"', () => {
        for (const doc of ALL) {
            const count = (proseSegments(doc).join('\n').match(SENTENCE_INITIAL_JUST) ?? []).length
            expect(
                count,
                `${doc.collection}/${doc.slug}/${doc.locale}.md: "Just …" is the closing beat of relief (§3.18) — a page gets one`
            ).toBeLessThanOrEqual(1)
        }
    })

    /**
     * §3.17/§10: the product enters by name once, and is "Split" everywhere after that. Scoped to
     * the body because the title, the description and the FAQ schema are not the page's prose —
     * `pageTitle()` appends " | Peanut Split" to every title on the site as it is.
     *
     * Table rows are dropped first. §3.17 governs an entrance, and an entrance is a sentence; a
     * comparison table is reference furniture, and its column header carries the full name because
     * it sits beside "Splitwise" and "Tricount", where a bare "Split" reads as the row label rather
     * than the product. Counting the header would force the one page whose job is that comparison
     * to name itself less clearly than it names its competitor.
     */
    it('names the product in full once, then calls it Split', () => {
        for (const doc of ALL) {
            const prose = bodyProse(doc).replace(/^\s*\|.*$/gm, ' ')
            const count = (prose.match(/Peanut Split/g) ?? []).length
            expect(
                count,
                `${doc.collection}/${doc.slug}/${doc.locale}.md: an approved full name enters once (§3.17/§10.1) — every later mention is "Split"`
            ).toBeLessThanOrEqual(1)
        }
    })

    /** §11.2: three em-dashes per page; the fourth is a comma, a full stop or a colon. */
    it('spends at most three em-dashes per page', () => {
        for (const doc of ALL) {
            const count = (bodyProse(doc).match(/—/g) ?? []).length
            expect(
                count,
                `${doc.collection}/${doc.slug}/${doc.locale}.md: at most three em-dashes per page (§11.2) — the rest are commas and full stops`
            ).toBeLessThanOrEqual(3)
        }
    })

    /** §6.16.1: one question in our own voice per page, and it is the §8.1 pre-emption. */
    it('asks at most one question in its own voice', () => {
        for (const doc of ALL) {
            const asked = ownVoiceQuestions(bodyProse(doc))
            expect(
                asked.length,
                `${doc.collection}/${doc.slug}/${doc.locale}.md: ${asked.map((q) => `"${q}"`).join(' / ')} — a question standing in front of its own answer is a transition (§6.16.1); name the objection as a statement`
            ).toBeLessThanOrEqual(1)
        }
    })

    /**
     * §3.12: a page may open on one line of quoted dialogue, and it is the first line or it is
     * nothing. Whether the next sentence falsifies it is a judgement no regex makes, so this
     * checks the countable half — one quoted line at the top of the page, not two.
     */
    it('opens on at most one quoted line', () => {
        for (const doc of ALL) {
            const opening = bodyProse(doc)
                .split('\n')
                .filter((line) => line.trim())
                .slice(0, 4)
            const quoted = opening.filter((line) => /^["“]/.test(line.trim()))
            expect(
                quoted.length,
                `${doc.collection}/${doc.slug}/${doc.locale}.md: one quoted opening per page (§3.12) — the second line is the flat sentence that tests it`
            ).toBeLessThanOrEqual(1)
        }
    })
})

/**
 * The tool registry, held to the same rules as the content tree.
 *
 * A calculator is a page like any other: it has a title Google truncates, an intro somebody wrote
 * on a Friday, and an FAQ that can quietly overstate what the product does. The difference is that
 * its copy lives in a `.ts` file, which is exactly why it needs this — markdown gets re-read by a
 * human before it ships, and a string literal three levels inside a config does not.
 *
 * Every rule here is one the content pages already pass. Where a tool is held to MORE than an
 * article (no exclamation mark at all), the reason is in the test.
 */

/** The `{name}` slots in one phrase, sorted — what `fill()` will be asked to resolve. */
const placeholders = (template: string | undefined): string[] =>
    [...(template ?? '').matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()

/** Every string a reader can see, including the ones `compute` produces. */
function toolStrings(tool: Tool): string[] {
    const { copy } = tool
    const fields: ToolField[] = [...tool.fields, ...(tool.rows?.columns ?? []), ...(tool.builder?.fields ?? [])]
    return [
        tool.meta.title,
        tool.meta.description,
        copy.h1,
        ...copy.intro,
        copy.resultTitle,
        copy.resultHint,
        copy.roundingNote,
        copy.copyLabel,
        copy.copyDone,
        ...(copy.method ? [copy.method.title, ...copy.method.body] : []),
        copy.concession.title,
        copy.concession.body,
        copy.goodToKnow.title,
        ...copy.goodToKnow.body,
        copy.cta.title,
        copy.cta.body,
        copy.cta.label,
        copy.faqTitle,
        ...(tool.rows ? [tool.rows.nameLabel, tool.rows.namePrefix] : []),
        ...fields.flatMap((field) => [field.label, field.help ?? '', field.unit ?? '', ...(field.notches ?? [])]),
        ...(tool.builder
            ? [
                  tool.builder.summary,
                  tool.builder.title,
                  tool.builder.intro,
                  tool.builder.floorLabel,
                  tool.builder.totalLabel,
                  tool.builder.applyLabel,
                  tool.builder.appliedLabel,
              ]
            : []),
        ...(tool.choices ?? []).flatMap((choice) => [
            choice.label,
            choice.help ?? '',
            ...choice.options.flatMap((option) => [option.label, option.note ?? '', option.source?.label ?? '']),
        ]),
        ...(tool.related ?? []).map((link) => link.label),
        ...tool.faqs.flatMap((faq) => [faq.question, faq.answer]),
        ...Object.values(tool.phrases),
        ...computedStrings(tool),
    ].filter(Boolean)
}

/**
 * What the calculator prints once it has run. `detail` and the working labels are copy — they are
 * the derivation §8.3 asks for — and they are the copy least likely to be re-read, because they
 * only exist at runtime. Both toggle states are exercised: on this registry, one of them is the
 * income-weighted wording that no default render would reach.
 *
 * Every picker option is run too, one at a time. A working label can be written by the option a
 * reader picks — "rate for each mile" against "rate for each kilometre" — and an option nobody
 * renders in the default state is exactly the copy that ships unread.
 *
 * Slider columns are run level and then apart. A tool whose scale does nothing while every notch
 * matches writes its second set of row details only once somebody has moved one, and that wording
 * would otherwise never be rendered by this file.
 */
function computedStrings(tool: Tool): string[] {
    const toggleNames = tool.fields.filter((field) => field.kind === 'toggle').map((field) => field.name)
    const defaults = Object.fromEntries((tool.choices ?? []).map((choice) => [choice.name, choice.defaultValue]))
    const pickings: Record<string, string>[] = [
        defaults,
        ...(tool.choices ?? []).flatMap((choice) =>
            choice.options.map((option) => ({ ...defaults, [choice.name]: option.value }))
        ),
    ]

    /** Level, then apart — the second pass moves every slider column to a different notch per row. */
    const rowsAt = (spread: boolean) =>
        Array.from({ length: 3 }, (_, index) => ({
            name: `Row ${index + 1}`,
            values: Object.fromEntries(
                (tool.rows?.columns ?? []).map((column) => [
                    column.name,
                    column.kind === 'scale'
                        ? (spread ? index + 1 : column.defaultValue)
                        : column.defaultValue * 100, // prettier-ignore
                ])
            ),
        }))

    return [false, true].flatMap((on) =>
        pickings.flatMap((choices) =>
            [false, true].flatMap((spread) => {
                const outcome = tool.compute({
                    values: Object.fromEntries(tool.fields.map((field) => [field.name, field.defaultValue * 100])),
                    toggles: Object.fromEntries(toggleNames.map((name) => [name, on])),
                    choices,
                    rows: rowsAt(spread),
                    decimals: 2,
                    phrases: tool.phrases,
                })
                return [
                    outcome.problem ?? '',
                    ...outcome.shares.map((share) => share.detail),
                    ...outcome.workings.map((working) => working.label),
                ].filter(Boolean)
            })
        )
    )
}

/**
 * The dropped-accent gate, over the real tree.
 *
 * `diacritics.test.ts` proves the matcher — the wordlist, the boundaries, the interrogative
 * scoping, and the mutation loop that shows every row can fail. This is the other half: the rule
 * pointed at what actually ships. An English page has nothing to drop, so it is skipped by
 * construction rather than by an exception.
 */
describe('diacritic gate', () => {
    /**
     * Everything on the page that a reader of that language reads.
     *
     * `ownProse` is not enough here, and the mutation test is what proved it: the frontmatter FAQ
     * block is copy — it renders as `<FAQItem>` on the page AND as FAQPage JSON-LD in the head —
     * but it is not in `doc.body`, so a dropped accent in an answer went through unseen. The
     * exclamation gate already counts frontmatter FAQs as their own zone for the same reason.
     */
    const localeCopy = (doc: (typeof ALL)[number]): string =>
        [ownProse(doc), ...(doc.frontmatter.faqs ?? []).flatMap((faq) => [faq.question, faq.answer])].join('\n')

    it('never drops an accent in a Spanish or Portuguese page', () => {
        for (const doc of ALL) {
            const hits = findDroppedDiacritics(localeCopy(doc), doc.locale)
            expect(
                hits.map((hit) => `"${hit.found}" → "${hit.expected}"`).join(', '),
                `${doc.collection}/${doc.slug}/${doc.locale}.md: a dropped diacritic reads as a page nobody who speaks the language has read`
            ).toBe('')
        }
    })

    /** The gate is only worth having if a locale page is actually reaching it. */
    it('runs over at least one page in each translated locale', () => {
        for (const locale of INDEXED_LOCALES) {
            if (locale === 'en') continue
            expect(
                ALL.some((doc) => doc.locale === locale),
                `no ${locale} page exists, so the diacritic gate covers nothing in that language`
            ).toBe(true)
        }
    })
})

/**
 * The locale plumbing, asserted against the tree rather than against a fixture: every translation
 * on disk is reachable at a locale-prefixed URL, advertises its siblings, and none of it moves the
 * English URLs.
 */
describe('locale routing', () => {
    it('serves English from the bare path and every translation from one prefixed segment', () => {
        for (const doc of ALL) {
            const base = basePathFor(doc.collection, doc.slug)
            if (doc.locale === 'en') {
                expect(doc.href, `${doc.slug}: English must not move off its bare path`).toBe(base)
                continue
            }
            expect(doc.href).toBe(`/${doc.locale}${base}`)
            // Exactly one segment of locale in front of the English slug, which is never translated.
            expect(doc.href.split('/')[1]).toBe(doc.locale)
            expect(doc.href.endsWith(base)).toBe(true)
        }
    })

    /** A locale with no file for a slug has no page there — not an English body at a Spanish URL. */
    it('404s a locale a page was never translated into', () => {
        for (const collection of COLLECTIONS) {
            for (const slug of listSlugs(collection)) {
                const present = localesForSlug(collection, slug)
                const presentSet = new Set<string>(present)
                for (const locale of LOCALES) {
                    if (presentSet.has(locale)) continue
                    expect(getDoc(collection, slug, locale), `${slug}/${locale}.md does not exist`).toBeNull()
                }
            }
        }
    })

    /**
     * hreflang reciprocity. Google honours the map only when every variant of a page advertises
     * every other one, so the set is derived from the files rather than from the locale list, and
     * it has to come out identical whichever variant is asked.
     */
    it('advertises a mutual hreflang set, in BCP 47 casing, from every variant', () => {
        for (const collection of COLLECTIONS) {
            for (const slug of listSlugs(collection)) {
                const available = localesForSlug(collection, slug)
                const languages = hreflangAlternates(basePathFor(collection, slug), available)
                if (available.length < 2) {
                    expect(languages, `${slug}: one language is not a set of alternates`).toBeUndefined()
                    continue
                }
                for (const locale of available) {
                    expect(languages, `${slug}: ${locale} missing from its own hreflang set`).toHaveProperty(
                        HREFLANG[locale]
                    )
                    expect(languages![HREFLANG[locale]]).toBe(localizedPath(basePathFor(collection, slug), locale))
                }
                // x-default is the English URL and only exists when English does.
                expect(HREFLANG.en in languages!).toBe(available.includes('en'))
                expect('x-default' in languages!).toBe(available.includes('en'))
                if (available.includes('en')) {
                    expect(languages!['x-default']).toBe(basePathFor(collection, slug))
                }
            }
        }
    })

    /**
     * The sitemap is the only place a translation is announced to a crawler, so every published
     * one has to be in it, carrying the alternates that say what it is a translation of.
     */
    it('lists every published translation in the sitemap, with its alternates', () => {
        const entries = sitemap()
        const byUrl = new Map(entries.map((entry) => [entry.url, entry]))

        // The routed set, not ALL: a draft is deliberately absent from the sitemap.
        for (const doc of listAllTranslations()) {
            const url = absoluteUrl(doc.frontmatter.canonical ?? doc.href)
            const entry = byUrl.get(url)
            expect(entry, `${doc.collection}/${doc.slug}/${doc.locale}.md is missing from the sitemap`).toBeDefined()

            const available = localesForSlug(doc.collection, doc.slug)
            if (available.length < 2) continue
            expect(
                entry!.alternates?.languages,
                `${doc.href} is listed without saying what it translates`
            ).toBeDefined()
            // Next types `languages` as a map over the codes it knows; ours are looked up by
            // hreflang value, which is a plain string as far as that type is concerned.
            const languages = entry!.alternates!.languages as Record<string, string>
            for (const locale of available) {
                expect(languages[HREFLANG[locale]]).toBe(
                    absoluteUrl(localizedPath(basePathFor(doc.collection, doc.slug), locale))
                )
            }
        }
    })

    /** No page is kept out of the index — the whole point of one URL per language. */
    it('sitemaps every locale of the guides hub and nothing twice', () => {
        const urls = sitemap().map((entry) => entry.url)
        for (const locale of INDEXED_LOCALES) {
            expect(urls).toContain(absoluteUrl(localizedPath('/blog', locale)))
        }
        expect(new Set(urls).size).toBe(urls.length)
    })
})

/** §4.1 — the only approved shapes for the one concession section a page carries, per locale. */
const CONCESSION_TITLE: Record<IndexedLocale, RegExp> = {
    en: /^When .+ (?:is the better tool|still wins)$/,
    'es-419': /^Cuando .+ es la mejor herramienta$/,
    'pt-br': /^Quando .+ é a melhor ferramenta$/,
}

/**
 * §8.1's objection, in each language's own household. Whole words, because unanchored `loo` sits
 * inside "floor" and a page about floor area says that in its first line.
 */
const COMMUNAL_SPACE: Record<IndexedLocale, RegExp> = {
    en: /\b(?:loo|lights|kitchen)\b/i,
    'es-419': /\b(?:baño|luces|cocina)\b/i,
    'pt-br': /\b(?:banheiro|luz|cozinha)\b/i,
}

/**
 * Every tool page the site serves: its id, the tool in that language, and the language.
 *
 * The mechanical gates run over this rather than over `TOOLS`, because a translated calculator is
 * a published page and a 70-character Spanish title is exactly the kind of thing nobody re-reads.
 * What stays on the English set is the handful of rules that are English grammar — §3.18's "just",
 * the own-voice question count — which have no meaning in the other two languages.
 */
const TOOL_PAGES = INDEXED_LOCALES.flatMap((locale) =>
    toolsIn(locale).map((tool) => [`${tool.slug}/${locale}`, tool, locale] as const)
)

/**
 * The country pages, in the same shape: they are tool pages at their own URLs, so every mechanical
 * gate reads them too. They have no locale dimension by construction — the family is English — so
 * the routing and hreflang tests below keep to `TOOL_PAGES`.
 */
const COUNTRY_PAGES: (readonly [string, Tool, IndexedLocale])[] = MILEAGE_COUNTRY_PAGES.map((page) => [
    page.path.slice(1),
    page.tool,
    'en',
])

/** Every page the site renders from a tool config. What the mechanical gates run over. */
const GATED_PAGES = [...TOOL_PAGES, ...COUNTRY_PAGES]

/** The same list minus English, paired with the ENGLISH tool — the source a translation answers to. */
const TRANSLATED_TOOLS = TOOLS.flatMap((tool) =>
    toolLocales(tool)
        .filter((locale) => locale !== DEFAULT_LOCALE)
        .map((locale) => [`${tool.slug}/${locale}`, tool, locale] as const)
)

describe('tool registry', () => {
    /** A chip wears its option's label, so a preset pointing at nothing renders a button with no words. */
    it('points every preset at an option that exists', () => {
        for (const tool of TOOLS) {
            for (const preset of tool.presets ?? []) {
                const choice = tool.choices?.find((entry) => entry.name === preset.choiceName)
                expect(
                    choice?.options.some((option) => option.value === preset.optionValue),
                    `${tool.slug}: preset ${preset.choiceName}/${preset.optionValue} names no option`
                ).toBe(true)
            }
        }
    })

    it('gives every tool a slug that a route can serve', () => {
        for (const tool of TOOLS) {
            expect(tool.slug, `${tool.slug} is not a slug`).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
            expect(tool.updated, `${tool.slug} updated`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        }
        expect(new Set(TOOLS.map((tool) => tool.slug)).size).toBe(TOOLS.length)
    })

    /**
     * Tools and root-level articles share the `/[page]` segment, so a slug in both is two pages
     * fighting over one URL. `static-pages.ts` reserves the tool slugs, which is what makes the
     * loader hide a colliding markdown file — this is the assertion that the reservation happened,
     * because a tool added without it would take a URL an article is already listed at.
     */
    it('reserves every tool slug against the content tree', () => {
        for (const tool of TOOLS) {
            expect(staticPageSlugs.has(tool.slug), `${tool.slug} is not reserved`).toBe(true)
            for (const collection of ROOT_COLLECTIONS) {
                for (const locale of INDEXED_LOCALES) {
                    expect(listSlugs(collection, locale), `${tool.slug} collides with ${collection}`).not.toContain(
                        tool.slug
                    )
                }
            }
        }
    })

    it.each(GATED_PAGES)('keeps %s inside what Google renders', (id, tool) => {
        expect(pageTitle(tool.meta.title).length, `${id} title too long`).toBeLessThanOrEqual(60)
        expect(tool.meta.description.length, `${id} description too long`).toBeLessThanOrEqual(160)
    })

    it('asks for every field once, and only for fields it uses', () => {
        for (const tool of TOOLS) {
            // The builder shares the field namespace because the calculator holds every typed
            // value in one record — two fields called `rate` would be one box wearing two labels.
            const names = [...tool.fields, ...(tool.rows?.columns ?? []), ...(tool.builder?.fields ?? [])] //
                .map((field) => field.name)
            expect(new Set(names).size, `${tool.slug} declares a field name twice`).toBe(names.length)

            if (!tool.rows) continue
            const count = tool.fields.find((field) => field.name === tool.rows?.countField)
            expect(count?.kind, `${tool.slug}: rows.countField must name a count field`).toBe('count')
            // A room holds up to twenty people (product-truths.md#room-size-20), and a table of a
            // hundred rows is a page promising something the product does not do.
            expect(count?.max, `${tool.slug}: the row count must be capped at twenty`).toBeLessThanOrEqual(20)
        }
    })

    /**
     * A slider with no labels is a number from one to five with no units, which is worse than a
     * box. The labels are the control, so they are required and the default has to be one of them.
     */
    it('labels every notch of a slider it offers', () => {
        for (const tool of TOOLS) {
            const scales = [...tool.fields, ...(tool.rows?.columns ?? [])].filter((f) => f.kind === 'scale')
            for (const field of scales) {
                const notches = field.notches ?? []
                expect(notches.length, `${tool.slug}: ${field.name} is a slider with no labels`).toBeGreaterThanOrEqual(2) // prettier-ignore
                expect(new Set(notches).size, `${tool.slug}: ${field.name} labels a notch twice`).toBe(notches.length)
                expect(field.defaultValue, `${tool.slug}: ${field.name} starts off its own scale`) //
                    .toBeGreaterThanOrEqual(1)
                expect(field.defaultValue, `${tool.slug}: ${field.name} starts off its own scale`) //
                    .toBeLessThanOrEqual(notches.length)
            }
        }
    })

    /**
     * The builder writes into an existing field rather than into `compute`, so the one thing that
     * can silently break it is a renamed target: the button would then write a key nothing reads
     * and the reader would watch their own arithmetic be ignored.
     */
    it('builds into a field the tool actually asks for', () => {
        for (const tool of TOOLS) {
            if (!tool.builder) continue
            const target = tool.fields.find((field) => field.name === tool.builder?.target)
            expect(target?.kind, `${tool.slug}: the builder writes into a number field or nowhere`).toBe('number')
            expect(tool.builder.fields.length, `${tool.slug}: a builder with no fields`).toBeGreaterThan(0)

            // Every input empty is the state a reader who opened the fold and stopped is in, and
            // it has to produce a number rather than NaN — the fold prints it live.
            const empty = tool.builder.derive({})
            expect(Number.isFinite(empty.floor), `${tool.slug}: an empty builder floor`).toBe(true)
            expect(Number.isFinite(empty.total), `${tool.slug}: an empty builder total`).toBe(true)
        }
    })

    /**
     * Row by row, because the first dataset here is a rate per country and the sources are one per
     * country. A set-level citation would have said where one of them came from.
     */
    it('carries the provenance of any data it reads', () => {
        for (const tool of TOOLS) {
            if (!tool.data) continue
            expect(tool.data.retrievedAt, `${tool.slug} data retrievedAt`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
            expect(tool.data.version, `${tool.slug} data version`).toBeTruthy()
            expect(tool.data.rows.length, `${tool.slug} declares data with no rows`).toBeGreaterThan(0)
            for (const row of tool.data.rows) {
                expect(row.sourceUrl, `${tool.slug}: a data row cites no page`).toMatch(/^https:\/\//)
            }
        }
    })

    /**
     * A picker starts on one of its own options and every option is distinct. Starting on a value
     * no option carries would render an empty select whose pre-fills never ran — the rate box would
     * hold one country's number under another country's name.
     */
    it('starts every picker on an option it offers', () => {
        for (const tool of TOOLS) {
            for (const choice of tool.choices ?? []) {
                const values = choice.options.map((option) => option.value)
                expect(values, `${tool.slug}: ${choice.name} starts on nothing`).toContain(choice.defaultValue)
                expect(new Set(values).size, `${tool.slug}: ${choice.name} offers a value twice`).toBe(values.length)
                for (const option of choice.options) {
                    if (!option.source) continue
                    expect(option.source.href, `${tool.slug}: ${option.value} source`).toMatch(/^https:\/\//)
                }
            }
        }
    })

    /**
     * Same rot an article's `<RelatedLink>` has, and the same check: a renamed slug 404s, and a
     * calculator's onward links are the only thing on the page nothing else would notice breaking.
     */
    it('only links onward to pages that exist', () => {
        const known = new Set<string>([
            ...INDEXED_LOCALES.flatMap((locale) => ['/', '/new', '/blog'].map((path) => localizedPath(path, locale))),
            ...listAllTranslations().map((doc) => doc.href),
            ...[...staticPageSlugs].map((slug) => `/${slug}`),
            ...TOOLS.flatMap((tool) => toolLocales(tool).map((locale) => toolPath(tool, locale))),
        ])
        for (const [id, tool] of GATED_PAGES) {
            for (const link of tool.related ?? []) {
                expect(known.has(link.href), `${id} links to missing ${link.href}`).toBe(true)
                expect(link.label.length, `${id}: ${link.href} has no label`).toBeGreaterThan(0)
            }
        }
    })

    it('answers real questions, once each', () => {
        for (const tool of TOOLS) {
            expect(tool.faqs.length, `${tool.slug} has no FAQ`).toBeGreaterThanOrEqual(2)
            const questions = tool.faqs.map((faq) => faq.question)
            expect(new Set(questions).size, `${tool.slug} asks the same question twice`).toBe(questions.length)
            for (const faq of tool.faqs) expect(faq.answer.length, `${tool.slug}: ${faq.question}`).toBeGreaterThan(20)
        }
    })
})

/**
 * The per-country mileage pages. Their copy is gated with every other tool page above; what is
 * left here is the family itself — which rows get one, where they are listed, and what happens to
 * a URL that looks like one and is not.
 */
describe('mileage country pages', () => {
    const byCode = new Set(MILEAGE_COUNTRY_PAGES.map((page) => page.row.code))

    /** The data decides. A row with no single official figure would title a page after nothing. */
    it.each(MILEAGE_RATES.map((row) => [row.code, row] as const))('gives %s a page iff it has a rate', (code, row) => {
        expect(byCode.has(code), `${code}: a page exists iff the row carries a rate`).toBe(row.rate !== null)
    })

    it('lists exactly those pages in the sitemap, ranked with the calculator', () => {
        const prefix = absoluteUrl(`/${mileageSplitCalculator.slug}/`)
        const listed = sitemap().filter((entry) => entry.url.startsWith(prefix))
        expect(listed.map((entry) => entry.url).sort()).toEqual(
            MILEAGE_COUNTRY_PAGES.map((page) => absoluteUrl(page.path)).sort()
        )
        for (const entry of listed) {
            expect(entry.priority, `${entry.url} is not ranked with the tools`).toBe(0.8)
            // English only: an alternates map here would advertise a page that does not exist.
            expect(entry.alternates?.languages, `${entry.url} advertises a translation`).toBeUndefined()
        }
    })

    /** What `dynamicParams = false` 404s, asserted on the lookup the route and the OG card share. */
    it('resolves a country page only under its own calculator', () => {
        expect(getToolCountry(mileageSplitCalculator.slug, 'uk')?.path).toBe('/mileage-split-calculator/uk')
        expect(getToolCountry(mileageSplitCalculator.slug, 'narnia')).toBeNull()
        expect(getToolCountry(mileageSplitCalculator.slug, 'brazil')).toBeNull()
        expect(getToolCountry('rent-split-calculator', 'uk')).toBeNull()
        expect(getToolCountry(undefined, undefined)).toBeNull()
    })

    /**
     * A country page sits one segment under a slug the content tree is already kept off, so the
     * collision it can still have is with itself or with a page at the same URL.
     */
    it('never takes a URL another page owns', () => {
        const owned = new Set<string>([
            ...listAllTranslations().map((doc) => doc.href),
            ...[...staticPageSlugs].map((slug) => `/${slug}`),
            ...TOOLS.flatMap((tool) => toolLocales(tool).map((locale) => toolPath(tool, locale))),
            ...SPLIT_CONTENT_INDEX_RELEASED_PATHS,
        ])
        const paths = MILEAGE_COUNTRY_PAGES.map((page) => page.path)
        expect(new Set(paths).size, 'two countries claim one URL').toBe(paths.length)
        for (const page of MILEAGE_COUNTRY_PAGES) {
            expect(owned.has(page.path), `${page.path} is already served by something else`).toBe(false)
            expect(page.slug, `${page.slug} is not a slug`).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
            // `opengraph-image` is Next's own name inside this folder, and the picker's escape
            // hatch is not a country.
            expect(['opengraph-image', 'other'], `${page.slug} is a reserved segment`).not.toContain(page.slug)
        }
    })

    /** The list on the calculator is these pages and only these, and only in English. */
    it('is linked from the calculator it hangs under, in English only', () => {
        expect(mileageCountryLinks(mileageSplitCalculator.slug, 'en')?.links.map((link) => link.href)).toEqual(
            MILEAGE_COUNTRY_PAGES.map((page) => page.path)
        )
        expect(mileageCountryLinks(mileageSplitCalculator.slug, 'es-419')).toBeUndefined()
        expect(mileageCountryLinks('rent-split-calculator', 'en')).toBeUndefined()
        // And back the other way: every country page returns the reader to the calculator and the hub.
        for (const page of MILEAGE_COUNTRY_PAGES) {
            const hrefs = (page.tool.related ?? []).map((link) => link.href)
            expect(hrefs, `${page.path} does not link back`).toContain(`/${mileageSplitCalculator.slug}`)
            expect(hrefs, `${page.path} does not link to the hub`).toContain('/tools')
        }
    })
})

/** The locale-specific mechanical rows in stylebook §11.2, over the real translated tree. */
describe('localized content gates', () => {
    it('keeps the Settle Up brand cased, without treating a URL slug as prose', () => {
        for (const doc of ALL) {
            if (doc.locale === 'en') continue
            const prose = ownProse(doc).replace(/\/[a-z0-9][a-z0-9/-]*/g, ' ')
            expect(
                prose.match(/\bsettle up\b/)?.[0],
                `${doc.collection}/${doc.slug}/${doc.locale}.md: use “Settle Up” for the brand, or the locale's verb`
            ).toBeUndefined()
        }
    })

    it('dates every comparison against a source in the page language', () => {
        const phrase: Record<(typeof INDEXED_LOCALES)[number], RegExp> = {
            en: /checked\s+against[\s\S]{0,100}\d{4}-\d{2}-\d{2}/i,
            'es-419': /verificad[ao]s? contra[\s\S]{0,100}\d{4}-\d{2}-\d{2}/i,
            'pt-br': /conferid[ao]s? (?:contra|no)[\s\S]{0,120}\d{4}-\d{2}-\d{2}/i,
        }
        for (const doc of ALL) {
            if (doc.collection !== 'alternatives') continue
            expect(
                phrase[doc.locale].test(doc.body),
                `${doc.collection}/${doc.slug}/${doc.locale}.md: comparison needs a locale-correct source check phrase and ISO date`
            ).toBe(true)
        }
    })

    it('does not lead a Brazilian Portuguese heading with an absence', () => {
        for (const doc of ALL) {
            if (doc.locale !== 'pt-br') continue
            const headings = [
                doc.frontmatter.title,
                doc.frontmatter.description,
                ...[...doc.body.matchAll(/^#{1,6}\s+(.+)$/gm)].map((match) => match[1]),
            ]
            for (const heading of headings) {
                expect(
                    /^Sem\s/.test(heading),
                    `${doc.collection}/${doc.slug}/${doc.locale}.md: lead with what the reader gets, not “Sem …”`
                ).toBe(false)
            }
        }
    })
})

describe('tool style gate', () => {
    it.each(STYLE_RULES.map((rule) => [rule.id, rule] as const))('never says %s', (_id, rule) => {
        for (const [id, tool, locale] of GATED_PAGES) {
            if (rule.locales && !rule.locales.includes(locale)) continue
            const subject =
                rule.target === 'meta' ? `${tool.meta.title} ${tool.meta.description}` : toolStrings(tool).join('\n')
            expect(subject.match(rule.pattern)?.[0], `${id}: ${rule.why}`).toBeUndefined()
        }
    })

    /**
     * Stricter than an article, and the reason is arithmetic. §3.13 allows one interjection per
     * page and §11.2 forbids an exclamation mark anywhere near a number, in metadata, in a
     * heading, in a table cell, in a CTA or in an FAQ. A calculator page is numbers, headings,
     * table cells, a CTA and an FAQ — there is nowhere left for the interjection to stand.
     */
    it('spends no exclamation mark at all', () => {
        for (const [id, tool] of GATED_PAGES) {
            for (const line of toolStrings(tool)) {
                expect(line.includes('!'), `${id}: "${line}" — a tool page has nowhere to put one (§11.2)`) //
                    .toBe(false)
            }
        }
    })

    it('only uses "just" as the first word of a sentence', () => {
        for (const tool of TOOLS) {
            for (const line of toolStrings(tool)) {
                expect(
                    line.match(MID_SENTENCE_JUST)?.[0],
                    `${tool.slug}: mid-sentence "just" minimises what it describes (§3.18)`
                ).toBeUndefined()
            }
        }
    })

    /** §3.18 is off in the flat families (§3.10), and capped at one everywhere else. */
    it('opens at most one sentence with "Just", and none on a flat page', () => {
        for (const tool of TOOLS) {
            const count = (toolStrings(tool).join('\n').match(SENTENCE_INITIAL_JUST) ?? []).length
            expect(count, `${tool.slug}: "Just …" is the closing beat of relief (§3.18) — a page gets one`) //
                .toBeLessThanOrEqual(tool.register === 'flat' ? 0 : 1)
        }
    })

    /**
     * §3.17/§10.1: the product enters by its only approved full name once and is "Split"
     * everywhere after.
     */
    it('names the product in full once, then calls it Split', () => {
        for (const [id, tool] of GATED_PAGES) {
            const count = (
                toolStrings(tool)
                    .join('\n')
                    .match(/Peanut Split/g) ?? []
            ).length
            expect(count, `${id}: the product enters by name once (§3.17)`).toBeLessThanOrEqual(1)
        }
    })

    /**
     * §6.16.1, and the tool's one allowance is spent before it starts: §8.1 requires the fairness
     * pages to put the communal-space objection in the reader's own words, and the reader asks it
     * as a question. The FAQ is dropped first — a `faqTitle` of "Questions" is the clue that those
     * are the reader's, not ours.
     */
    it('asks at most one question in its own voice', () => {
        for (const tool of TOOLS) {
            const answered = new Set(tool.faqs.flatMap((faq) => [faq.question, faq.answer]))
            const asked = ownVoiceQuestions(
                toolStrings(tool)
                    .filter((line) => !answered.has(line))
                    .join('\n')
            )
            expect(
                asked.length,
                `${tool.slug}: ${asked.map((q) => `"${q}"`).join(' / ')} — a question standing in front of its own answer is a transition (§6.16.1)`
            ).toBeLessThanOrEqual(1)
        }
    })

    /** §4.1: one concession, and its title names the tool that wins rather than what we lack. */
    it('concedes to something named, in the approved words', () => {
        for (const [id, tool, locale] of GATED_PAGES) {
            expect(tool.copy.concession.title, `${id}: see §4.1 for the approved titles`).toMatch(
                CONCESSION_TITLE[locale]
            )
            expect(tool.copy.concession.body.length, `${id}: the concession is empty`).toBeGreaterThan(40)
        }
    })

    /**
     * §8.1: a usage-weighted tool that ignores the communal-space objection reads as absurd to the
     * exact reader it is for.
     *
     * Rent and utilities only. The objection is about a household — the loo, the lights, the
     * kitchen are things flatmates share and one of them uses more — so it belongs on the surfaces
     * that divide a home. `fair-split` used to be in this list and matched anything with those two
     * words in its slug, including a routing hub whose job is to send the reader to the right
     * calculator; that page was carrying a mandatory paragraph about a flat it never describes.
     * A page may still make the argument, and the fairness pages do. It is required here.
     *
     * The words are whole words. Unanchored, `loo` sits inside "floor" — and a page about floor
     * area says that in the first line, so the gate passed on the phrase it exists to require.
     */
    it('pre-empts the communal-space objection on a fairness page', () => {
        for (const [id, tool, locale] of TOOL_PAGES) {
            if (!/rent-split|utilities|alquiler|habitaciones/.test(tool.slug)) continue
            expect(
                COMMUNAL_SPACE[locale].test(toolStrings(tool).join('\n')),
                `${id}: name the objection and give the boundary (§8.1)`
            ).toBe(true)
        }
    })
})

/**
 * The locale dimension on a tool, held to the contract an article's already is: one URL per
 * language, canonical to itself, and hreflang listing exactly the translations that exist.
 */
describe('tool locales', () => {
    it.each(TOOLS.map((tool) => [tool.slug, tool] as const))(
        '%s is routed, sitemapped and advertised in the same set of languages',
        (slug, tool) => {
            const locales = toolLocales(tool)
            expect(locales, `${slug} lost its English source`).toContain(DEFAULT_LOCALE)
            const byUrl = new Map(sitemap().map((entry) => [entry.url, entry]))

            for (const locale of INDEXED_LOCALES) {
                const published = locales.includes(locale)
                const entry = byUrl.get(absoluteUrl(toolPath(tool, locale)))
                // Routing and the sitemap are the same answer twice: a sitemapped URL that does
                // not route is a crawler sent to a 404, and a routed URL nobody lists is invisible.
                expect(getTool(slug, locale) !== null, `${slug}/${locale} routes`).toBe(published)
                expect(entry !== undefined, `${slug}/${locale} is sitemapped`).toBe(published)
                if (!entry) continue

                const languages = (entry.alternates?.languages ?? {}) as Record<string, string>
                expect(Object.keys(languages).sort(), `${slug}/${locale} advertises the wrong set`).toEqual(
                    [...locales.map((other) => HREFLANG[other]), 'x-default'].sort()
                )
                for (const other of locales) {
                    expect(languages[HREFLANG[other]]).toBe(absoluteUrl(toolPath(tool, other)))
                }
                // x-default is the bare English URL, spelled the way `hreflangAlternates` spells it.
                expect(languages['x-default']).toBe(absoluteUrl(`/${tool.slug}`))
            }
        }
    )

    it.each(TOOL_PAGES)("%s canonicalises to itself and carries the sitemap's alternates", (id, tool, locale) => {
        const alternates = toolMetadata(tool, locale).alternates
        expect(alternates?.canonical, id).toBe(absoluteUrl(toolPath(tool, locale)))
        const languages = (alternates?.languages ?? {}) as Record<string, string>
        expect(languages[HREFLANG[locale]], `${id}: missing from its own hreflang set`).toBe(
            absoluteUrl(toolPath(tool, locale))
        )
    })

    /**
     * A translation says everything the English tool says. Structure is shared, so the one way a
     * localized page comes out half-written is a missing key — an unlabelled field, an option with
     * no note, a phrase `compute` reaches for and does not find — and each of those renders as a
     * gap or as English at a translated URL.
     *
     * Compared against the English string rather than against emptiness, because `registry.ts`
     * fills a missing key with the English one: an assertion that the label is truthy passes on
     * the very fallback `ToolWords` says never happens.
     */
    it.each(TRANSLATED_TOOLS)('%s says everything the English tool says', (id, source, locale) => {
        const said = getTool(source.slug, locale)
        expect(said, `${id} does not route`).not.toBeNull()
        const twin = said as Tool

        const allFields = (tool: Tool): ToolField[] => [
            ...tool.fields,
            ...(tool.rows?.columns ?? []),
            ...(tool.builder?.fields ?? []),
        ]
        for (const field of allFields(source)) {
            const mirrored = allFields(twin).find((entry) => entry.name === field.name)
            expect(mirrored?.label, `${id}: field ${field.name} is still English`).not.toBe(field.label)
            expect(Boolean(mirrored?.help), `${id}: field ${field.name} help`).toBe(Boolean(field.help))
            expect(Boolean(mirrored?.unit), `${id}: field ${field.name} unit`).toBe(Boolean(field.unit))
            expect(mirrored?.notches?.length ?? 0, `${id}: field ${field.name} notches`).toBe(
                field.notches?.length ?? 0
            )
        }

        for (const choice of source.choices ?? []) {
            const mirrored = twin.choices?.find((entry) => entry.name === choice.name)
            expect(mirrored?.label, `${id}: picker ${choice.name} is still English`).not.toBe(choice.label)
            for (const option of choice.options) {
                const localized = mirrored?.options.find((entry) => entry.value === option.value)
                expect(localized?.label, `${id}: ${option.value} is still English`).not.toBe(option.label)
                expect(Boolean(localized?.note), `${id}: ${option.value} note`).toBe(Boolean(option.note))
                expect(localized?.note, `${id}: ${option.value} note is still English`).not.toBe(option.note)
                // Provenance and money are evidence, not copy: both stay exactly as published.
                expect(localized?.source, `${id}: ${option.value} lost its source`).toEqual(option.source)
                expect(localized?.currency, `${id}: ${option.value} changed currency`).toBe(option.currency)
            }
        }

        expect(Object.keys(twin.phrases).sort(), `${id}: compute would print a blank`).toEqual(
            Object.keys(source.phrases).sort()
        )
        // And the placeholders inside them: a translated `{unit}` is a literal `{unidad}` on the
        // page, because `fill()` leaves what it cannot resolve standing.
        for (const [key, template] of Object.entries(source.phrases)) {
            expect(placeholders(twin.phrases[key]), `${id}: phrase ${key} moved a placeholder`).toEqual(
                placeholders(template)
            )
        }
        expect(twin.faqs.length, `${id}: too few questions`).toBeGreaterThanOrEqual(2)
        expect(Boolean(twin.copy.method), `${id}: §8.1 method note`).toBe(Boolean(source.copy.method))
    })

    /** The same rule the content tree runs on: a page nobody who speaks the language has read. */
    it.each(TRANSLATED_TOOLS)('%s never drops an accent', (id, source, locale) => {
        const hits = findDroppedDiacritics(toolStrings(getTool(source.slug, locale) as Tool).join('\n'), locale)
        expect(hits.map((hit) => `"${hit.found}" \u2192 "${hit.expected}"`).join(', '), id).toBe('')
    })
})

describe('cast references', () => {
    /**
     * A mistyped character name would render the caption with no drawing beside it — a gap nothing
     * reports, because `<Cast>` deliberately does not throw. This is the gate.
     */
    it('only names characters that exist', () => {
        for (const doc of ALL) {
            for (const [, name] of doc.body.matchAll(/<Cast[^>]*\bname="([^"]*)"/g)) {
                expect(
                    isCastName(name),
                    `${doc.slug} names "${name}", which is not in the cast — pick one of: ${CAST_NAMES.join(', ')}`
                ).toBe(true)
            }
        }
    })

    /** An unknown size falls back to the CSS default, which is the picker's 32px — too small to read. */
    it('draws the cast at a size the component knows', () => {
        for (const doc of ALL) {
            for (const [, size] of doc.body.matchAll(/<Cast[^>]*\bsize="([^"]*)"/g)) {
                expect(['sm', 'md', 'lg'], `${doc.slug} draws a cast member at size="${size}"`).toContain(size)
            }
        }
    })
})

describe('claims gate', () => {
    /**
     * Stylebook §7.5: every product number cites a `claims:` ID, every competitor fact a
     * `competitorClaims:` ID, and a claim with no ID does not ship. The generated pipeline has
     * enforced this since it existed (mono `scripts/split-content.mjs`); this is the same gate for
     * the native corpus. The truth files are the register: a claim heading in `product-truths.md`,
     * a backticked id in the `competitor-claims.md` tables. An ID that resolves in neither is a
     * fact the page asserts and nobody can defend.
     */
    const systemDir = path.join(process.cwd(), 'src/content/_system')
    const idPattern = '[a-z0-9]+(?:-[a-z0-9]+)*'
    const productTruthIds = new Set(
        [
            ...fs
                .readFileSync(path.join(systemDir, 'product-truths.md'), 'utf8')
                .matchAll(new RegExp(`^## (${idPattern})$`, 'gm')),
        ].map((m) => m[1])
    )
    const competitorClaimIds = new Set(
        [
            ...fs
                .readFileSync(path.join(systemDir, 'competitor-claims.md'), 'utf8')
                .matchAll(new RegExp(`^\\| \`(${idPattern})\``, 'gm')),
        ].map((m) => m[1])
    )

    /** An empty register would make every resolution test below pass vacuously. */
    it('reads a non-empty register from both truth files', () => {
        expect(productTruthIds.size).toBeGreaterThan(0)
        expect(competitorClaimIds.size).toBeGreaterThan(0)
    })

    it('resolves every claims ID against product-truths.md', () => {
        for (const doc of ALL) {
            for (const id of doc.frontmatter.claims ?? []) {
                expect(
                    productTruthIds.has(id),
                    `${doc.collection}/${doc.slug}/${doc.locale}.md cites claims ID "${id}", which is not a heading in _system/product-truths.md`
                ).toBe(true)
            }
        }
    })

    it('resolves every competitorClaims ID against competitor-claims.md', () => {
        for (const doc of ALL) {
            for (const id of doc.frontmatter.competitorClaims ?? []) {
                expect(
                    competitorClaimIds.has(id),
                    `${doc.collection}/${doc.slug}/${doc.locale}.md cites competitorClaims ID "${id}", which is not a row in _system/competitor-claims.md`
                ).toBe(true)
            }
        }
    })

    /** §11.3 knows four page types. A fifth is a typo, and a typo'd type dodges every typed gate. */
    it('only uses stylebook page types', () => {
        for (const doc of ALL) {
            if (doc.frontmatter.type === undefined) continue
            expect(
                ['capture', 'comparison', 'editorial', 'guide'],
                `${doc.collection}/${doc.slug}/${doc.locale}.md has an unknown type`
            ).toContain(doc.frontmatter.type)
        }
    })

    /** §11.3 requires the `claims` key on all four page types. */
    it('declares claims on every typed page', () => {
        for (const doc of ALL) {
            if (doc.frontmatter.type === undefined) continue
            expect(
                doc.frontmatter.claims?.length,
                `${doc.collection}/${doc.slug}/${doc.locale}.md is type: ${doc.frontmatter.type} but declares no claims (§11.3)`
            ).toBeGreaterThan(0)
        }
    })

    /**
     * Every alternatives page is a comparison — that is what the collection is for — and the
     * competitorClaims requirement below binds by type, so an alternatives page that omitted its
     * type would silently leave the gate.
     */
    it('types every alternatives page as a comparison', () => {
        for (const doc of ALL.filter((doc) => doc.collection === 'alternatives')) {
            expect(doc.frontmatter.type, `alternatives/${doc.slug}/${doc.locale}.md is not typed as a comparison`).toBe(
                'comparison'
            )
        }
    })

    /** The audit's HIGH: a comparison asserting competitor facts with no register row behind them. */
    it('requires competitorClaims on every comparison', () => {
        for (const doc of ALL) {
            if (doc.frontmatter.type !== 'comparison') continue
            expect(
                doc.frontmatter.competitorClaims?.length,
                `${doc.collection}/${doc.slug}/${doc.locale}.md is a comparison with zero competitorClaims`
            ).toBeGreaterThan(0)
        }
    })

    /**
     * A translation asserts the same facts as its English page, so it rests on the same IDs.
     * Divergence means one of the two was annotated and the other forgotten — the drift this
     * file exists to prevent.
     */
    it('keeps a translation on the same claims as its English page', () => {
        for (const doc of ALL) {
            if (doc.locale === DEFAULT_LOCALE) continue
            const en = getDoc(doc.collection, doc.slug, DEFAULT_LOCALE)
            if (!en) continue
            for (const key of ['claims', 'competitorClaims'] as const) {
                expect(
                    doc.frontmatter[key] ?? [],
                    `${doc.collection}/${doc.slug}/${doc.locale}.md declares different ${key} than en.md`
                ).toEqual(en.frontmatter[key] ?? [])
            }
        }
    })
})
