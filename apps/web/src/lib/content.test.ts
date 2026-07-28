import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
    COLLECTIONS,
    getDoc,
    hrefFor,
    listAllDocs,
    listAllTranslations,
    listDocs,
    listSlugs,
    localesForSlug,
} from './content'
import { staticPageSlugs } from '@/data/static-pages'
import { LOCALES } from '@/i18n/locales'
import { localizedPath } from '@/i18n/paths'
import { pageTitle } from './seo'

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
const ALL = listAllTranslations()

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
            for (const slug of fs.readdirSync(dir)) {
                for (const file of fs.readdirSync(path.join(dir, slug))) {
                    const locale = file.replace(/\.md$/, '')
                    expect(LOCALES, `${collection}/${slug}/${file} is not a known locale`).toContain(locale)
                    expect(
                        getDoc(collection, slug, locale as (typeof LOCALES)[number]),
                        `${collection}/${slug}/${file} exists but did not parse`
                    ).not.toBeNull()
                }
            }
        }
    })

    it('publishes at least one doc per collection', () => {
        for (const collection of COLLECTIONS) {
            expect(listDocs(collection).length, `${collection} is empty`).toBeGreaterThan(0)
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
        for (const slug of listSlugs('alternatives')) {
            expect(staticPageSlugs.has(slug), `${slug} collides with a static route`).toBe(false)
        }
    })

    it('derives hrefs that match the routes', () => {
        expect(hrefFor('blog', 'foo')).toBe('/blog/foo')
        expect(hrefFor('alternatives', 'foo-alternative')).toBe('/foo-alternative')
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

        // Translations: one article fully localised, one Spanish-only draft, one English-only.
        write('blog/newer/es.md', doc('Nuevo', '2026-06-01'))
        write('blog/newer/pt-BR.md', doc('Novo', '2026-06-01'))
        write('blog/older/es.md', doc('Viejo', '2026-01-01', 'published: false\n'))

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
    })

    /**
     * The rule the whole design rests on: a missing translation is a missing page, never an
     * English body at a translated URL. Every assertion here is one that a fallback would break.
     */
    describe('translations', () => {
        it('serves each language its own file', () => {
            expect(getDoc('blog', 'newer', 'en')?.frontmatter.title).toBe('Newer')
            expect(getDoc('blog', 'newer', 'es')?.frontmatter.title).toBe('Nuevo')
            expect(getDoc('blog', 'newer', 'pt-BR')?.frontmatter.title).toBe('Novo')
        })

        it('never falls back to English for an untranslated article', () => {
            // `older` has no pt-BR file at all, and its es file is a draft.
            expect(getDoc('blog', 'older', 'pt-BR')).toBeNull()
            expect(getDoc('blog', 'older', 'es')).toBeNull()
        })

        it('lists only what exists in that language', () => {
            expect(listSlugs('blog', 'es')).toEqual(['newer'])
            expect(listSlugs('blog', 'pt-BR')).toEqual(['newer'])
        })

        it('reports the locales a slug has, in a stable order', () => {
            expect(localesForSlug('blog', 'newer')).toEqual(['en', 'es', 'pt-BR'])
            expect(localesForSlug('blog', 'dateless')).toEqual(['en'])
            expect(localesForSlug('blog', 'no-such-slug')).toEqual([])
        })

        it('prefixes non-default locales and leaves English bare', () => {
            expect(getDoc('blog', 'newer', 'en')?.href).toBe('/blog/newer')
            expect(getDoc('blog', 'newer', 'es')?.href).toBe('/es/blog/newer')
            expect(getDoc('blog', 'newer', 'pt-BR')?.href).toBe('/pt-br/blog/newer')
            expect(getDoc('alternatives', 'keep-alternative', 'en')?.href).toBe('/keep-alternative')
        })

        it('enumerates every published translation for the sitemap', () => {
            const hrefs = listAllTranslations().map((doc) => doc.href)
            expect(hrefs).toContain('/blog/newer')
            expect(hrefs).toContain('/es/blog/newer')
            expect(hrefs).toContain('/pt-br/blog/newer')
            // The Spanish draft of `older` is published:false — a live English page beside it
            // must not drag the unfinished translation into the sitemap.
            expect(hrefs).not.toContain('/es/blog/older')
            expect(new Set(hrefs).size).toBe(hrefs.length)
        })
    })
})

describe('article bodies', () => {
    /** Internal links are the only thing here that can rot silently — a renamed slug 404s. */
    it('only links internally to pages that exist', () => {
        const known = new Set<string>([
            ...LOCALES.flatMap((locale) => ['/', '/new', '/blog'].map((path) => localizedPath(path, locale))),
            ...ALL.map((doc) => doc.href),
            ...[...staticPageSlugs].map((slug) => `/${slug}`),
        ])

        for (const doc of ALL) {
            const links = [...doc.body.matchAll(/href="(\/[^"#?]*)"/g)].map((m) => m[1])
            for (const link of links) {
                expect(known.has(link), `${doc.slug} links to missing ${link}`).toBe(true)
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

    /** next-mdx-remote parses the body as MDX, so an unbalanced brace is a build failure. */
    it('has balanced custom-component tags', () => {
        const paired = ['Hero', 'CTA', 'Steps', 'Step', 'FAQ', 'FAQItem', 'Callout', 'Quote', 'Checklist', 'ChecklistItem', 'RelatedPages', 'RelatedLink'] // prettier-ignore
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
