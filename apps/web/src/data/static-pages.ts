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
]

/** Slugs owned by a hand-built route — the content engine must not shadow these. */
export const staticPageSlugs = new Set(STATIC_PAGES.map((page) => page.href.replace(/^\//, '')).filter(Boolean))
