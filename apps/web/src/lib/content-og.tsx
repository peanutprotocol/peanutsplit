import { ImageResponse } from 'next/og'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { BrandCard, OG_CONTENT_TYPE, OG_SIZE } from '@/server/og/card'
import { BODY_CHARS, ogFonts } from '@/server/og/fonts'
import { getDoc, isDocAvailable, listSlugs } from '@/lib/content'
import { getSplitGuide, listSplitGuides } from '@/lib/split-content/artifact'
import type { ParamName, RouteCollections } from '@/lib/content-routes'
import type { Locale } from '@/i18n/locales'

/**
 * Unfurl cards for content pages, one per (collection, locale).
 *
 * An article shared into a group chat is the whole distribution mechanism, so a linkless grey box
 * is a share that does not get clicked. The title goes in the tagline slot rather than the two
 * display lines: those are Gluten at 108px, sized for "SPLIT ANYTHING", and a sentence would
 * overflow them. The display lines stay ASCII for the same reason they always were.
 *
 * Accents are safe here — Sniglet, the tagline face, covers all of Latin-1, so Spanish and
 * Portuguese titles render. Anything outside that set is dropped rather than drawn, because
 * Satori has no fallback chain and no tofu box: an unmapped codepoint silently vanishes or comes
 * out as a blank rectangle. Sanitizing is what keeps a bad character from eating a word.
 */

/**
 * `size` and `contentType` can be re-exported; `runtime` cannot — Next parses that one out of the
 * AST and rejects anything but a literal, so every route spells it out.
 */
export const ogImageExports = {
    size: OG_SIZE,
    contentType: OG_CONTENT_TYPE,
}

/** Keep only what the body font can actually draw; collapse the gaps a drop would leave. */
function drawable(text: string): string {
    return (
        [...text]
            .map((ch) => (BODY_CHARS.has(ch) ? ch : ' '))
            .join('')
            .replace(/\s+/g, ' ')
            .trim() || 'Peanut Split'
    )
}

/**
 * Unfurl for a translated guides hub.
 *
 * The English hub has its own file; `/es-419/blog` and `/pt-br/blog` had none and were therefore
 * sharing as a blank card — a metadata image file is NOT inherited across route segments, so a
 * segment without one simply emits no `og:image`. The tagline is the hub's own description from
 * the catalog rather than a second string to keep in step, and it goes through `drawable` because
 * the accented Spanish and Portuguese lines are only safe up to Latin-1.
 */
/**
 * One brand card, sanitized and with the fonts loaded. Every unfurl on the site goes through it so
 * "which lines, which tagline" is the only thing a caller decides — the font load and the
 * `drawable()` pass are not decisions, and a route that skipped either would ship a card with a
 * blank rectangle in the middle of a word.
 */
export async function brandCardResponse(lines: readonly [string, string], tagline: string) {
    return new ImageResponse(<BrandCard lines={lines} tagline={drawable(tagline)} />, {
        ...OG_SIZE,
        fonts: await ogFonts(),
    })
}

export function hubOgImage(locale: Locale) {
    return async function HubOgImage() {
        const t = await getTranslations({ locale, namespace: 'content' })
        return brandCardResponse(['SPLIT', 'GUIDES'], t('hubDescription'))
    }
}

/**
 * Unfurl for a generated guide. The title rides the tagline slot for the same reason a blog
 * post's does: the display lines are Gluten at 108px and a sentence overflows them.
 *
 * A slug the manifest does not list is a 404, like the page it decorates — a card that renders
 * for any slug is an image endpoint the page contract never promised.
 */
export function splitGuideOgImage(locale: Locale) {
    return async function SplitGuideOgImage({ params }: { params: Promise<{ slug: string }> }) {
        const guide = getSplitGuide(locale, (await params).slug)
        if (!guide) notFound()
        return brandCardResponse(['SPLIT', 'GUIDES'], guide.title)
    }
}

export function splitGuideOgStaticParams(locale: Locale) {
    return function generateStaticParams() {
        return listSplitGuides(locale).map((guide) => ({ slug: guide.slug }))
    }
}

export function contentOgStaticParams(collections: RouteCollections, locale: Locale, paramName: ParamName) {
    return function generateStaticParams() {
        return collections.flatMap((collection) => listSlugs(collection, locale).map((slug) => ({ [paramName]: slug })))
    }
}

export function contentOgImage(collections: RouteCollections, locale: Locale, paramName: ParamName) {
    return async function ContentOgImage({ params }: { params: Promise<Record<string, string>> }) {
        const resolved = await params
        // Same walk as the page route: the root slot serves more than one collection, so which one
        // owns the slug is a question for the tree, not a constant.
        const slug = resolved[paramName]
        const doc = collections.map((collection) => getDoc(collection, slug, locale)).find((found) => found !== null)
        if (doc && !isDocAvailable(doc)) notFound()
        const lines: readonly [string, string] = doc?.collection === 'blog' ? ['SPLIT', 'GUIDES'] : ['SPLIT', 'IT']

        return brandCardResponse(lines, doc?.frontmatter.title ?? 'Peanut Split')
    }
}
