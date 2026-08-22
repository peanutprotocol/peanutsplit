import type { Metadata } from 'next'
import { absoluteLanguages, pageMetadata, pageTitle } from '@/lib/seo'
import { toolLocales, toolPath, toolsIn } from '@/tools/registry'
import type { Tool } from '@/tools/types'
import type { ParamName } from '@/lib/content-routes'
import { MILEAGE_COUNTRY_PAGES, type MileageCountryPage } from '@/tools/mileage-split-calculator.countries'
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

/**
 * The country pages under a calculator's own slug — `/mileage-split-calculator/uk`.
 *
 * English only in this version: they answer English queries, so they carry no hreflang, and
 * `/es-419/{slug}/{country}` is not a route rather than being an English page at a Spanish URL.
 */
const COUNTRY_LOCALE = 'en' satisfies IndexedLocale

export function toolCountryParams(paramName: ParamName, countryParam: string) {
    return () => MILEAGE_COUNTRY_PAGES.map((page) => ({ [paramName]: page.toolSlug, [countryParam]: page.slug }))
}

/**
 * The page for a pair of route params, or null. Unvalidated on both sides, like `getTool`: a
 * country nobody researched, a calculator with no country family, and a missing param all have to
 * read as "not a page" so the route can 404 rather than throw.
 */
export function getToolCountry(slug: string | undefined, country: string | undefined): MileageCountryPage | null {
    return MILEAGE_COUNTRY_PAGES.find((page) => page.toolSlug === slug && page.slug === country) ?? null
}

export function toolCountryMetadata(page: MileageCountryPage): Metadata {
    return pageMetadata({
        title: pageTitle(page.tool.meta.title),
        description: page.tool.meta.description,
        path: page.path,
        type: 'website',
        locale: COUNTRY_LOCALE,
    })
}
