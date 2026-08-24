import { describe, expect, it } from 'vitest'
import sitemap from '@/app/sitemap'
import { ANTI_AI_STRINGS, NEVER_STRINGS } from '@/lib/content.test'
import { listAllTranslations } from '@/lib/content'
import { marketingCacheable } from '@/lib/marketing-cache'
import { readPrefill } from '@/lib/room-prefill'
import { absoluteUrl, pageTitle } from '@/lib/seo'
import { staticPageSlugs } from '@/data/static-pages'
import { isDoodleName } from '@/components/ui/doodles'
import { CATALOG_BY_CODE } from '@/lib/currency-catalog'
import { TOOLS, toolPath } from '@/tools/registry'
import { templateCtaHref, templatePrefill, templateShareUrl } from './links'
import { TEMPLATES, TEMPLATES_PATH, getTemplate, templatePath } from './registry'
import { TEMPLATE_CTA_HINT, TEMPLATE_CTA_LABEL, TEMPLATE_GOOD_TO_KNOW, TEMPLATE_SETUP, TEMPLATES_HUB } from './shared'
import type { RoomTemplate } from './types'

/**
 * The template registry, held to the rules the content tree and the tool registry already pass.
 *
 * A template is a page like any other — a title Google truncates, an intro somebody wrote on a
 * Friday, an FAQ that can quietly overstate the product — and its copy lives in a `.ts` file,
 * which is exactly why it needs this. Markdown gets re-read by a human before it ships; a string
 * literal three levels inside a config does not.
 */

/** Every string a reader can see, including the ones every template shares. */
function templateStrings(template: RoomTemplate): string[] {
    const { copy } = template
    return [
        template.meta.title,
        template.meta.description,
        template.room.name,
        copy.h1,
        ...copy.intro,
        copy.lines.title,
        copy.lines.intro,
        ...copy.lines.items,
        copy.concession.title,
        copy.concession.body,
        copy.ctaTitle,
        ...(template.related ?? []).map((link) => link.label),
        ...template.faqs.flatMap((faq) => [faq.question, faq.answer]),
        TEMPLATE_CTA_LABEL,
        TEMPLATE_CTA_HINT,
        TEMPLATE_GOOD_TO_KNOW.title,
        ...TEMPLATE_GOOD_TO_KNOW.body,
        ...Object.values(TEMPLATE_SETUP),
    ]
}

/** The page's own voice: the FAQ is the reader's questions, and a heading is navigation. */
const proseOf = (template: RoomTemplate): string =>
    [
        template.meta.description,
        ...template.copy.intro,
        template.copy.lines.intro,
        ...template.copy.lines.items,
        template.copy.concession.body,
        ...TEMPLATE_GOOD_TO_KNOW.body,
        TEMPLATE_SETUP.hint,
    ].join('\n')

const each = TEMPLATES.map((template) => [template.slug, template] as const)

describe('template registry', () => {
    it('gives every template a slug a route can serve, once', () => {
        const slugs = TEMPLATES.map((template) => template.slug)
        expect(new Set(slugs).size).toBe(slugs.length)
        for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    })

    it('lives under one reserved segment, so no article can shadow it', () => {
        expect(staticPageSlugs.has('t')).toBe(true)
        expect(TEMPLATES_PATH).toBe('/t')
        for (const template of TEMPLATES) expect(templatePath(template)).toBe(`/t/${template.slug}`)
    })

    it('returns null for an unknown slug', () => {
        expect(getTemplate('no-such-template')).toBeNull()
        expect(getTemplate(undefined)).toBeNull()
    })

    it.each(each)('%s opens a room the app could have created by hand', (_slug, template) => {
        expect(template.room.name.length).toBeGreaterThan(0)
        expect(template.room.name.length).toBeLessThanOrEqual(80)
        expect(isDoodleName(template.room.emblem)).toBe(true)
        if (template.room.currency) expect(CATALOG_BY_CODE.has(template.room.currency)).toBe(true)
    })

    /**
     * The link is the product here, so it is asserted end to end: what the CTA carries has to be
     * exactly what `/new` reads back off it. A prefill that silently drops on the way in would
     * leave a page promising a room it does not open.
     */
    it.each(each)('%s round-trips its prefill through /new', (_slug, template) => {
        const href = templateCtaHref(template, { utm_source: 'reddit', utm_medium: 'community' })
        const url = new URL(href, 'https://peanutsplit.com')
        expect(url.pathname).toBe('/new')
        expect(readPrefill(Object.fromEntries(url.searchParams))).toEqual(templatePrefill(template))
        expect(url.searchParams.get('utm_source')).toBe('reddit')
        // The one field a link may never fill in.
        expect(url.searchParams.get('creatorName')).toBeNull()
    })

    it('builds an absolute share link, tagged with where it is going', () => {
        expect(templateShareUrl(TEMPLATES[0], { utm_source: 'reddit', utm_campaign: 'template-flat-monthly' })).toBe(
            `${absoluteUrl(templatePath(TEMPLATES[0]))}?utm_source=reddit&utm_campaign=template-flat-monthly`
        )
    })

    it('keeps titles and descriptions inside what Google renders', () => {
        for (const meta of [...TEMPLATES.map((template) => template.meta), TEMPLATES_HUB]) {
            expect(pageTitle(meta.title).length, meta.title).toBeLessThanOrEqual(60)
            expect(meta.description.length, meta.title).toBeLessThanOrEqual(160)
        }
    })

    /** Bing ranks on the heading match; the title is where Google reads the term. */
    it.each(each)('%s carries its head term in the title and the H1', (_slug, template) => {
        const words = (text: string) =>
            text
                .toLowerCase()
                .split(/[^a-z0-9]+/)
                .filter(Boolean)
        for (const surface of [template.meta.title, template.copy.h1]) {
            const have = words(surface)
            for (const needle of words(template.headTerm)) {
                expect(
                    have.some((word) => word.startsWith(needle)),
                    `${surface} lacks "${needle}"`
                ).toBe(true)
            }
        }
    })

    it.each(each)('%s only links onward to pages that exist', (_slug, template) => {
        const known = new Set([
            ...TEMPLATES.map(templatePath),
            ...[...staticPageSlugs].map((slug) => `/${slug}`),
            ...TOOLS.map((tool) => toolPath(tool)),
            ...listAllTranslations().map((doc) => doc.href),
        ])
        for (const link of template.related ?? []) expect(known.has(link.href), link.href).toBe(true)
    })

    it.each(each)('%s answers real questions, once each', (_slug, template) => {
        const questions = template.faqs.map((faq) => faq.question)
        expect(questions.length).toBeGreaterThanOrEqual(2)
        expect(new Set(questions).size).toBe(questions.length)
        for (const faq of template.faqs) expect(faq.answer.length).toBeGreaterThan(40)
    })

    it('lists every template in the sitemap, ranked with the capture pages', () => {
        const rows = sitemap().filter((entry) => entry.url.includes('/t/'))
        expect(rows.map((row) => row.url).sort()).toEqual(
            TEMPLATES.map((template) => absoluteUrl(templatePath(template))).sort()
        )
        for (const row of rows) expect(row.priority).toBe(0.7)
        expect(sitemap().some((entry) => entry.url === absoluteUrl(TEMPLATES_PATH))).toBe(true)
    })

    it('caches the hub and the templates like the pages beside them', () => {
        expect(marketingCacheable(TEMPLATES_PATH)).toBe(true)
        expect(marketingCacheable(templatePath(TEMPLATES[0]))).toBe(true)
        expect(marketingCacheable('/new')).toBe(false)
    })
})

/**
 * The style gate, borrowed whole from the content tree rather than restated. Two lists exported by
 * `content.test.ts` are the source of truth for both — a rule added there covers a template the
 * same day it covers an article.
 */
describe('template style gate', () => {
    it.each([...NEVER_STRINGS, ...ANTI_AI_STRINGS].map((rule) => [rule.id, rule] as const))(
        'never says %s',
        (_id, rule) => {
            for (const template of TEMPLATES) {
                const subject =
                    rule.target === 'meta'
                        ? `${template.meta.title} ${template.meta.description}`
                        : templateStrings(template).join('\n')
                expect(subject.match(rule.pattern)?.[0], `${template.slug}: ${rule.why}`).toBeUndefined()
            }
        }
    )

    /** Held to more than an article: a config has no body copy, so nothing here is the §3.13 line. */
    it.each(each)('%s spends no exclamation mark', (_slug, template) => {
        expect(templateStrings(template).join('\n')).not.toContain('!')
    })

    it.each(each)('%s names the product as Split', (_slug, template) => {
        expect(templateStrings(template).join('\n')).not.toContain('Peanut Split')
    })

    it.each(each)('%s spends at most three em-dashes', (_slug, template) => {
        expect((templateStrings(template).join('\n').match(/—/g) ?? []).length).toBeLessThanOrEqual(3)
    })

    it.each(each)('%s only uses "just" as the first word of a sentence', (_slug, template) => {
        for (const line of templateStrings(template)) {
            expect(/(?:[^\s.!?\n][^.!?\n]*)\bjust\b/i.test(line), line).toBe(false)
        }
        expect(
            (
                templateStrings(template)
                    .join('\n')
                    .match(/(?:^|[.!?]\s+)Just\s/gm) ?? []
            ).length
        ).toBeLessThanOrEqual(1)
    })

    it.each(each)('%s asks at most one question in its own voice', (_slug, template) => {
        expect((proseOf(template).match(/\?/g) ?? []).length).toBeLessThanOrEqual(1)
    })

    /** §4.1: the concession names the thing that wins, and is never a defect catalogue (§4.3). */
    it.each(each)('%s titles its concession from the approved set', (_slug, template) => {
        expect(template.copy.concession.title).toMatch(/^When .+ (?:is the better tool|still wins)$/)
    })

    it('says the CTA label and its hint the way every other page says them', () => {
        expect(TEMPLATE_CTA_LABEL).toBe('Start a split')
        expect(TEMPLATE_CTA_HINT).toBe('Takes ten seconds. No email, no password, no download.')
    })
})
