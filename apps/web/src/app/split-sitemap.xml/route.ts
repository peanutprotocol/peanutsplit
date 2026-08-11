import { LOCALES } from '@/i18n/locales'
import { guideAlternates, listSplitGuides } from '@/lib/split-content/artifact'
import { splitContentIndexable } from '@/lib/split-content/indexability'
import { contentUrl } from '@/lib/split-content/urls'

export const dynamic = 'force-dynamic'

const xml = (value: string): string =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function splitSitemapResponse({
    root,
    indexable = splitContentIndexable(),
}: {
    root?: string
    indexable?: boolean
} = {}): Response {
    const urls = indexable ? LOCALES.flatMap((locale) => listSplitGuides(locale, root)) : []
    const body = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
        ...urls.map((guide) => {
            const alternates = guideAlternates(guide.slug, root) ?? {}
            return [
                '  <url>',
                `    <loc>${xml(contentUrl(guide.href))}</loc>`,
                `    <lastmod>${guide.date}</lastmod>`,
                ...Object.entries(alternates).map(
                    ([locale, href]) =>
                        `    <xhtml:link rel="alternate" hreflang="${xml(locale)}" href="${xml(contentUrl(href))}" />`
                ),
                '  </url>',
            ].join('\n')
        }),
        '</urlset>',
        '',
    ].join('\n')

    const headers = new Headers({
        'cache-control': 'private, no-store',
        'content-type': 'application/xml; charset=utf-8',
    })
    if (!indexable) headers.set('x-robots-tag', 'noindex, nofollow, noarchive')
    return new Response(body, { headers })
}

export function GET(): Response {
    return splitSitemapResponse()
}
