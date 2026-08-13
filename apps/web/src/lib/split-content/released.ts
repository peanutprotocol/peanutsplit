import { LOCALES } from '@/i18n/locales'
import { guideAlternates, listSplitGuides, type SplitGuide } from './artifact'
import { splitContentIndexable } from './indexability'

/**
 * What this deployment is allowed to advertise: rendered from the artifact, named by the reviewed
 * release registry, and runtime-enabled. Everything else still renders — it just stays out of the
 * sitemap and keeps its noindex.
 *
 * The proxy cannot use any of this: it runs on the edge runtime and `artifact.ts` reads the
 * filesystem. It asks `splitContentIndexable` directly, which is the same policy without the
 * manifest.
 */
export function releasedSplitGuides(root?: string): SplitGuide[] {
    return LOCALES.flatMap((locale) => listSplitGuides(locale, root)).filter((guide) =>
        splitContentIndexable(guide.href)
    )
}

/**
 * A released page's hreflang set with every parked translation removed.
 *
 * `guideAlternates` answers from the artifact, which holds all fifteen guides — six of them
 * permanently noindex. Advertising one of those as the Spanish version of an indexed page points
 * a crawler at a page that tells it to leave, which is worse than saying nothing. `x-default`
 * repeats the English path, so the same filter removes it when English is parked.
 *
 * Fewer than two real languages left is not a set of alternates: a lone self-referential hreflang
 * offers no choice and is ignored anyway, so it comes back undefined instead.
 */
export function releasedGuideAlternates(slug: string, root?: string): Record<string, string> | undefined {
    const alternates = guideAlternates(slug, root)
    if (!alternates) return undefined

    const released = Object.entries(alternates).filter(([, publicPath]) => splitContentIndexable(publicPath))
    if (released.filter(([hreflang]) => hreflang !== 'x-default').length < 2) return undefined
    return Object.fromEntries(released)
}
