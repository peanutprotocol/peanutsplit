import { describe, expect, it } from 'vitest'
import sitemap from './sitemap'
import robots from './robots'
import { CANONICAL_ORIGIN } from '@/lib/domains'
import { siteUrl } from '@/lib/site'

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

    it('does not advertise the deferred peanut.me Split sitemap', () => {
        expect(robots().sitemap).not.toBe('https://peanut.me/split-sitemap.xml')
    })
})
