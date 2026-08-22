import type { Metadata } from 'next'
import { absoluteLanguages, pageMetadata, pageTitle } from '@/lib/seo'
import { toolLocales, toolPath, toolsIn } from '@/tools/registry'
import type { Tool } from '@/tools/types'
import type { ParamName } from '@/lib/content-routes'
import { hreflangAlternates } from '@/i18n/paths'
import type { IndexedLocale } from '@/i18n/locales'

/**
 * What `/[page]` needs to serve a tool. The mirror of `content-routes.tsx`, minus everything that
 * only an article has.
 *
 * Locale works exactly as it does for an article, and for the same reason: hreflang lists the
 * languages the tool is written in and no others, English keeps its bare path, and an untranslated
 * calculator 404s in a locale rather than rendering English copy at a Spanish URL.
 *
 * `type: 'website'` rather than `article`: a calculator has no publication date, and OG article
 * timestamps on a page that is never "published" are metadata nobody can keep true.
 */

export function toolStaticParams(paramName: ParamName, locale: IndexedLocale) {
    return () => toolsIn(locale).map((tool) => ({ [paramName]: tool.slug }))
}

export function toolMetadata(tool: Tool, locale: IndexedLocale): Metadata {
    const meta = pageMetadata({
        title: pageTitle(tool.meta.title),
        description: tool.meta.description,
        path: toolPath(tool, locale),
        type: 'website',
        locale,
    })
    return {
        ...meta,
        alternates: {
            ...meta.alternates,
            languages: absoluteLanguages(hreflangAlternates(`/${tool.slug}`, toolLocales(tool))),
        },
    }
}
