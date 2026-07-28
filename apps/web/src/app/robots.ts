import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/seo'

/**
 * Rooms are unguessable-slug credentials, so they must never be indexed — but the social
 * unfurl IS the product (SPEC §Growth layer), and the crawlers that build link previews
 * need to reach `/r/*` to fetch the OG image. Hence: blanket disallow, explicit allow for
 * the three preview fetchers.
 */
export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: '*',
                allow: '/',
                disallow: '/r/',
            },
            { userAgent: 'Twitterbot', allow: ['/', '/r/'] },
            { userAgent: 'facebookexternalhit', allow: ['/', '/r/'] },
            { userAgent: 'WhatsApp', allow: ['/', '/r/'] },
        ],
        // Discovery for everything the content engine publishes. Without it a crawler only
        // finds articles by following links, which is slower and misses anything newly added.
        sitemap: absoluteUrl('/sitemap.xml'),
    }
}
