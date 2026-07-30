import { TOOL_SLUGS } from '@/tools/registry'

/**
 * The hand-built pages, registered so the sitemap and the /blog hub don't have to special-case
 * them. Two implementations of a marketing page coexist on purpose: the flagship pages are
 * bespoke React (they carry interactive comparison tables and copy that is argued over line by
 * line), and the long tail is markdown through the content engine. This file is the seam.
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
    /** Kept reserved and buildable, but omitted from v1 discovery. */
    v2Only?: boolean
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
        href: '/splitwise-alternative',
        title: 'Splitwise alternative',
        description: "What Splitwise's own Pro page says it puts behind a paywall, and what Split does instead.",
        priority: 0.8,
        inHub: true,
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
        // A tool, not a guide, so it stays off the /blog hub — but it answers a real query
        // ("import splitwise") and is the page a switching group lands on, so it is sitemapped
        // high. Registering it here is also what stops a `src/content/import.md` from ever
        // shadowing a root-level route Next already owns.
        href: '/import',
        title: 'Import from Splitwise',
        description: 'Turn a Splitwise group export into a Split room — expenses, payers and balances intact.',
        priority: 0.8,
        inHub: false,
        v2Only: true,
    },
]

/**
 * Every root-level path Next already owns. A markdown slug matching one of these would be
 * unreachable — the static segment wins — while still being listed on the hub and in the
 * sitemap, which is worse than a plain 404 because it advertises a page that cannot be opened.
 *
 * STATIC_PAGES alone is not enough: it only knows about marketing pages, not about `/new`,
 * `/api` or the metadata routes. Keep this in step with the top level of src/app/.
 */
const RESERVED_ROOT_SEGMENTS = [
    'new',
    'r',
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
