import { INDEXED_LOCALES, type Locale } from '@/i18n/locales'
import { guideAlternates, listSplitGuides, type SplitGuide } from './artifact'
import { splitContentIndexable, splitContentSourceReleased } from './indexability'

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
    return INDEXED_LOCALES.flatMap((locale) => listSplitGuides(locale, root)).filter((guide) =>
        splitContentIndexable(guide.href)
    )
}

/**
 * What a reader may be linked to, in one language: named by the release registry, runtime flag
 * ignored. The hub listing and the guide footer both answer from this, so their HTML is the same
 * on a dev box, in CI and in production — which is the only way anyone can check it before it
 * ships. The crawl-facing side (sitemap, hreflang, robots) keeps asking `releasedSplitGuides`.
 *
 * One locale per call: `loadSplitContentManifest` re-reads and re-validates all fifteen outputs
 * every time and is not memoised, so never ask three times where one answer will do.
 */
export function sourceReleasedSplitGuides(locale: Locale, root?: string): SplitGuide[] {
    return listSplitGuides(locale, root).filter((guide) => splitContentSourceReleased(guide.href))
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
