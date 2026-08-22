import { notFound } from 'next/navigation'
import { brandCardResponse, ogImageExports } from '@/lib/content-og'
import { getToolCountry, toolCountryParams } from '@/lib/tool-routes'

/** A country page's unfurl, under the name of the thing the link opens — see `lib/content-og`. */

// Literal, not `ogImageExports.runtime`: Next parses this export statically and rejects
// a member expression outright.
export const runtime = 'nodejs'
export const size = ogImageExports.size
export const contentType = ogImageExports.contentType
export const alt = 'Peanut Split'

// Mirrors the page route's contract: a pair outside the params set is a 404, not a card.
export const dynamicParams = false

export const generateStaticParams = toolCountryParams('page', 'country')

export default async function ToolCountryOgImage(props: { params: Promise<Record<string, string>> }) {
    const { page, country } = await props.params
    const found = getToolCountry(page, country)
    if (!found) notFound()
    return brandCardResponse(['SPLIT', 'IT'], found.tool.copy.h1)
}
