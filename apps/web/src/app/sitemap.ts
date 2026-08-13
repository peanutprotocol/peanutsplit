import type { MetadataRoute } from 'next'
import { STATIC_PAGES } from '@/data/static-pages'
import { TOOLS, toolPath } from '@/tools/registry'
import { basePathFor, listAllTranslations, localesForSlug, type Collection } from '@/lib/content'
import { absoluteUrl } from '@/lib/seo'
import { DEFAULT_LOCALE, LOCALES } from '@/i18n/locales'
import { hreflangAlternates, localizedPath } from '@/i18n/paths'
import { splitV2Enabled } from '@/lib/flags'
import { releasedGuideAlternates, releasedSplitGuides } from '@/lib/split-content/released'

/**
 * Guides are runtime-gated (`SEO_INDEXABLE` plus the reviewed registry), and a prerendered sitemap
 * would freeze whichever answer the build box happened to give. One document, decided per request,
 * is also why there is no second `/split-sitemap.xml`: the generated guides are Split's pages, and
 * a crawler should not have to find a separate file to learn about half the site.
 */
export const dynamic = 'force-dynamic'

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
/**
 * Comparison pages answer a commercial query and are the pages we most want ranked; capture pages
 * answer a narrower one and are thin by design; guides answer an informational one and earn their
 * traffic over a longer horizon.
 */
const PRIORITY: Record<Collection, number> = {
    alternatives: 0.8,
    capture: 0.7,
    blog: 0.5,
}

export default function sitemap(): MetadataRoute.Sitemap {
    const staticEntries: MetadataRoute.Sitemap = STATIC_PAGES.filter(
        (page) => page.inSitemap !== false && (!page.v2Only || splitV2Enabled())
    ).flatMap((page) => {
        const locales = page.locales ?? [DEFAULT_LOCALE]
        const languages = absolutise(hreflangAlternates(page.href, [...locales]))
        return locales.map((locale) => ({
            url: absoluteUrl(localizedPath(page.href, locale)),
            changeFrequency: 'monthly' as const,
            priority: page.priority,
            alternates: languages && { languages },
        }))
    })

    /**
     * Calculators, from the registry. Ranked with the comparison pages rather than below them:
     * both answer a commercial query typed as-is, and a tool page has an answer on it before the
     * reader does anything. No `alternates` — tools are English-only, and advertising a
     * translation that does not exist is the one thing hreflang must never do.
     */
    const tools: MetadataRoute.Sitemap = TOOLS.map((tool) => ({
        url: absoluteUrl(toolPath(tool)),
        lastModified: tool.updated,
        changeFrequency: 'monthly',
        priority: 0.8,
    }))

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
        const languages = absolutise(
            hreflangAlternates(basePathFor(doc.collection, doc.slug), localesForSlug(doc.collection, doc.slug))
        )
        return {
            url: absoluteUrl(doc.frontmatter.canonical ?? doc.href),
            lastModified: doc.frontmatter.updated || doc.frontmatter.date || undefined,
            changeFrequency: 'monthly' as const,
            priority: PRIORITY[doc.collection],
            alternates: languages && { languages },
        }
    })

    /**
     * Generated guides, and only the ones released for indexing. A sitemap entry for a page that
     * answers with `x-robots-tag: noindex` is a contradiction the crawler resolves against us, so
     * this list is derived from the same policy that writes that header rather than from the
     * artifact inventory — six installed guides are permanently parked and must never appear.
     *
     * Ranked with the blog: an informational query, earning its traffic over a longer horizon.
     */
    const guides: MetadataRoute.Sitemap = releasedSplitGuides().map((guide) => {
        const languages = absolutise(releasedGuideAlternates(guide.slug))
        return {
            url: absoluteUrl(guide.href),
            lastModified: guide.date,
            changeFrequency: 'monthly' as const,
            priority: PRIORITY.blog,
            alternates: languages && { languages },
        }
    })

    return [...staticEntries, ...tools, ...hubs, ...articles, ...guides]
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
