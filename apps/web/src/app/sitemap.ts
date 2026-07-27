import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site'

/**
 * Only the two public pages. `/new` is a form and `/r/*` is credential-shaped — robots.ts
 * already disallows the latter, and listing a room slug in a sitemap would hand it out.
 */
export default function sitemap(): MetadataRoute.Sitemap {
    return [
        { url: siteUrl, changeFrequency: 'monthly', priority: 1 },
        { url: `${siteUrl}/splitwise-alternative`, changeFrequency: 'monthly', priority: 0.8 },
    ]
}
