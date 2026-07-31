import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ArticleLayout } from '@/components/marketing/ArticleLayout'
import {
    basePathFor,
    getDoc,
    isDocAvailable,
    listSlugs,
    localesForSlug,
    type Collection,
    type Doc,
} from '@/lib/content'
import { renderArticle } from '@/lib/mdx'
import { pageMetadata, pageTitle } from '@/lib/seo'
import { hreflangAlternates, localizedPath } from '@/i18n/paths'
import { LOCALES, type Locale } from '@/i18n/locales'

/**
 * One implementation of the article page, bound to a locale and a set of collections by the route
 * that imports it.
 *
 * The alternative was a `[locale]` segment, and it is not available: `[page]` already occupies the
 * root dynamic slot, and Next rejects two differently-named dynamic segments at the same path
 * position. So each language gets a real folder (`es-419/`, `pt-br/`) holding six-line files that call
 * these builders. The folders are the only thing duplicated per locale, and a folder that exists is
 * easier to reason about than a segment that has to be told what it is.
 *
 * That same one-dynamic-name-per-position rule is why a route is handed a LIST of collections
 * rather than one. Every root-level collection has to be served by `/[page]`, so the route cannot
 * know which collection a slug belongs to — it asks the tree.
 *
 * The shared chrome — footer, switcher, anything on `useTranslations` — follows the URL's language
 * because `middleware.ts` puts it in a header that `i18n/request.ts` reads. Nothing here has to
 * pass a locale down; `getTranslations({ locale })` is used only where this module already knows
 * the language and wants to be explicit about it.
 */

/**
 * The route's own param name. `/blog/[slug]` calls it `slug`; the root-level `/[page]` calls it
 * `page`, and reading the wrong one hands the loader `undefined` — which used to be a 500 where a
 * 404 belonged (see the typeof guard in `content.ts`). Every builder takes it explicitly so the
 * folder name and the read are edited in the same line.
 */
export type ParamName = 'slug' | 'page'

/**
 * The collections one route serves. `/blog/[slug]` serves exactly one; `/[page]` serves every
 * root-level collection. Non-empty by type so a route cannot be wired to nothing.
 */
export type RouteCollections = readonly [Collection, ...Collection[]]

interface ArticleParams {
    params: Promise<Record<string, string>>
}

/**
 * First collection that has this slug in this language, or null. Availability is folded in here
 * so a v2-only page in one collection cannot mask a live page of the same slug in another.
 */
function resolveDoc(collections: RouteCollections, slug: string, locale: Locale): Doc | null {
    for (const collection of collections) {
        const doc = getDoc(collection, slug, locale)
        if (doc && isDocAvailable(doc)) return doc
    }
    return null
}

/** Crumb labels come from the catalog so the trail is not English inside a Spanish page. */
async function crumbsFor(locale: Locale, collection: Collection, title: string, href: string) {
    const t = await getTranslations({ locale, namespace: 'content' })
    // Bare `/`, never `localizedPath('/', locale)`: the landing is app shell, so it answers at one
    // URL in every language (see `@/i18n/paths`) and there is no route at `/es-419` or `/pt-br`. The
    // prefixed version 404s — in the rendered trail AND in the BreadcrumbList it feeds.
    const home = { name: t('home'), href: '/' }
    const article = { name: title, href }
    if (collection === 'blog') {
        return [home, { name: t('guides'), href: localizedPath('/blog', locale) }, article]
    }
    return [home, article]
}

/**
 * hreflang is built from the files that exist, so a page translated into two of three languages
 * advertises two. `pageMetadata` writes the canonical; these are the alternates beside it.
 */
function alternatesFor(collection: Collection, slug: string, locale: Locale) {
    return hreflangAlternates(basePathFor(collection, slug), localesForSlug(collection, slug))
}

export function articleMetadata(collections: RouteCollections, locale: Locale, paramName: ParamName) {
    return async function generateMetadata({ params }: ArticleParams): Promise<Metadata> {
        const slug = (await params)[paramName]
        const doc = resolveDoc(collections, slug, locale)
        if (!doc) return {}

        const meta = pageMetadata({
            title: pageTitle(doc.frontmatter.title),
            description: doc.frontmatter.description,
            path: doc.frontmatter.canonical ?? doc.href,
            type: 'article',
            publishedTime: doc.frontmatter.date,
            modifiedTime: doc.frontmatter.updated,
            locale,
        })
        return {
            ...meta,
            alternates: { ...meta.alternates, languages: alternatesFor(doc.collection, slug, locale) },
        }
    }
}

/**
 * The guides hub, per locale. Three files differed only in their `LOCALE` and in a hand-written
 * path that `localizedPath` already knows how to produce — which is exactly the kind of literal
 * that survives a route rename.
 *
 * Unlike an article, the hub exists in every language by construction, so it always advertises
 * the full set of alternates.
 */
export function hubMetadata(locale: Locale) {
    return async function generateMetadata(): Promise<Metadata> {
        const t = await getTranslations({ locale, namespace: 'content' })
        const meta = pageMetadata({
            title: pageTitle(t('hubTitle')),
            description: t('hubDescription'),
            path: localizedPath('/blog', locale),
            type: 'website',
            locale,
        })
        return { ...meta, alternates: { ...meta.alternates, languages: hreflangAlternates('/blog', [...LOCALES]) } }
    }
}

export function articleStaticParams(collections: RouteCollections, locale: Locale, paramName: ParamName) {
    return function generateStaticParams() {
        return collections.flatMap((collection) => listSlugs(collection, locale).map((slug) => ({ [paramName]: slug })))
    }
}

export function articlePage(collections: RouteCollections, locale: Locale, paramName: ParamName) {
    return async function ArticlePage({ params }: ArticleParams) {
        const slug = (await params)[paramName]
        const doc = resolveDoc(collections, slug, locale)
        // Untranslated is indistinguishable from missing on purpose: no English body ever renders
        // at a Spanish URL, so there is no duplicate content to disambiguate later.
        if (!doc) notFound()

        const body = await renderArticle(doc.body)
        const crumbs = await crumbsFor(locale, doc.collection, doc.frontmatter.title, doc.href)

        return (
            <ArticleLayout doc={doc} crumbs={crumbs} translations={localesForSlug(doc.collection, slug)}>
                {body}
            </ArticleLayout>
        )
    }
}
