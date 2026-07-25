import type { MetadataRoute } from 'next'

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
    }
}
