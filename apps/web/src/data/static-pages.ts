import { TOOL_SLUGS } from '@/tools/registry'
import { type Locale } from '@/i18n/locales'
import { PREFIXED_LOCALES } from '@/i18n/paths'

/**
 * The hand-built pages, registered so the sitemap and the /blog hub don't have to special-case
 * them. Two implementations of a marketing page coexist on purpose: the landing and the
 * calculators' hub are app surfaces built in React, and everything editorial is markdown through
 * the content engine. This file is the seam.
 *
 * Rule: a page belongs in exactly one of the two. If a slug here also exists in src/content/,
 * the static route wins in Next's router and the markdown version becomes unreachable while
 * still being listed — so don't. `staticPageSlugs` exists to let the content engine assert it.
 */

export interface StaticPage {
    /** Root-relative path. */
    href: string
    /** Hub-card title. Not necessarily the page's <h1>. */
    title: string
    description: string
    /** Sitemap priority. 1 is the LP. */
    priority: number
    /** Show on the /blog hub. The LP is registered for the sitemap but is not a "guide". */
    inHub: boolean
    /** False for app-owned routes that remain reserved here but should not enter discovery. */
    inSitemap?: boolean
    /** Kept reserved and buildable, but omitted from v1 discovery. */
    v2Only?: boolean
    /** Locales with a real route. Omitted means the unprefixed English route only. */
    locales?: readonly Locale[]
}

export const STATIC_PAGES: StaticPage[] = [
    {
        href: '/',
        title: 'Peanut Split',
        description: 'Accountless, link-based expense splitting.',
        priority: 1,
        inHub: false,
    },
    {
        // The calculators' one hub. It carries no calculator of its own, so it is a listing rather
        // than a tool, and it lives here beside the other hand-built pages for the same reason the
        // tools do not: the registry knows what to list, and this file is what gets it a URL, a
        // sitemap row and a reserved slug.
        href: '/tools',
        title: 'Calculators',
        description: 'One sum each, with the working shown: a bill, a room, a shared car.',
        priority: 0.7,
        inHub: true,
    },
    {
        // An app-owned tool, not an editorial guide. Keep it registered to reserve the route,
        // but omit it from the editorial sitemap.
        href: '/import',
        title: 'Import from Splitwise',
        description: 'Turn a Splitwise group export into a Split room — expenses, payers and balances intact.',
        priority: 0.8,
        inHub: false,
        inSitemap: false,
    },
]

/**
 * Every root-level path Next already owns. A markdown slug matching one of these would be
 * unreachable — the static segment wins — while still being listed on the hub and in the
 * sitemap, which is worse than a plain 404 because it advertises a page that cannot be opened.
 *
 * STATIC_PAGES alone is not enough: it only knows about marketing pages, not about `/app`, `/new`,
 * `/api` or the metadata routes. Keep this in step with the top level of src/app/.
 */
const RESERVED_ROOT_SEGMENTS = [
    'app',
    'new',
    'r',
    'share-target',
    'blog',
    'api',
    'healthcheck',
    'readiness',
    'icons',
    'fonts',
    'sw.js',
    'robots.txt',
    'sitemap.xml',
    'manifest.webmanifest',
    'icon.png',
    // Locale prefixes: the request proxy reads each as a language, so none can also be a page slug.
    ...PREFIXED_LOCALES,
]

/**
 * Slugs owned by a hand-built route, by a registered tool, or by Next itself — the content engine
 * must not shadow these.
 *
 * The tools are in here rather than in `STATIC_PAGES` because they are not hand-built pages: they
 * are one registry that `/[page]` resolves before the content tree, and the sitemap reads that
 * registry directly. What they share with a static route is the only thing this set is about — the
 * slug is taken, so a markdown file that claimed it would be listed and unreachable.
 */
export const staticPageSlugs = new Set([
    ...STATIC_PAGES.map((page) => page.href.replace(/^\//, '')).filter(Boolean),
    ...RESERVED_ROOT_SEGMENTS,
    ...TOOL_SLUGS,
])
