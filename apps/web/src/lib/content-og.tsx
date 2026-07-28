import { ImageResponse } from 'next/og'
import { BrandCard, OG_CONTENT_TYPE, OG_SIZE } from '@/server/og/card'
import { BODY_CHARS, ogFonts } from '@/server/og/fonts'
import { getDoc, listSlugs, type Collection } from '@/lib/content'
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

export function contentOgStaticParams(collection: Collection, locale: Locale, paramName: 'slug' | 'alternative') {
    return function generateStaticParams() {
        return listSlugs(collection, locale).map((slug) => ({ [paramName]: slug }))
    }
}

export function contentOgImage(collection: Collection, locale: Locale, paramName: 'slug' | 'alternative') {
    return async function ContentOgImage({ params }: { params: Promise<Record<string, string>> }) {
        const resolved = await params
        const doc = getDoc(collection, resolved[paramName], locale)
        const lines: readonly [string, string] = collection === 'blog' ? ['SPLIT', 'GUIDES'] : ['SPLIT', 'IT']

        return new ImageResponse(
            <BrandCard lines={lines} tagline={drawable(doc?.frontmatter.title ?? 'Peanut Split')} />,
            { ...OG_SIZE, fonts: await ogFonts() }
        )
    }
}
