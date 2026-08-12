import type { Metadata } from 'next'
import { CANONICAL_ORIGIN } from '@/lib/domains'
import { siteUrl } from '@/lib/site'
import { DEFAULT_LOCALE, HREFLANG, type Locale } from '@/i18n/locales'
import type { Doc, Faq } from '@/lib/content'

/**
 * Metadata and JSON-LD builders for Split's own pages. A local copy of the idea behind
 * peanut.me's src/lib/seo — same schema types, Split's own publisher block — because the two
 * sites are different publishers with different canonical hosts and must be able to drift.
 *
 * Public marketing/content URLs resolve against the fixed canonical origin. Product URLs use
 * `siteUrl`, which is the same origin in production and may be loopback in local/E2E builds.
 */

const SITE_NAME = 'Peanut Split'

/**
 * The site's one-line description. Lives here rather than inline in the root layout because two
 * things need it and they must not drift: the `<meta name="description">` every page inherits,
 * and the SoftwareApplication node in `siteSchema()` — a schema description that disagreed with
 * the served meta description is the kind of mismatch that gets structured data ignored.
 */
export const SITE_DESCRIPTION =
    'Accountless, link-based expense splitting. Create a room, share the link, settle up however you like. Free forever.'

/**
 * OG spells locales `language_TERRITORY`; everything else here uses BCP 47.
 *
 * `es_419` is not a value Facebook's list accepts — the territory has to be a country — so LATAM
 * Spanish is declared as `es_LA`, which is the one entry in that list covering the region rather
 * than a single country. This is the only place a locale is spelled as something other than its
 * code or its `HREFLANG` value, and it is OG's constraint, not ours.
 */
const OG_LOCALE: Record<Locale, string> = {
    en: 'en_US',
    'es-419': 'es_LA',
    'pt-br': 'pt_BR',
}

/** Stable node id so every page's publisher points at one entity instead of re-declaring it. */
export const ORGANIZATION_ID = `${CANONICAL_ORIGIN}/#organization`

const PUBLISHER = {
    '@type': 'Organization' as const,
    '@id': ORGANIZATION_ID,
    name: SITE_NAME,
    url: CANONICAL_ORIGIN,
    logo: {
        '@type': 'ImageObject' as const,
        url: `${CANONICAL_ORIGIN}/icons/icon-512.png`,
    },
}

/** Public root-relative path → canonical absolute URL. Idempotent for absolute canonicals. */
export function absoluteUrl(pathname: string): string {
    if (/^https?:\/\//.test(pathname)) return pathname
    const suffix = pathname === '/' ? '' : pathname
    return `${CANONICAL_ORIGIN}${suffix.startsWith('/') || suffix === '' ? suffix : `/${suffix}`}`
}

/** Metadata and sitemap hreflang values must name the same canonical host. */
export function absoluteLanguages(languages: Record<string, string> | undefined): Record<string, string> | undefined {
    if (!languages) return undefined
    return Object.fromEntries(Object.entries(languages).map(([locale, href]) => [locale, absoluteUrl(href)]))
}

/** Product-owned paths use the local origin in development and the canonical origin in production. */
export function absoluteAppUrl(pathname: string): string {
    if (/^https?:\/\//.test(pathname)) return pathname
    const suffix = pathname === '/' ? '' : pathname
    return `${siteUrl}${suffix.startsWith('/') || suffix === '' ? suffix : `/${suffix}`}`
}

export interface PageMetaInput {
    title: string
    description: string
    /** Root-relative canonical path, e.g. `/blog/split-a-group-trip`. */
    path: string
    /** `article` for content pages, `website` for hubs and the LP. */
    type?: 'article' | 'website'
    publishedTime?: string
    modifiedTime?: string
    /** Language of THIS page. Drives `og:locale`, which unfurls read to pick a rendering. */
    locale?: Locale
}

/**
 * One place that decides what a Split page's head looks like. Canonical, OG and Twitter tags
 * always agree because they are derived from the same three inputs — the drift between them is
 * the usual way a page ends up canonicalised to the wrong URL.
 */
export function pageMetadata({
    title,
    description,
    path,
    type = 'article',
    publishedTime,
    modifiedTime,
    locale = DEFAULT_LOCALE,
}: PageMetaInput): Metadata {
    const canonical = absoluteUrl(path)
    return {
        title,
        description,
        metadataBase: new URL(CANONICAL_ORIGIN),
        alternates: { canonical },
        openGraph: {
            type,
            url: canonical,
            siteName: SITE_NAME,
            // OG wants `es_ES`-style underscores, not the BCP 47 hyphen the rest of the app uses.
            locale: OG_LOCALE[locale],
            title,
            description,
            ...(type === 'article' ? { publishedTime, modifiedTime: modifiedTime ?? publishedTime } : {}),
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description,
        },
    }
}

export function appPageMetadata(input: PageMetaInput): Metadata {
    const metadata = pageMetadata(input)
    const canonical = absoluteAppUrl(input.path)
    return {
        ...metadata,
        metadataBase: new URL(siteUrl),
        alternates: { ...metadata.alternates, canonical },
        openGraph: { ...metadata.openGraph, url: canonical },
    }
}

/**
 * Human date for anything a reader sees. An ISO string in body text reads as unrendered data.
 *
 * The locale is passed in, never taken from the server's environment: the same page must render
 * the same string on every machine, and a build box in a different region would otherwise change
 * the month name. `en-GB` rather than `en-US` for English — "28 July 2026" reads as a date in
 * both, where "July 28, 2026" reads as American to everyone else.
 */
const DATE_LOCALE: Record<Locale, string> = { en: 'en-GB', 'es-419': 'es-419', 'pt-br': 'pt-BR' }

export function formatDate(iso: string, locale: Locale = DEFAULT_LOCALE): string {
    const date = new Date(`${iso}T00:00:00Z`)
    if (Number.isNaN(date.getTime())) return iso
    return date.toLocaleDateString(DATE_LOCALE[locale], {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
    })
}

/** `<title>` for a content page. Suffix once, here, so no article has to remember to. */
export function pageTitle(title: string): string {
    return title.endsWith(SITE_NAME) ? title : `${title} | ${SITE_NAME}`
}

export interface Breadcrumb {
    name: string
    /** Root-relative path. */
    href: string
}

function breadcrumbSchemaFor(crumbs: Breadcrumb[], resolveUrl: (href: string) => string) {
    return {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: crumbs.map((crumb, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: crumb.name,
            item: resolveUrl(crumb.href),
        })),
    }
}

export function breadcrumbSchema(crumbs: Breadcrumb[]) {
    return breadcrumbSchemaFor(crumbs, absoluteUrl)
}

export function appBreadcrumbSchema(crumbs: Breadcrumb[]) {
    return breadcrumbSchemaFor(crumbs, absoluteAppUrl)
}

/**
 * FAQPage. Returns null for an empty list — an FAQPage with no mainEntity is a structured-data
 * error, and callers pass frontmatter straight through.
 */
export function faqSchema(faqs: Faq[] | undefined) {
    if (!faqs?.length) return null
    return {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqs.map((faq) => ({
            '@type': 'Question',
            name: faq.question,
            acceptedAnswer: { '@type': 'Answer', text: faq.answer },
        })),
    }
}

/**
 * Article/BlogPosting for a content doc. Blog posts get BlogPosting; the alternative pages are
 * evergreen comparisons rather than dated posts, so they get plain Article.
 */
export function articleSchema(doc: Doc) {
    const { frontmatter } = doc
    return {
        '@context': 'https://schema.org',
        '@type': doc.collection === 'blog' ? 'BlogPosting' : 'Article',
        headline: frontmatter.title,
        description: frontmatter.description,
        // Standard BCP 47 casing, like hreflang — schema.org's `inLanguage` is an IETF tag, and
        // the lowercase code is a filename convention that has no business in structured data.
        inLanguage: HREFLANG[doc.locale],
        datePublished: frontmatter.date,
        dateModified: frontmatter.updated ?? frontmatter.date,
        author: frontmatter.author ? { '@type': 'Person', name: frontmatter.author } : { '@id': ORGANIZATION_ID },
        publisher: { '@id': ORGANIZATION_ID },
        // Google lists `image` as required for an Article rich result. Deliberately the app icon
        // and not the unfurl card: Next hash-suffixes generated `opengraph-image` routes, so any
        // URL spelled out here would be a guess that breaks the next time the card is rebuilt.
        image: `${CANONICAL_ORIGIN}/icons/icon-512.png`,
        mainEntityOfPage: absoluteUrl(frontmatter.canonical ?? doc.href),
        url: absoluteUrl(frontmatter.canonical ?? doc.href),
    }
}

/**
 * WebApplication for a calculator page.
 *
 * `WebApplication` rather than the site-level `SoftwareApplication`: a tool is a thing you use in
 * the browser on that URL, and giving it the same type as the product would put two competing
 * application entities in one graph. It is attached to the site node instead, so the page reads as
 * part of Split rather than as a second product with the same publisher.
 *
 * The free assertion is the same commitment `siteSchema()` makes, from the same source (§7.3,
 * _price_). If that ever changes, both change together.
 */
export function toolSchema({ path, title, description }: { path: string; title: string; description: string }) {
    return {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        '@id': `${absoluteUrl(path)}#tool`,
        name: title,
        description,
        url: absoluteUrl(path),
        applicationCategory: 'FinanceApplication',
        operatingSystem: 'Web',
        inLanguage: HREFLANG[DEFAULT_LOCALE],
        isPartOf: { '@id': `${CANONICAL_ORIGIN}/#website` },
        publisher: { '@id': ORGANIZATION_ID },
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    }
}

/**
 * WebSite + SoftwareApplication for the LP. The price assertion is the one claim here that
 * could rot: free forever is a stated commitment on the site (HonestyStrip), so the markup is
 * allowed to say it. If that commitment ever changes, this changes with it.
 */
export function siteSchema() {
    return {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'WebSite',
                '@id': `${CANONICAL_ORIGIN}/#website`,
                url: CANONICAL_ORIGIN,
                name: SITE_NAME,
                publisher: { '@id': ORGANIZATION_ID },
            },
            {
                ...PUBLISHER,
                '@id': ORGANIZATION_ID,
            },
            {
                '@type': 'SoftwareApplication',
                // Addressable, so a future node (a review, an app screenshot) can attach to this
                // one entity instead of declaring a second unlinked copy of the app.
                '@id': `${siteUrl}/#app`,
                name: SITE_NAME,
                description: SITE_DESCRIPTION,
                url: siteUrl,
                applicationCategory: 'FinanceApplication',
                operatingSystem: 'Web',
                offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            },
        ],
    }
}
