import { describe, expect, it } from 'vitest'
import { absoluteUrl, articleSchema, breadcrumbSchema, faqSchema, pageMetadata, pageTitle, siteSchema } from './seo'
import { COLLECTIONS, listDocs } from './content'
import { siteUrl } from './site'

describe('absoluteUrl', () => {
    it('resolves root-relative paths against the site origin', () => {
        expect(absoluteUrl('/blog')).toBe(`${siteUrl}/blog`)
        expect(absoluteUrl('/')).toBe(siteUrl)
    })

    it('leaves an already-absolute URL alone', () => {
        expect(absoluteUrl('https://peanut.me/x')).toBe('https://peanut.me/x')
    })
})

describe('pageMetadata', () => {
    it('points canonical and OG at the same path', () => {
        const meta = pageMetadata({ title: 'T', description: 'D', path: '/blog/x' })
        expect(meta.alternates?.canonical).toBe('/blog/x')
        expect(meta.openGraph?.url).toBe('/blog/x')
    })

    it('omits article timestamps on a website-type page', () => {
        const meta = pageMetadata({ title: 'T', description: 'D', path: '/blog', type: 'website' })
        expect(meta.openGraph).not.toHaveProperty('publishedTime')
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
        expect(schema.itemListElement[1].item).toBe(`${siteUrl}/blog`)
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
                expect(schema.url.startsWith(siteUrl), doc.slug).toBe(true)
                expect(schema.dateModified >= schema.datePublished, doc.slug).toBe(true)
            }
        }
    })

    it('links the WebSite node to the Organization node by @id', () => {
        const graph = siteSchema()['@graph']
        const website = graph.find((node) => node['@type'] === 'WebSite') as { publisher: { '@id': string } }
        const org = graph.find((node) => node['@type'] === 'Organization') as { '@id': string }
        expect(website.publisher['@id']).toBe(org['@id'])
    })
})
