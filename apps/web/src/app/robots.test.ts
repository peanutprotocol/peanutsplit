import { describe, expect, it } from 'vitest'
import sitemap from './sitemap'
import robots from './robots'
import { LEGACY_APP_ORIGIN } from '@/lib/domains'
import { decideCutoverRedirect } from '@/lib/cutover-redirects'
import { siteUrl } from '@/lib/site'

describe('legacy marketing discovery hosts', () => {
    it('keeps the unmigrated sitemap and robots on the 200 peanutsplit.com surface', () => {
        expect(robots().sitemap).toBe(`${LEGACY_APP_ORIGIN}/sitemap.xml`)

        const urls = sitemap().map((entry) => entry.url)
        expect(urls.length).toBeGreaterThan(0)
        expect(urls).not.toContain(`${LEGACY_APP_ORIGIN}/import`)
        expect(urls).not.toContain(`${siteUrl}/import`)
        for (const entry of sitemap()) {
            const discoveryUrls = [entry.url, ...Object.values(entry.alternates?.languages ?? {})].map(String)
            for (const url of discoveryUrls) {
                const parsed = new URL(url)
                expect(parsed.origin, url).toBe(LEGACY_APP_ORIGIN)
                expect(
                    decideCutoverRedirect(
                        'peanutsplit.com',
                        parsed.pathname,
                        parsed.search,
                        'peanutsplit.com',
                        'split.peanut.me'
                    ),
                    url
                ).toBeNull()
            }
        }
        if (siteUrl !== LEGACY_APP_ORIGIN) {
            for (const url of urls) expect(new URL(url).origin, url).not.toBe(siteUrl)
        }
    })

    it('does not advertise the future peanut.me Split sitemap before its separate index flip', () => {
        expect(robots().sitemap).not.toBe('https://peanut.me/split-sitemap.xml')
    })
})
