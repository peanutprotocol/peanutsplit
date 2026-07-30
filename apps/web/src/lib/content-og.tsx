import { ImageResponse } from 'next/og'
import { getTranslations } from 'next-intl/server'
import { BrandCard, OG_CONTENT_TYPE, OG_SIZE } from '@/server/og/card'
import { BODY_CHARS, ogFonts } from '@/server/og/fonts'
import { getDoc, listSlugs } from '@/lib/content'
import type { ParamName, RouteCollections } from '@/lib/content-routes'
import type { Locale } from '@/i18n/locales'

/**
 * Unfurl cards for content pages, one per (collection, locale).
 *
 * An article shared into a group chat is the whole distribution mechanism, so a linkless grey box
 * is a share that does not get clicked. The title goes in the tagline slot rather than the two
 * display lines: those are Knerd at 108px, sized for "SPLIT ANYTHING", and a sentence would
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
 * The English hub has its own file; `/es/blog` and `/pt-br/blog` had none and were therefore
 * sharing as a blank card — a metadata image file is NOT inherited across route segments, so a
 * segment without one simply emits no `og:image`. The tagline is the hub's own description from
 * the catalog rather than a second string to keep in step, and it goes through `drawable` because
 * the accented Spanish and Portuguese lines are only safe up to Latin-1.
 */
export function hubOgImage(locale: Locale) {
    return async function HubOgImage() {
        const t = await getTranslations({ locale, namespace: 'content' })
        return new ImageResponse(<BrandCard lines={['SPLIT', 'GUIDES']} tagline={drawable(t('hubDescription'))} />, {
            ...OG_SIZE,
            fonts: await ogFonts(),
        })
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
        const lines: readonly [string, string] = doc?.collection === 'blog' ? ['SPLIT', 'GUIDES'] : ['SPLIT', 'IT']

        return new ImageResponse(
            <BrandCard lines={lines} tagline={drawable(doc?.frontmatter.title ?? 'Peanut Split')} />,
            { ...OG_SIZE, fonts: await ogFonts() }
        )
    }
}
