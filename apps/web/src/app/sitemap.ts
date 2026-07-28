import type { MetadataRoute } from 'next'
import { STATIC_PAGES } from '@/data/static-pages'
import { COLLECTIONS, listDocs } from '@/lib/content'
import { absoluteUrl } from '@/lib/seo'

/**
 * Derived, not maintained. Hand-built pages come from STATIC_PAGES, every article comes from the
 * content tree, so publishing is "add a .md, push" with nothing to remember here.
 *
 * `/new` is a form with nothing to rank and `/r/*` is credential-shaped — robots.ts disallows the
 * latter, and listing a room slug in a sitemap would be handing it out.
 *
 * `lastModified` is the article's own date, never build time. A sitemap that claims every page
 * changed on every deploy teaches crawlers to ignore the field.
 */
export default function sitemap(): MetadataRoute.Sitemap {
    const staticEntries: MetadataRoute.Sitemap = STATIC_PAGES.map((page) => ({
        url: absoluteUrl(page.href),
        changeFrequency: 'monthly',
        priority: page.priority,
    }))

    const hub: MetadataRoute.Sitemap = [{ url: absoluteUrl('/blog'), changeFrequency: 'weekly', priority: 0.6 }]

    const articles: MetadataRoute.Sitemap = COLLECTIONS.flatMap((collection) =>
        listDocs(collection).map((doc) => ({
            url: absoluteUrl(doc.frontmatter.canonical ?? doc.href),
            lastModified: doc.frontmatter.updated || doc.frontmatter.date || undefined,
            changeFrequency: 'monthly' as const,
            // Alternative pages answer a commercial query; guides answer an informational one.
            priority: doc.collection === 'alternatives' ? 0.8 : 0.5,
        }))
    )

    return [...staticEntries, ...hub, ...articles]
}
