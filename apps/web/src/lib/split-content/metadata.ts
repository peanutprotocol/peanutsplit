import type { Metadata } from 'next'
import { HREFLANG } from '@/i18n/locales'
import type { SplitGuide } from './artifact'
import { contentOrigin, contentUrl } from './urls'
import { splitContentIndexable } from './indexability'

const OG_LOCALE = {
    en: 'en_US',
    'es-419': 'es_LA',
    'pt-br': 'pt_BR',
} as const

export function splitGuideMetadata(
    guide: SplitGuide,
    alternates: Record<string, string> | undefined,
    indexable = splitContentIndexable()
): Metadata {
    const canonical = contentUrl(guide.href)
    const languages = alternates
        ? Object.fromEntries(Object.entries(alternates).map(([locale, href]) => [locale, contentUrl(href)]))
        : undefined

    return {
        // Kept byte-aligned with mono's effective-title gate in A7.
        title: `${guide.title} | Peanut`,
        description: guide.description,
        metadataBase: new URL(contentOrigin()),
        alternates: { canonical, languages },
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
        },
        twitter: {
            card: 'summary',
            title: guide.title,
            description: guide.description,
        },
        other: { 'content-language': HREFLANG[guide.locale] },
    }
}

export function splitGuideSchemas(guide: SplitGuide) {
    const url = contentUrl(guide.href)
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
            inLanguage: HREFLANG[guide.locale],
            author: { '@type': 'Organization', name: guide.author, url: contentOrigin() },
            publisher: { '@type': 'Organization', name: 'Peanut', url: contentOrigin() },
        },
        breadcrumbs: {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Peanut', item: contentOrigin() },
                { '@type': 'ListItem', position: 2, name: guide.title, item: url },
            ],
        },
    }
}
