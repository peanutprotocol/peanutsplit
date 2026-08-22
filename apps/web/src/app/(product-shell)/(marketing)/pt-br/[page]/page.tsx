import type { Metadata } from 'next'
import { articleMetadata, articlePage, articleStaticParams } from '@/lib/content-routes'
import { ROOT_COLLECTIONS } from '@/lib/content'
import { toolMetadata, toolStaticParams } from '@/lib/tool-routes'
import { ToolPage } from '@/components/tools/ToolPage'
import { getTool } from '@/tools/registry'

/**
 * Portuguese pages served from a root-level slug — comparison pages, intent-capture pages and the
 * calculators, because that is the shape of the query and a folder in front of it would bury the
 * head term. The English route's docstring carries the full reasoning; this file only says which
 * language it is.
 *
 * A tool that has no words in this language is not registered here, so it 404s rather than
 * rendering the English calculator at a pt-br URL — the same no-fallback rule the content tree
 * runs on.
 */
const LOCALE = 'pt-br' as const

const toolParams = toolStaticParams('page', LOCALE)
const articleParams = articleStaticParams(ROOT_COLLECTIONS, LOCALE, 'page')
const articleMeta = articleMetadata(ROOT_COLLECTIONS, LOCALE, 'page')
const ArticleRoute = articlePage(ROOT_COLLECTIONS, LOCALE, 'page')

interface PageParams {
    params: Promise<Record<string, string>>
}

export const dynamicParams = false

export function generateStaticParams() {
    return [...toolParams(), ...articleParams()]
}

export async function generateMetadata(props: PageParams): Promise<Metadata> {
    const tool = getTool((await props.params).page, LOCALE)
    return tool ? toolMetadata(tool, LOCALE) : articleMeta(props)
}

export default async function RootSlugPage(props: PageParams) {
    const tool = getTool((await props.params).page, LOCALE)
    return tool ? <ToolPage tool={tool} locale={LOCALE} /> : ArticleRoute(props)
}
