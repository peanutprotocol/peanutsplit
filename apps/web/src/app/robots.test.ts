import { afterEach, describe, expect, it, vi } from 'vitest'
import sitemap from './sitemap'
import robots from './robots'
import { CANONICAL_ORIGIN } from '@/lib/domains'
import { siteUrl } from '@/lib/site'
import { SPLIT_CONTENT_INDEX_RELEASED_PATHS } from '@/lib/split-content/index-release'

const GUIDE_PATH = /^\/(?:[a-z0-9-]+\/)?guides\//

/** Every URL a crawler could reach from one sitemap: the entries and their hreflang alternates. */
function sitemapPathnames(): string[] {
    return sitemap().flatMap((entry) => [
        new URL(String(entry.url)).pathname,
        ...Object.values(entry.alternates?.languages ?? {}).map((href) => new URL(String(href)).pathname),
    ])
}

afterEach(() => {
    vi.unstubAllEnvs()
})

describe('canonical discovery host', () => {
    it('keeps every sitemap and robots URL on peanutsplit.com', () => {
        expect(robots().sitemap).toBe(`${CANONICAL_ORIGIN}/sitemap.xml`)

        const urls = sitemap().map((entry) => entry.url)
        expect(urls.length).toBeGreaterThan(0)
        expect(urls).not.toContain(`${CANONICAL_ORIGIN}/import`)
        expect(urls).not.toContain(`${siteUrl}/import`)
        for (const entry of sitemap()) {
            const discoveryUrls = [entry.url, ...Object.values(entry.alternates?.languages ?? {})].map(String)
            for (const url of discoveryUrls) {
                const parsed = new URL(url)
                expect(parsed.origin, url).toBe(CANONICAL_ORIGIN)
            }
        }
        if (siteUrl !== CANONICAL_ORIGIN) {
            for (const url of urls) expect(new URL(url).origin, url).not.toBe(siteUrl)
        }
    })

    it('keeps every generated Split guide out of the sitemap on a deployment that is not indexed', () => {
        for (const runtimeValue of [undefined, 'false']) {
            vi.stubEnv('SEO_INDEXABLE', runtimeValue)
            expect(
                sitemapPathnames().filter((pathname) => GUIDE_PATH.test(pathname)),
                String(runtimeValue)
            ).toEqual([])
        }
    })

    /**
     * The whole point of the release: exactly the reviewed nine, and no more. The six parked
     * guides render and stay noindex, so a sitemap entry for one would be a link to a page that
     * tells the crawler to leave.
     */
    it('lists exactly the released guides once the deployment is indexed', () => {
        vi.stubEnv('SEO_INDEXABLE', 'true')

        const urls = sitemap()
            .map((entry) => new URL(String(entry.url)).pathname)
            .filter((pathname) => GUIDE_PATH.test(pathname))

        expect(urls.sort()).toEqual([...SPLIT_CONTENT_INDEX_RELEASED_PATHS].sort())
    })

    /**
     * `ask-a-friend-to-pay-you-back` is released in all three locales and gets a full alternate
     * set; nothing else has a released sibling. A released page pointing hreflang at a parked URL
     * is the failure this exists to catch — it hands a crawler a noindex page as the translation.
     */
    it('never advertises a parked guide as the alternate of a released one', () => {
        vi.stubEnv('SEO_INDEXABLE', 'true')

        const released: readonly string[] = SPLIT_CONTENT_INDEX_RELEASED_PATHS
        for (const pathname of sitemapPathnames().filter((candidate) => GUIDE_PATH.test(candidate))) {
            expect(released, pathname).toContain(pathname)
        }

        const withAlternates = sitemap().filter(
            (entry) => GUIDE_PATH.test(new URL(String(entry.url)).pathname) && entry.alternates?.languages
        )
        expect(withAlternates.map((entry) => new URL(String(entry.url)).pathname).sort()).toEqual([
            '/es-419/guides/ask-a-friend-to-pay-you-back',
            '/guides/ask-a-friend-to-pay-you-back',
            '/pt-br/guides/ask-a-friend-to-pay-you-back',
        ])
        for (const entry of withAlternates) {
            expect(Object.keys(entry.alternates!.languages!).sort()).toEqual(['en', 'es-419', 'pt-BR', 'x-default'])
        }
    })
})
