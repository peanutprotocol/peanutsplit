import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    absoluteUrl,
    appBreadcrumbSchema,
    appPageMetadata,
    ARTICLE_IMAGE_URL,
    articleSchema,
    breadcrumbSchema,
    calculatorSchema,
    faqSchema,
    pageMetadata,
    pageTitle,
    siteSchema,
    SITE_DESCRIPTION,
} from './seo'
import { COLLECTIONS, listAllTranslations, listDocs } from './content'
import { CANONICAL_ORIGIN } from './domains'
import { siteUrl } from './site'
import { toolMetadata } from './tool-routes'
import { listSplitGuides } from './split-content/artifact'
import { splitGuideMetadata } from './split-content/metadata'
import { INDEXED_LOCALES } from '@/i18n/locales'
import { TOOLS } from '@/tools/registry'
import { metadata as landingMetadata } from '@/app/(product-shell)/(marketing)/page'
import { metadata as toolsHubMetadata } from '@/app/(product-shell)/(marketing)/tools/page'
import enMessages from '@/i18n/messages/en.json'
import esMessages from '@/i18n/messages/es-419.json'
import ptBrMessages from '@/i18n/messages/pt-br.json'

describe('absoluteUrl', () => {
    it('resolves public paths against the fixed canonical origin', () => {
        expect(absoluteUrl('/blog')).toBe(`${CANONICAL_ORIGIN}/blog`)
        expect(absoluteUrl('/')).toBe(CANONICAL_ORIGIN)
    })

    it('leaves an already-absolute URL alone', () => {
        expect(absoluteUrl('https://peanut.me/x')).toBe('https://peanut.me/x')
    })
})

describe('pageMetadata', () => {
    it('points canonical and OG at the same path', () => {
        const meta = pageMetadata({ title: 'T', description: 'D', path: '/blog/x' })
        expect(meta.metadataBase).toEqual(new URL(CANONICAL_ORIGIN))
        expect(meta.alternates?.canonical).toBe(`${CANONICAL_ORIGIN}/blog/x`)
        expect(meta.openGraph?.url).toBe(`${CANONICAL_ORIGIN}/blog/x`)
    })

    it('omits article timestamps on a website-type page', () => {
        const meta = pageMetadata({ title: 'T', description: 'D', path: '/blog', type: 'website' })
        expect(meta.openGraph).not.toHaveProperty('publishedTime')
    })

    it('keeps the app-owned importer canonical and breadcrumbs on the product origin', () => {
        const meta = appPageMetadata({ title: 'Import', description: 'D', path: '/import', type: 'website' })
        expect(meta.alternates?.canonical).toBe(`${siteUrl}/import`)
        expect(meta.openGraph?.url).toBe(`${siteUrl}/import`)
        expect(appBreadcrumbSchema([{ name: 'App', href: '/app' }]).itemListElement[0].item).toBe(`${siteUrl}/app`)
    })

    it('suffixes the site name once', () => {
        expect(pageTitle('Guides')).toBe('Guides | Peanut Split')
        expect(pageTitle('Guides | Peanut Split')).toBe('Guides | Peanut Split')
    })
})

describe('structured data', () => {
    it('numbers breadcrumb positions from one and absolutises the items', () => {
        const schema = breadcrumbSchema([
            { name: 'Home', href: '/' },
            { name: 'Guides', href: '/blog' },
        ])
        expect(schema.itemListElement.map((i) => i.position)).toEqual([1, 2])
        expect(schema.itemListElement[1].item).toBe(`${CANONICAL_ORIGIN}/blog`)
    })

    it('drops an empty FAQ rather than emitting an invalid FAQPage', () => {
        expect(faqSchema([])).toBeNull()
        expect(faqSchema(undefined)).toBeNull()
        expect(faqSchema([{ question: 'q', answer: 'a' }])).toMatchObject({ '@type': 'FAQPage' })
    })

    it('types blog posts and comparison pages differently', () => {
        const [post] = listDocs('blog')
        const [alternative] = listDocs('alternatives')
        expect(articleSchema(post)['@type']).toBe('BlogPosting')
        expect(articleSchema(alternative)['@type']).toBe('Article')
    })

    it('gives every article an absolute, self-consistent canonical', () => {
        for (const collection of COLLECTIONS) {
            for (const doc of listDocs(collection)) {
                const schema = articleSchema(doc)
                expect(schema.url).toBe(schema.mainEntityOfPage)
                expect(schema.url.startsWith(CANONICAL_ORIGIN), doc.slug).toBe(true)
                expect(schema.dateModified >= schema.datePublished, doc.slug).toBe(true)
            }
        }
    })

    /** Google lists `image` as required for an Article rich result. A hashed og route cannot be
     *  spelled here (guide tracker decision 17), so every article names one static file — and
     *  that file has to exist, be a PNG, and stay small enough to fetch on every crawl. */
    it('points every article image at one static PNG that ships', () => {
        const file = path.join(process.cwd(), 'public', new URL(ARTICLE_IMAGE_URL).pathname)
        const bytes = fs.readFileSync(file)
        expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
        expect(bytes.byteLength).toBeLessThan(300 * 1024)
        for (const doc of listAllTranslations()) expect(articleSchema(doc).image, doc.slug).toBe(ARTICLE_IMAGE_URL)
    })

    it('gives a calculator-shaped capture page the tool entity, and no other page', () => {
        const docs = listDocs('capture')
        const calculator = docs.find((doc) => doc.slug === 'fair-split-calculator')!
        expect(calculatorSchema(calculator)).toMatchObject({
            '@type': 'WebApplication',
            '@id': `${CANONICAL_ORIGIN}/fair-split-calculator#tool`,
            inLanguage: 'en',
        })
        for (const doc of docs.filter((entry) => entry !== calculator))
            expect(calculatorSchema(doc), doc.slug).toBeNull()
        for (const doc of [...listDocs('blog'), ...listDocs('alternatives')]) {
            expect(calculatorSchema(doc), doc.slug).toBeNull()
        }
    })

    it('links the WebSite node to the Organization node by @id', () => {
        const graph = siteSchema()['@graph']
        const website = graph.find((node) => node['@type'] === 'WebSite') as {
            url: string
            publisher: { '@id': string }
        }
        const org = graph.find((node) => node['@type'] === 'Organization') as { '@id': string }
        expect(website.publisher['@id']).toBe(org['@id'])
        expect(website.url).toBe(CANONICAL_ORIGIN)
    })

    /** Google reads name/description/applicationCategory/offers off this node; a missing one is
     *  not an error it reports, it is a rich result that quietly never appears. */
    it('describes the app with everything a SoftwareApplication result needs', () => {
        const app = siteSchema()['@graph'].find((node) => node['@type'] === 'SoftwareApplication') as Record<
            string,
            unknown
        >
        expect(app.name).toBeTruthy()
        expect(app.description).toBe(SITE_DESCRIPTION)
        expect(app.applicationCategory).toBe('FinanceApplication')
        expect(app.operatingSystem).toBe('Web')
        expect(app.offers).toMatchObject({ price: '0', priceCurrency: 'USD' })
        expect(app.url).toBe(siteUrl)
    })
})

/**
 * SEO-ISSUES item 14: every indexable page ends " | Peanut Split". The generated guides keep
 * " | Peanut" while they are indexed — the long suffix breaks the 60-char cap on four of nine
 * titles, and retitling an indexed page is churn — and may retitle only on a content pass. The LP
 * leads with the name instead of ending with it; it is the one page whose title IS the brand.
 */
describe('title suffix policy', () => {
    const HUB_TITLES = {
        en: enMessages.content.hubTitle,
        'es-419': esMessages.content.hubTitle,
        'pt-br': ptBrMessages.content.hubTitle,
    }
    const titleOf = (metadata: { title?: unknown }) => metadata.title as string

    const handBuilt = [
        ['/', titleOf(landingMetadata)],
        ['/tools', titleOf(toolsHubMetadata)],
        ...TOOLS.map((tool) => [tool.slug, titleOf(toolMetadata(tool))]),
        ...INDEXED_LOCALES.map((locale) => [`${locale} hub`, pageTitle(HUB_TITLES[locale])]),
        ...listAllTranslations().map((doc) => [`${doc.locale}/${doc.slug}`, pageTitle(doc.frontmatter.title)]),
    ] as const
    const guides = INDEXED_LOCALES.flatMap((locale) =>
        listSplitGuides(locale).map((guide) => [guide.href, titleOf(splitGuideMetadata(guide, undefined))] as const)
    )

    it('ends every hand-built page with the long suffix', () => {
        expect(handBuilt.length).toBeGreaterThan(5)
        for (const [page, title] of handBuilt) {
            if (page === '/') expect(title, page).toMatch(/^Peanut Split — /)
            else expect(title, page).toMatch(/ \| Peanut Split$/)
        }
    })

    it('lets a generated guide keep the short suffix, and nothing else', () => {
        expect(guides.length).toBeGreaterThan(0)
        for (const [page, title] of guides) expect(title, page).toMatch(/ \| Peanut( Split)?$/)
    })

    it('keeps every indexable title inside what Google renders', () => {
        for (const [page, title] of [...handBuilt, ...guides]) {
            expect(title.length, `${page}: ${title}`).toBeLessThanOrEqual(60)
        }
    })
})
