import { listAllTranslations } from '@/lib/content'
import { releasedSplitGuides } from '@/lib/split-content/released'
import { absoluteUrl, SITE_DESCRIPTION } from '@/lib/seo'
import { CANONICAL_ORIGIN } from '@/lib/domains'

/**
 * RSS 2.0 for the whole indexable content corpus — every published article translation plus every
 * released guide, the same two loaders the sitemap iterates. A feed is the push half of the
 * discovery story: the sitemap waits to be crawled, the feed is what aggregators and index
 * pings poll.
 *
 * Force-dynamic for the sitemap's reason: guide release is decided per request from runtime
 * policy, and a prerendered feed would freeze the build box's answer.
 */
export const dynamic = 'force-dynamic'

interface FeedItem {
    title: string
    description: string
    /** Absolute canonical URL — also the guid. */
    url: string
    /** ISO date, used as pubDate and the sort key. */
    date: string
}

const escapeXml = (value: string): string =>
    value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;')

/** RFC 822, which RSS requires — `toUTCString` emits the RFC 1123 profile of it. */
const rfc822 = (iso: string): string => new Date(iso.includes('T') ? iso : `${iso}T00:00:00Z`).toUTCString()

export function GET(): Response {
    const articles: FeedItem[] = listAllTranslations().map((doc) => ({
        title: doc.frontmatter.title,
        description: doc.frontmatter.description,
        url: absoluteUrl(doc.frontmatter.canonical ?? doc.href),
        date: doc.frontmatter.date,
    }))

    const guides: FeedItem[] = releasedSplitGuides().map((guide) => ({
        title: guide.title,
        description: guide.description,
        url: absoluteUrl(guide.href),
        date: guide.date,
    }))

    const items = [...articles, ...guides]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map(
            (item) => `        <item>
            <title>${escapeXml(item.title)}</title>
            <link>${escapeXml(item.url)}</link>
            <guid>${escapeXml(item.url)}</guid>
            <description>${escapeXml(item.description)}</description>
            <pubDate>${rfc822(item.date)}</pubDate>
        </item>`
        )
        .join('\n')

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
    <channel>
        <title>Peanut Split</title>
        <link>${CANONICAL_ORIGIN}/blog</link>
        <description>${escapeXml(SITE_DESCRIPTION)}</description>
        <language>en</language>
        <atom:link href="${CANONICAL_ORIGIN}/rss.xml" rel="self" type="application/rss+xml"/>
${items}
    </channel>
</rss>
`

    return new Response(xml, {
        headers: { 'content-type': 'application/rss+xml; charset=utf-8' },
    })
}
