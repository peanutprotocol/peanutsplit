import { describe, expect, it } from 'vitest'
import {
    absoluteUrl,
    appBreadcrumbSchema,
    appPageMetadata,
    articleSchema,
    breadcrumbSchema,
    faqSchema,
    pageMetadata,
    pageTitle,
    siteSchema,
    SITE_DESCRIPTION,
} from './seo'
import { COLLECTIONS, listDocs } from './content'
import { CANONICAL_ORIGIN } from './domains'
import { siteUrl } from './site'

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
