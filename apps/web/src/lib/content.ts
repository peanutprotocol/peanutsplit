import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { staticPageSlugs } from '@/data/static-pages'
import { DEFAULT_LOCALE, LOCALES, isLocale, type Locale } from '@/i18n/locales'
import { localizedPath } from '@/i18n/paths'

/**
 * Split's content engine. Same shape as the one on peanut.me — markdown + frontmatter on disk,
 * MDX components in the body, routes and sitemap derived from the directory — but deliberately
 * NOT shared with it. peanut.me reads a mirror of `mono/content/` through a git submodule and a
 * generation pipeline; Split owns its articles outright, in this repo, in this folder. Split
 * must never inherit a content change it did not ask for, so the duplication is the point.
 *
 * Layout: `src/content/{collection}/{slug}/{locale}.md` — a directory per article, a file per
 * language, locale codes taken from `@/i18n/locales` so there is exactly one list of locales in
 * the repo. peanut.me nests the same way for the same reason.
 *
 * **No fallback to English.** peanut.me renders the English body at a Spanish URL when the
 * translation is missing; that publishes the same text at two addresses and lets Google decide
 * which one to drop. Here, a locale a page has no file for simply has no page: the route 404s,
 * the sitemap omits it, the hub does not list it, and hreflang never points at it. Partial
 * translation is a normal state, and this is what makes it a safe one.
 *
 * Publishing an article is: drop `{slug}/en.md` in, push. Translating one is: drop `es.md` in
 * beside it. `generateStaticParams` and `sitemap.ts` both derive from the directory, so neither
 * has a list to update.
 */

/**
 * Resolved per call rather than once at module load. Next runs the build from the app root so
 * either would work in production, but a frozen root cannot be pointed at a fixture tree — which
 * is what let the loader's draft/malformed/shadowed handling go untested.
 */
const contentRoot = () => path.join(process.cwd(), 'src/content')

/** The collections that have a route. Adding one means adding a route; keep the two in step. */
export const COLLECTIONS = ['blog', 'alternatives'] as const
export type Collection = (typeof COLLECTIONS)[number]

export interface Faq {
    question: string
    answer: string
}

export interface Frontmatter {
    /** <h1> and the base of the <title>. */
    title: string
    /** Meta description and the hub-card subtitle. Aim for 140–160 chars. */
    description: string
    /** ISO date (YYYY-MM-DD). Sitemap lastModified, article schema datePublished, hub sort key. */
    date: string
    /** ISO date of the last meaningful edit. Falls back to `date`. */
    updated?: string
    /** Byline. Organization-level by default — Split has no author pages. */
    author?: string
    /** Free-form, shown as chips on the hub. */
    tags?: string[]
    /** Lifted into FAQPage JSON-LD and rendered by the <Faq> component if the body uses one. */
    faqs?: Faq[]
    /** Set false to keep a draft in the repo but out of routes, sitemap and hub. */
    published?: boolean
    /** Overrides the derived canonical path. Only needed for pages that moved. */
    canonical?: string
}

export interface Doc {
    collection: Collection
    slug: string
    /** The language this doc was written in. Never a fallback — the file exists or the doc does not. */
    locale: Locale
    /** Path the page is served at, leading slash, no origin, locale prefix included. */
    href: string
    frontmatter: Frontmatter
    /** Markdown/MDX body with frontmatter stripped. */
    body: string
}

/**
 * URL shape per collection. Blog posts sit under /blog/; alternative pages sit at the root
 * because that is what the query looks like ("splitwise alternative") and a /compare/ prefix
 * buys nothing. Root-level slugs are safe: Next matches the static segments (/new, /r, /blog,
 * /api) before the dynamic one, and the route pins `dynamicParams = false`.
 *
 * The locale prefix goes on the front for everything but English — see `@/i18n/paths`.
 */
export function hrefFor(collection: Collection, slug: string, locale: Locale = DEFAULT_LOCALE): string {
    const base = collection === 'blog' ? `/blog/${slug}` : `/${slug}`
    return localizedPath(base, locale)
}

function collectionDir(collection: Collection): string {
    return path.join(contentRoot(), collection)
}

/** `src/content/{collection}/{slug}/{locale}.md` */
function docPath(collection: Collection, slug: string, locale: Locale): string {
    return path.join(collectionDir(collection), slug, `${locale}.md`)
}

/**
 * Which languages this article actually exists in, English first. Drives hreflang and the
 * language links on the page, so it must reflect files on disk rather than the locale list —
 * offering a translation that is not there is worse than offering none.
 */
export function localesForSlug(collection: Collection, slug: string): Locale[] {
    let entries: string[]
    try {
        entries = fs.readdirSync(path.join(collectionDir(collection), slug))
    } catch {
        return []
    }
    const present = new Set(entries.filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')))
    // Ordered by LOCALES, not by readdir — directory order is filesystem-dependent and would
    // make the rendered hreflang block change between machines for no reason.
    return LOCALES.filter((locale) => present.has(locale))
}

/** A frontmatter date may come back from YAML as a Date; the rest of the app wants YYYY-MM-DD. */
function coerceDate(value: unknown): string {
    if (value instanceof Date) return value.toISOString().slice(0, 10)
    return typeof value === 'string' ? value : ''
}

function coerceFaqs(value: unknown): Faq[] | undefined {
    if (!Array.isArray(value)) return undefined
    const faqs = value.filter(
        (item): item is Faq =>
            !!item && typeof item.question === 'string' && typeof item.answer === 'string' && !!item.question.trim()
    )
    return faqs.length ? faqs : undefined
}

/**
 * Parse one file. Returns null for anything unreadable or missing a title/description, so a
 * half-written article can sit in the tree without breaking the build or the sitemap. Content
 * is a publishing surface, not a code path — it should fail quiet and visible, not loud.
 */
function parseDoc(collection: Collection, slug: string, locale: Locale): Doc | null {
    // A slug reaches this from a route param. `dynamicParams = false` already pins the match set,
    // but the loader should not be the thing relying on that — `../` in a slug would otherwise
    // walk out of the content tree and produce a doc with a nonsense href.
    //
    // The typeof check is load-bearing and was learned the hard way: a route reading the wrong
    // param name hands this `undefined`, `.test()` stringifies that to "undefined", which matches
    // the pattern, and `path.join` then throws on a non-string — a 500 where a 404 belonged.
    if (typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null
    // Same reasoning for the locale, which is a path segment on every non-English route.
    if (!isLocale(locale)) return null

    const filePath = docPath(collection, slug, locale)

    // Both the read and the YAML parse are inside the guard. gray-matter throws on malformed
    // frontmatter, and a half-written article must not be able to fail `next build` — every
    // caller here (sitemap, generateStaticParams, the hub) runs at build time.
    let data: Record<string, unknown>
    let content: string
    try {
        const parsed = matter(fs.readFileSync(filePath, 'utf8'))
        data = parsed.data
        content = parsed.content
    } catch {
        return null
    }

    const title = typeof data.title === 'string' ? data.title.trim() : ''
    const description = typeof data.description === 'string' ? data.description.trim() : ''
    const date = coerceDate(data.date)
    // A dateless article emits an empty datePublished into BlogPosting schema, which is worse
    // than not publishing it — so the date is required, not defaulted.
    if (!title || !description || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null

    return {
        collection,
        slug,
        locale,
        href: hrefFor(collection, slug, locale),
        frontmatter: {
            title,
            description,
            date,
            updated: data.updated ? coerceDate(data.updated) : undefined,
            author: typeof data.author === 'string' ? data.author : undefined,
            tags: Array.isArray(data.tags) ? data.tags.filter((t): t is string => typeof t === 'string') : undefined,
            faqs: coerceFaqs(data.faqs),
            published: data.published !== false,
            canonical: typeof data.canonical === 'string' ? data.canonical : undefined,
        },
        body: content.trim(),
    }
}

/**
 * Read the collection off disk. No cache: `next build` reads each collection a handful of
 * times and dev wants edits picked up without a restart. If this ever shows up in build
 * profiles, memoise on (collection, mtime) — not on collection alone.
 */
function readCollection(collection: Collection, locale: Locale): Doc[] {
    let entries: fs.Dirent[]
    try {
        entries = fs.readdirSync(collectionDir(collection), { withFileTypes: true })
    } catch {
        return []
    }

    return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => parseDoc(collection, entry.name, locale))
        .filter((doc): doc is Doc => doc !== null)
}

/**
 * A root-level markdown slug that collides with a hand-built route is unreachable — Next matches
 * the static segment first — so it must not be listed or sitemapped either. Blog slugs live under
 * /blog/ and cannot collide.
 */
function isShadowed(doc: Doc): boolean {
    return doc.collection !== 'blog' && staticPageSlugs.has(doc.slug)
}

/**
 * Published docs in a collection for one language, newest first. The only listing the app should
 * use. A doc with no file in `locale` is absent, not substituted — see the module docstring.
 */
export function listDocs(collection: Collection, locale: Locale = DEFAULT_LOCALE): Doc[] {
    return readCollection(collection, locale)
        .filter((doc) => doc.frontmatter.published !== false && !isShadowed(doc))
        .sort((a, b) => b.frontmatter.date.localeCompare(a.frontmatter.date))
}

/** Published slugs in a collection — what generateStaticParams and the sitemap iterate. */
export function listSlugs(collection: Collection, locale: Locale = DEFAULT_LOCALE): string[] {
    return listDocs(collection, locale).map((doc) => doc.slug)
}

/** One published doc, or null. Unpublished, shadowed or untranslated all read as missing. */
export function getDoc(collection: Collection, slug: string, locale: Locale = DEFAULT_LOCALE): Doc | null {
    const doc = parseDoc(collection, slug, locale)
    if (!doc || doc.frontmatter.published === false || isShadowed(doc)) return null
    return doc
}

/** Everything published in one language, across collections, newest first. Powers the hub. */
export function listAllDocs(locale: Locale = DEFAULT_LOCALE): Doc[] {
    return COLLECTIONS.flatMap((collection) => listDocs(collection, locale)).sort((a, b) =>
        b.frontmatter.date.localeCompare(a.frontmatter.date)
    )
}

/**
 * Every (collection, slug, locale) that has a file — the sitemap's whole input, and what proves
 * a translation is reachable. Published-gated per locale: a draft `es.md` beside a live `en.md`
 * hides only the Spanish URL.
 */
export function listAllTranslations(): Doc[] {
    return COLLECTIONS.flatMap((collection) => LOCALES.flatMap((locale) => listDocs(collection, locale)))
}
