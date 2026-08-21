import type { Metadata } from 'next'
import { HREFLANG } from '@/i18n/locales'
import { localizedPath } from '@/i18n/paths'
import { CANONICAL_ORIGIN } from '@/lib/domains'
import { howToSchema } from '@/lib/howto-schema'
import { absoluteUrl, breadcrumbSchema, ORGANIZATION_NODE, type Breadcrumb } from '@/lib/seo'
import type { SplitGuide } from './artifact'

const OG_LOCALE = {
    en: 'en_US',
    'es-419': 'es_LA',
    'pt-br': 'pt_BR',
} as const

export function splitGuideMetadata(
    guide: SplitGuide,
    alternates: Record<string, string> | undefined,
    indexable = false
): Metadata {
    const canonical = absoluteUrl(guide.href)
    const languages = alternates
        ? Object.fromEntries(Object.entries(alternates).map(([locale, href]) => [locale, absoluteUrl(href)]))
        : undefined

    return {
        // Kept byte-aligned with mono's effective-title gate in A7.
        title: `${guide.title} | Peanut`,
        description: guide.description,
        metadataBase: new URL(CANONICAL_ORIGIN),
        alternates: { canonical, languages, types: { 'application/rss+xml': `${CANONICAL_ORIGIN}/rss.xml` } },
        robots: indexable
            ? { index: true, follow: true }
            : { index: false, follow: false, noarchive: true, googleBot: { index: false, follow: false } },
        openGraph: {
            type: 'article',
            url: canonical,
            title: guide.title,
            description: guide.description,
            siteName: 'Peanut Split',
            locale: OG_LOCALE[guide.locale],
            publishedTime: guide.date,
            modifiedTime: guide.generatedAt,
        },
        twitter: {
            card: 'summary_large_image',
            title: guide.title,
            description: guide.description,
        },
        other: { 'content-language': HREFLANG[guide.locale] },
    }
}

/**
 * Crumb labels, hardcoded per locale and pinned to the catalogs by `metadata.test.ts`.
 *
 * `SplitGuideLayout` has to stay synchronous — two suites render it with `renderToStaticMarkup`,
 * which does not await an async component — so `getTranslations` is not available here. Same
 * reason `OTHER_LANGUAGES` in `GuideLayout.tsx` is a literal.
 */
export const GUIDE_CRUMBS = {
    en: { home: 'Home', hub: 'Guides' },
    'es-419': { home: 'Inicio', hub: 'Guías' },
    'pt-br': { home: 'Início', hub: 'Guias' },
} as const

/**
 * One trail, rendered and in the JSON-LD. The hub crumb points at `/blog`, which is Split's one
 * content hub in every language — `/guides` is a section root nothing serves, and a BreadcrumbList
 * item at a 404 is a broken link inside structured data.
 */
export function splitGuideCrumbs(guide: SplitGuide): Breadcrumb[] {
    return [
        // Bare `/`: the landing is app shell, so `/es-419` and `/pt-br` are live 404s.
        { name: GUIDE_CRUMBS[guide.locale].home, href: '/' },
        { name: GUIDE_CRUMBS[guide.locale].hub, href: localizedPath('/blog', guide.locale) },
        { name: guide.title, href: guide.href },
    ]
}

export function splitGuideSchemas(guide: SplitGuide) {
    const url = absoluteUrl(guide.href)
    return {
        article: {
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            '@id': `${url}#article`,
            url,
            mainEntityOfPage: url,
            headline: guide.title,
            description: guide.description,
            datePublished: guide.date,
            dateModified: guide.generatedAt,
            inLanguage: HREFLANG[guide.locale],
            // The site's one Organization, inline: a guide emits no site `@graph`, so a bare `@id`
            // reference would dangle. Each guide used to declare a second Organization for the
            // same URL under a different name.
            author: ORGANIZATION_NODE,
            publisher: ORGANIZATION_NODE,
            // Google lists `image` as required for an Article rich result. The app icon rather than
            // the unfurl card, for the reason `articleSchema` records: Next hash-suffixes generated
            // `opengraph-image` routes, so a URL spelled out here is a guess.
            image: `${CANONICAL_ORIGIN}/icons/icon-512.png`,
        },
        breadcrumbs: breadcrumbSchema(splitGuideCrumbs(guide)),
        // Null on every guide today — none render a <Steps> block yet — the same "nothing to
        // declare" contract JsonLd already gives faqSchema.
        howTo: howToSchema(guide.title, url, guide.body),
    }
}
