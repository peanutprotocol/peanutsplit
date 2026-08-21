import { brandCardResponse, contentOgImage, contentOgStaticParams, ogImageExports } from '@/lib/content-og'
import { ROOT_COLLECTIONS } from '@/lib/content'
import { toolStaticParams } from '@/lib/tool-routes'
import { getTool } from '@/tools/registry'

/** English root-slug unfurl, for articles and for tools. Implementation shared — see `lib/content-og`. */
const LOCALE = 'en' as const

// Literal, not `ogImageExports.runtime`: Next parses this export statically and rejects
// a member expression outright.
export const runtime = 'nodejs'
export const size = ogImageExports.size
export const contentType = ogImageExports.contentType
export const alt = 'Peanut Split'

const contentParams = contentOgStaticParams(ROOT_COLLECTIONS, LOCALE, 'page')
const ContentCard = contentOgImage(ROOT_COLLECTIONS, LOCALE, 'page')

// Mirrors the page route's contract: a slug outside the params set is a 404, not a card.
export const dynamicParams = false

export function generateStaticParams() {
    return [...toolStaticParams('page')(), ...contentParams()]
}

export default async function RootSlugOgImage(props: { params: Promise<Record<string, string>> }) {
    // Same walk as the page route, tools first. Without it a calculator shared into a group chat
    // unfurls under the site's own name rather than under the thing the link opens.
    const tool = getTool((await props.params).page)
    if (tool) return brandCardResponse(['SPLIT', 'IT'], tool.copy.h1)
    return ContentCard(props)
}
