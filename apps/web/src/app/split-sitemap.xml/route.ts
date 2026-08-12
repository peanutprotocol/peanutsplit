import { headers } from 'next/headers'
import { LOCALES } from '@/i18n/locales'
import { guideAlternates, listSplitGuides } from '@/lib/split-content/artifact'
import { splitContentIndexableFromHeaders } from '@/lib/split-content/indexability'
import { contentUrl } from '@/lib/split-content/urls'

export const dynamic = 'force-dynamic'

const xml = (value: string): string =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function splitSitemapResponse({
    root,
    isPathIndexable = () => false,
}: {
    root?: string
    isPathIndexable?: (publicPath: string) => boolean
} = {}): Response {
    const urls = LOCALES.flatMap((locale) => listSplitGuides(locale, root)).filter((guide) =>
        isPathIndexable(guide.href)
    )
    const body = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
        ...urls.map((guide) => {
            const alternates = Object.fromEntries(
                Object.entries(guideAlternates(guide.slug, root) ?? {}).filter(([, href]) => isPathIndexable(href))
            )
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
    if (urls.length === 0) headers.set('x-robots-tag', 'noindex, nofollow, noarchive')
    return new Response(body, { headers })
}

export function splitSitemapResponseForHeaders(requestHeaders: Headers, root?: string): Response {
    return splitSitemapResponse({
        root,
        isPathIndexable: (publicPath) => splitContentIndexableFromHeaders(requestHeaders, publicPath),
    })
}

export async function GET(): Promise<Response> {
    return splitSitemapResponseForHeaders(await headers())
}
