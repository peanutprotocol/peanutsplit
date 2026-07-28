import type { MetadataRoute } from 'next'
import { STATIC_PAGES } from '@/data/static-pages'
import { listAllTranslations, localesForSlug, type Doc } from '@/lib/content'
import { absoluteUrl } from '@/lib/seo'
import { LOCALES } from '@/i18n/locales'
import { hreflangAlternates, localizedPath } from '@/i18n/paths'
import { splitV2Enabled } from '@/lib/flags'

/**
 * Derived, not maintained. Hand-built pages come from STATIC_PAGES; every article and every
 * translation of it comes from the content tree. Publishing is "add a .md, push" and translating
 * is "add another .md" — neither has a list to update here.
 *
 * Every localized URL carries the full `alternates.languages` set for its page. Listing a
 * translation without saying what it is an alternate of is how two languages of one article end
 * up treated as competing duplicates.
 *
 * `/new` is a form with nothing to rank and is `noindex`; `/r/*` is credential-shaped — robots.ts
 * disallows it, and listing a room slug in a sitemap would be handing it out.
 *
 * `lastModified` is the article's own date, never build time. A sitemap that claims every page
 * changed on every deploy teaches crawlers to ignore the field.
 */
export default function sitemap(): MetadataRoute.Sitemap {
    const staticEntries: MetadataRoute.Sitemap = STATIC_PAGES.filter((page) => !page.v2Only || splitV2Enabled()).map(
        (page) => ({
            url: absoluteUrl(page.href),
            changeFrequency: 'monthly',
            priority: page.priority,
        })
    )

    // The hub exists in every locale by construction — it lists whatever that locale has, even
    // when that is nothing yet.
    const hubAlternates = absolutise(hreflangAlternates('/blog', [...LOCALES]))
    const hubs: MetadataRoute.Sitemap = LOCALES.map((locale) => ({
        url: absoluteUrl(localizedPath('/blog', locale)),
        changeFrequency: 'weekly',
        priority: 0.6,
        alternates: hubAlternates && { languages: hubAlternates },
    }))

    const articles: MetadataRoute.Sitemap = listAllTranslations().map((doc) => {
        const languages = absolutise(hreflangAlternates(basePath(doc), localesForSlug(doc.collection, doc.slug)))
        return {
            url: absoluteUrl(doc.frontmatter.canonical ?? doc.href),
            lastModified: doc.frontmatter.updated || doc.frontmatter.date || undefined,
            changeFrequency: 'monthly' as const,
            // Alternative pages answer a commercial query; guides answer an informational one.
            priority: doc.collection === 'alternatives' ? 0.8 : 0.5,
            alternates: languages && { languages },
        }
    })

    return [...staticEntries, ...hubs, ...articles]
}

/** The unprefixed path for a doc — what hreflang is computed from. */
function basePath(doc: Pick<Doc, 'collection' | 'slug'>): string {
    return doc.collection === 'blog' ? `/blog/${doc.slug}` : `/${doc.slug}`
}

/**
 * Sitemap `<xhtml:link>` hrefs must be absolute — a relative one is dropped by every validator.
 * `hreflangAlternates` returns root-relative paths because that is what Next's Metadata API
 * wants for `<link rel=alternate>`, so the sitemap is where the two conventions meet.
 */
function absolutise(languages: Record<string, string> | undefined): Record<string, string> | undefined {
    if (!languages) return undefined
    return Object.fromEntries(Object.entries(languages).map(([lang, path]) => [lang, absoluteUrl(path)]))
}
