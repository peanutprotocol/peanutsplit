import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { COLLECTIONS, getDoc, hrefFor, listAllDocs, listDocs, listSlugs } from './content'
import { staticPageSlugs } from '@/data/static-pages'
import { pageTitle } from './seo'

/**
 * These run against the real src/content/ tree rather than fixtures. That is deliberate: the
 * failure mode this engine actually has is a bad article, not a bad parser — a missing date, a
 * slug that collides with a hand-built route, an internal link to a page that was renamed. A
 * fixture directory would pass while the site 404s.
 */

const ALL = COLLECTIONS.flatMap((collection) => listDocs(collection))

describe('content tree', () => {
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
        fs.mkdirSync(path.join(root, 'src/content/blog'), { recursive: true })
        fs.mkdirSync(path.join(root, 'src/content/alternatives'), { recursive: true })
        const write = (rel: string, body: string) => fs.writeFileSync(path.join(root, 'src/content', rel), body)

        write('blog/older.md', '---\ntitle: Older\ndescription: d\ndate: 2026-01-01\n---\nbody\n')
        write('blog/newer.md', '---\ntitle: Newer\ndescription: d\ndate: 2026-06-01\n---\nbody\n')
        write('blog/draft.md', '---\ntitle: Draft\ndescription: d\ndate: 2026-06-02\npublished: false\n---\nbody\n')
        write('blog/dateless.md', '---\ntitle: Dateless\ndescription: d\n---\nbody\n')
        write('blog/broken.md', '---\ntitle: "unterminated\ndescription: d\ndate: 2026-06-03\n---\nbody\n')
        // Would be served by /new, not by the content route — must never be listed.
        write('alternatives/new.md', '---\ntitle: New\ndescription: d\ndate: 2026-06-04\n---\nbody\n')
        write('alternatives/keep-alternative.md', '---\ntitle: Keep\ndescription: d\ndate: 2026-06-05\n---\nbody\n')

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
})

describe('article bodies', () => {
    /** Internal links are the only thing here that can rot silently — a renamed slug 404s. */
    it('only links internally to pages that exist', () => {
        const known = new Set<string>([
            '/',
            '/new',
            '/blog',
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
