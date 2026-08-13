import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/seo'

/**
 * Rooms are unguessable-slug credentials, so they must never be indexed — but the social
 * unfurl IS the product (SPEC §Growth layer), and the crawlers that build link previews
 * need to reach `/r/*` to fetch the OG image. Hence: blanket disallow, explicit allow for
 * the three preview fetchers.
 *
 * These are prefix rules, so `/r/<slug>/recap` is already covered by both halves — the
 * recap screen inherits the noindex, and a member who pastes its URL still gets a preview.
 * Nothing to add for it: the recap is shared as an image, never as a link (`@/lib/recap`).
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
        // Discovery for everything the content engine publishes, generated guides included —
        // one document, no second `/split-sitemap.xml`. Without it a crawler only finds articles
        // by following links, which is slower and misses anything newly added.
        //
        // Nothing disallows `/guides/`, deliberately: the parked guides are held back with
        // `noindex`, and a crawler has to be allowed to fetch a page to read that.
        sitemap: absoluteUrl('/sitemap.xml'),
    }
}
