/**
 * The recap unfurl — a chat client previewing `/r/<slug>/recap`, if a member
 * pastes it.
 *
 * This is the half of the recap card that Next owns end to end. It names the
 * segment (hashed, because `(product-shell)` is a route group), it appends the
 * cache-buster, and it writes the finished URL into the page's `<head>`.
 * `recapMetadata()` deliberately sets no `openGraph.images` so that injection is
 * what happens — a URL written by hand here would be a guess at a hash that
 * changes every build.
 *
 * The share button and the WRAPPED deck do NOT use this route, and cannot: they
 * hold a slug, and no hash is derivable from one. They fetch `recap/card`, a
 * plain Route Handler whose path is served verbatim. Both routes render through
 * `og/recapImage.tsx`, so there is one recap card with two doors — this file is
 * the metadata-convention door and holds nothing but the convention's exports.
 */
import { OG_CONTENT_TYPE, OG_SIZE } from '@/server/og/card'
import { recapImageResponse } from '@/server/og/recapImage'

// Prisma + `fs` for the fonts: this cannot run on the edge.
export const runtime = 'nodejs'
// Live room state, and the build has no database — never prerender this.
export const dynamic = 'force-dynamic'

export const alt = 'A Peanut Split trip recap'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function RecapOgImage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params
    return recapImageResponse(slug)
}
