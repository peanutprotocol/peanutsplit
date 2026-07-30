import type { Metadata } from 'next'
import { pageMetadata, pageTitle } from '@/lib/seo'
import { TOOLS, toolPath } from '@/tools/registry'
import type { Tool } from '@/tools/types'
import type { ParamName } from '@/lib/content-routes'

/**
 * What `/[page]` needs to serve a tool. The mirror of `content-routes.tsx`, minus everything that
 * only an article has.
 *
 * There is no locale parameter here and no hreflang: tools are English-only for now, and a page
 * that advertised a Spanish alternate it does not have would be worse than one that advertises
 * nothing. When a tool is translated, the copy block gets a locale dimension and this grows a
 * parameter — not before.
 *
 * `type: 'website'` rather than `article`: a calculator has no publication date, and OG article
 * timestamps on a page that is never "published" are metadata nobody can keep true.
 */

export function toolStaticParams(paramName: ParamName) {
    return () => TOOLS.map((tool) => ({ [paramName]: tool.slug }))
}

export function toolMetadata(tool: Tool): Metadata {
    return pageMetadata({
        title: pageTitle(tool.meta.title),
        description: tool.meta.description,
        path: toolPath(tool),
        type: 'website',
    })
}
