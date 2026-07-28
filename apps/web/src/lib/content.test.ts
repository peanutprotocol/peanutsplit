import { describe, expect, it } from 'vitest'
import { COLLECTIONS, getDoc, hrefFor, listAllDocs, listDocs, listSlugs } from './content'
import { staticPageSlugs } from '@/data/static-pages'

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

    it('keeps meta descriptions inside what Google renders', () => {
        for (const doc of ALL) {
            // Past ~160 chars the tail is truncated in the SERP, so the last clause is wasted.
            expect(doc.frontmatter.description.length, `${doc.slug} description too long`).toBeLessThanOrEqual(180)
        }
    })

    it('never lets a markdown slug shadow a hand-built route', () => {
        for (const slug of listSlugs('alternatives')) {
            expect(staticPageSlugs.has(slug), `${slug} collides with a static route`).toBe(false)
        }
    })

    it('sorts newest first and hides drafts', () => {
        const dates = listDocs('blog').map((doc) => doc.frontmatter.date)
        expect([...dates].sort((a, b) => b.localeCompare(a))).toEqual(dates)
        expect(ALL.every((doc) => doc.frontmatter.published !== false)).toBe(true)
    })

    it('derives hrefs that match the routes', () => {
        expect(hrefFor('blog', 'foo')).toBe('/blog/foo')
        expect(hrefFor('alternatives', 'foo-alternative')).toBe('/foo-alternative')
    })

    it('returns null for an unknown slug', () => {
        expect(getDoc('blog', 'no-such-article')).toBeNull()
    })

    it('lists every doc exactly once in the hub', () => {
        const hrefs = listAllDocs().map((doc) => doc.href)
        expect(new Set(hrefs).size).toBe(hrefs.length)
        expect(hrefs.length).toBe(ALL.length)
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
