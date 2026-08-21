import { describe, expect, it } from 'vitest'
import { GET } from './route'
import { listAllTranslations } from '@/lib/content'
import { releasedSplitGuides } from '@/lib/split-content/released'
import { absoluteUrl } from '@/lib/seo'
import { CANONICAL_ORIGIN } from '@/lib/domains'

describe('/rss.xml', () => {
    it('serves RSS 2.0 covering every published translation and released guide', async () => {
        const res = GET()
        expect(res.headers.get('content-type')).toBe('application/rss+xml; charset=utf-8')

        const xml = await res.text()
        expect(xml).toContain('<rss version="2.0"')
        expect(xml).toContain(`<atom:link href="${CANONICAL_ORIGIN}/rss.xml"`)

        // The same two loaders the sitemap iterates — the feed must never grow its own list.
        const expected = [
            ...listAllTranslations().map((doc) => absoluteUrl(doc.frontmatter.canonical ?? doc.href)),
            ...releasedSplitGuides().map((guide) => absoluteUrl(guide.href)),
        ]
        expect(expected.length).toBeGreaterThan(0)
        for (const url of expected) expect(xml).toContain(`<link>${url}</link>`)
        expect(xml.match(/<item>/g)?.length).toBe(expected.length)

        // A frontmatter date that fails to parse would serialise as this literal.
        expect(xml).not.toContain('Invalid Date')
    })
})
